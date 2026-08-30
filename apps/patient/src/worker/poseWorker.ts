import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark as ContractLandmark, FormScore, RepEvent, CoachingCue } from "@ai-rehab/contracts";
import {
  LandmarkSmoother,
  computeJointAngles,
  assessFraming,
  createRepSegmenterState,
  stepRepSegmenter,
  scoreRep,
  isFailedRep,
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

// Pinned to the exact installed @mediapipe/tasks-vision version (see
// apps/patient/package.json — pinned there too, no `^` range) so the wasm
// runtime and the JS bindings never drift apart. A mismatch here fails at
// runtime with an opaque "ModuleFactory not set" error, not a type error,
// so nothing catches it until the app actually runs.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
// `lite` per docs/adr/0007-pose-model-tier.md — chosen as the safest default
// pending the real M0 device spike (fps/jitter on the actual device floor),
// which this environment cannot run without physical hardware.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

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

/**
 * Drops a rep that was in progress when tracking degraded, preserving the
 * completed-rep count. Without this, a rep half-observed before the patient
 * moved out of frame would later close against stale peak angles and be
 * scored as if it had been seen end to end.
 */
function discardPartialRep(): void {
  if (segState.repStartT === null && segState.cursor === 0) return;
  segState = { ...createRepSegmenterState(), repIndex: segState.repIndex };
  smoother.reset();
}

async function init(exerciseId: string): Promise<void> {
  try {
    const spec = getExerciseSpec(exerciseId);
    if (!spec) throw new Error(`unknown exercise "${exerciseId}"`);

    // `useModule: true` is required here: this worker is an ES module
    // worker (Vite bundles it that way, and its dev server always serves
    // workers as native ESM regardless of build config), and MediaPipe's
    // WASM loader otherwise falls back to `importScripts()`, which module
    // workers don't support — that mismatch is what "ModuleFactory not
    // set" actually means. See
    // https://github.com/google-ai-edge/mediapipe/issues/5257.
    const vision = await FilesetResolver.forVisionTasks(WASM_URL, true);
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

  // No person in frame. Previously this returned silently, freezing the UI
  // on the last good frame — so a patient who walked out of shot still saw
  // "good positioning". Report the empty frame instead and let the UI say so.
  if (!rawLandmarks || !rawWorld) {
    discardPartialRep();
    ctx.postMessage({
      type: "result",
      t,
      personDetected: false,
      landmarks: [],
      captureQuality: assessFraming({
        landmarks: [],
        requiredLandmarks: spec.setup.requiredLandmarks,
        requiredJoints: spec.setup.requiredJoints,
        meanLuminance
      }),
      jointAngles: computeJointAngles([], t),
      closedRep: null,
      cue: null,
      safetyVerdict: null
    });
    return;
  }

  const landmarks = toContractLandmarks(rawLandmarks);
  const world = toContractLandmarks(rawWorld);
  const smoothedWorld = smoother.smooth(world, t);

  // Framing is judged only against this exercise's declared landmarks.
  const captureQuality = assessFraming({
    landmarks,
    requiredLandmarks: spec.setup.requiredLandmarks,
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

  let closedRep: { rep: RepEvent; score: FormScore } | null = null;
  let cue: CoachingCue | null = null;

  if (captureQuality.requiredLandmarksOk) {
    const step = stepRepSegmenter(segState, jointAngles, spec, 0);
    segState = step.state;

    if (step.closedRep) {
      const score = scoreRep(step.closedRep.rep, step.closedRep.aux, spec.criteria, captureQuality.score);
      closedRep = { rep: step.closedRep.rep, score };
      consecutiveFailedReps = isFailedRep(score) ? consecutiveFailedReps + 1 : 0;

      const cueResult = selectCue(score.breakdown, spec.criteria, spec.cues, cooldownState, t);
      cooldownState = cueResult.cooldownState;
      cue = cueResult.cue;
    }
  } else {
    // A required landmark is missing or out of frame. Scoring is paused
    // rather than run on partial data — a rep measured across a tracking gap
    // would produce a confident-looking number from incomplete evidence.
    // Segmentation resumes by itself once the landmarks come back.
    discardPartialRep();
  }

  ctx.postMessage({
    type: "result",
    t,
    personDetected: true,
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
