import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark as ContractLandmark, FormScore, RepEvent, CoachingCue } from "@ai-rehab/contracts";
import {
  LandmarkSmoother,
  computeJointAngles,
  computeCaptureQuality,
  createRepSegmenterState,
  stepRepSegmenter,
  scoreRep,
  selectCue,
  evaluateSafety,
  type CueCooldownState,
  type RepSegmenterState
} from "@ai-rehab/core";
import { getExerciseSpec } from "@ai-rehab/exercises";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./protocol.js";

/**
 * The fast loop (ARCHITECTURE.md §4), entirely inside a Web Worker so the
 * main thread stays free for rendering. Runs MediaPipe PoseLandmarker, then
 * the full packages/core pipeline: smoothing -> joint angles -> rep
 * segmentation -> form scoring -> cue selection -> safety gate. No model
 * call anywhere in this per-frame path except the pose landmarker itself
 * (ADR-0001) — cue text always comes from the exercise spec's cue table.
 *
 * Typed narrowly against `globalThis` rather than pulling in the
 * `WebWorker` lib: that lib's ambient globals conflict with the `DOM` lib
 * the rest of the app's tsconfig needs, and this file only ever touches
 * `postMessage`/`onmessage`/`close` — not worth a second tsconfig.
 */
const ctx = globalThis as unknown as {
  postMessage: (msg: WorkerToMainMessage) => void;
  onmessage: ((ev: MessageEvent<MainToWorkerMessage>) => void) | null;
};

// Pinned to the installed @mediapipe/tasks-vision version so the wasm
// runtime and the JS bindings never drift apart.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
// `lite` per docs/adr/0007-pose-model-tier.md — chosen as the safest default
// pending the real M0 device spike (fps/jitter on the actual device floor),
// which this environment cannot run without physical hardware.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const PASS_SCORE_THRESHOLD = 50; // mirrors packages/eval/src/replay.ts

let landmarker: PoseLandmarker | null = null;
let smoother = new LandmarkSmoother();
let segState: RepSegmenterState = createRepSegmenterState();
let cooldownState: CueCooldownState = {};
let consecutiveFailedReps = 0;
let currentExerciseId: string | null = null;
let luminanceCanvas: OffscreenCanvas | null = null;

function toContractLandmarks(
  raw: ReadonlyArray<{ x: number; y: number; z: number; visibility?: number }>
): ContractLandmark[] {
  return raw.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 }));
}

function resetSessionState(): void {
  smoother = new LandmarkSmoother();
  segState = createRepSegmenterState();
  cooldownState = {};
  consecutiveFailedReps = 0;
}

async function init(exerciseId: string): Promise<void> {
  try {
    const spec = getExerciseSpec(exerciseId);
    if (!spec) throw new Error(`unknown exercise "${exerciseId}"`);

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1
    });

    currentExerciseId = exerciseId;
    resetSessionState();
    ctx.postMessage({ type: "ready" });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Failed to load the pose model."
    });
  }
}

/** Downsampled average luminance (0..255) for A7's lighting check — cheap enough to run every frame. */
function computeMeanLuminance(bitmap: ImageBitmap): number | undefined {
  try {
    const size = 16;
    if (!luminanceCanvas) luminanceCanvas = new OffscreenCanvas(size, size);
    const g = luminanceCanvas.getContext("2d");
    if (!g) return undefined;
    g.drawImage(bitmap, 0, 0, size, size);
    const data = g.getImageData(0, 0, size, size).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    }
    return sum / (data.length / 4);
  } catch {
    return undefined;
  }
}

function handleFrame(bitmap: ImageBitmap, t: number): void {
  if (!landmarker || !currentExerciseId) {
    bitmap.close();
    return;
  }
  const spec = getExerciseSpec(currentExerciseId);
  if (!spec) {
    bitmap.close();
    return;
  }

  const detection = landmarker.detectForVideo(bitmap, t);
  const meanLuminance = computeMeanLuminance(bitmap);
  bitmap.close(); // release the transferred bitmap promptly — it is not retained (ADR-0002)

  const rawLandmarks = detection.landmarks[0];
  const rawWorld = detection.worldLandmarks[0];
  if (!rawLandmarks || !rawWorld) return; // no person detected this frame

  const landmarks = toContractLandmarks(rawLandmarks);
  const world = toContractLandmarks(rawWorld);
  const smoothedWorld = smoother.smooth(world, t);

  const captureQuality = computeCaptureQuality({
    landmarks,
    requiredJoints: spec.setup.requiredJoints,
    meanLuminance
  });

  const jointAngles = computeJointAngles(smoothedWorld, t);

  const safetyVerdict = evaluateSafety(
    { angles: jointAngles, consecutiveFailedReps },
    spec.safety,
    spec.regression,
    t
  );

  const step = stepRepSegmenter(segState, jointAngles, spec, 0);
  segState = step.state;

  let closedRep: { rep: RepEvent; score: FormScore } | null = null;
  let cue: CoachingCue | null = null;

  if (step.closedRep) {
    const score = scoreRep(step.closedRep.rep, step.closedRep.aux, spec.criteria, captureQuality.score);
    closedRep = { rep: step.closedRep.rep, score };
    consecutiveFailedReps = score.score <= PASS_SCORE_THRESHOLD ? consecutiveFailedReps + 1 : 0;

    const cueResult = selectCue(score.breakdown, spec.criteria, spec.cues, cooldownState, t);
    cooldownState = cueResult.cooldownState;
    cue = cueResult.cue;
  }

  ctx.postMessage({
    type: "result",
    t,
    landmarks,
    captureQuality,
    jointAngles,
    closedRep,
    cue,
    safetyVerdict
  });
}

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      void init(msg.exerciseId);
      break;
    case "setExercise":
      currentExerciseId = msg.exerciseId;
      resetSessionState();
      break;
    case "frame":
      handleFrame(msg.bitmap, msg.t);
      break;
    case "dispose":
      landmarker?.close();
      landmarker = null;
      break;
  }
};
