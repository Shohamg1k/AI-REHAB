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

// Served from this app's own origin, staged by scripts/fetch-pose-assets.mjs.
//
// Not a CDN, deliberately. Fetching these from jsDelivr and
// storage.googleapis.com fails outright on networks that block or
// TLS-intercept those hosts (corporate proxies and VPNs routinely do), with
// nothing but "Failed to fetch" to diagnose it from. Serving locally also
// keeps the promise the product makes: a session start no longer announces
// itself to two third parties, and the app works offline.
//
// The wasm is copied from the exact installed @mediapipe/tasks-vision, so
// the runtime and the JS bindings cannot drift apart — the version mismatch
// that produced "ModuleFactory not set".
const WASM_URL = new URL("/mediapipe/wasm", self.location.origin).href;
// One stable path whichever tier was staged — see scripts/pose-tiers.mjs.
const MODEL_URL = new URL("/mediapipe/models/pose_landmarker.task", self.location.origin).href;


/**
 * Display landmarks get a more lag-cutting filter than the world landmarks
 * used for angle maths. The trade-off genuinely differs by consumer: for a
 * skeleton drawn over live video, lag is what a patient notices and
 * complains about; for joint-angle analysis, jitter is what corrupts the
 * measurement. Same filter, different `beta` (its lag-vs-speed term).
 *
 * These values are reasoned, not measured — the instrumentation added
 * alongside them is what will let someone tune them against a real device.
 */
const DISPLAY_SMOOTHING_PARAMS = { minCutoff: 1.7, beta: 0.9, dCutoff: 1.0 };

/**
 * Lighting is checked every Nth frame, not every frame. `getImageData`
 * forces a GPU->CPU readback that stalls the pipeline, and it was running on
 * every single frame to answer a question — "is the room bright enough" —
 * whose answer changes over seconds, not milliseconds.
 */
const LUMINANCE_SAMPLE_INTERVAL_FRAMES = 15;

let landmarker: PoseLandmarker | null = null;
let smoother = new LandmarkSmoother();
let displaySmoother = new LandmarkSmoother(DISPLAY_SMOOTHING_PARAMS);
let segState: RepSegmenterState = createRepSegmenterState();
let cooldownState: CueCooldownState = {};
let consecutiveFailedReps = 0;
let currentExerciseId: string | null = null;
let luminanceCanvas: OffscreenCanvas | null = null;
let frameCounter = 0;
let lastMeanLuminance: number | undefined;
/**
 * Which model tier is staged, told to us at init by the main thread. Only
 * ever a label for the perf readout — the worker loads whatever is at
 * MODEL_URL regardless. Deliberately not read from the manifest here: this
 * file touches camera frames, and ADR-0002's guard (lib/privacy.test.ts)
 * allows network calls from exactly one reviewed file, which a perf label is
 * nowhere near a good enough reason to widen.
 */
let modelTier = "unknown";

function toContractLandmarks(
  raw: ReadonlyArray<{ x: number; y: number; z: number; visibility?: number }>
): ContractLandmark[] {
  return raw.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility ?? 0 }));
}

function resetSessionState(): void {
  smoother = new LandmarkSmoother();
  displaySmoother = new LandmarkSmoother(DISPLAY_SMOOTHING_PARAMS);
  segState = createRepSegmenterState();
  cooldownState = {};
  consecutiveFailedReps = 0;
  frameCounter = 0;
  lastMeanLuminance = undefined;
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


/**
 * Runs one throwaway inference on a blank frame before reporting ready.
 *
 * Measured on a dev machine: the *first* `detectForVideo` costs ~10s (GPU
 * shader compilation and lazy graph setup) while every frame after it costs
 * ~30ms. `createFromOptions` resolves before any of that happens, so without
 * this the app said "ready", dismissed its loading spinner, and then froze
 * for ten seconds on the patient's first frame — the worst possible moment,
 * and indistinguishable from the app being broken.
 *
 * Paying it here keeps the cost inside the "Loading on-device pose model…"
 * state the patient is already being asked to wait through, and keeps it
 * from tripping the capture loop's stall timeout.
 *
 * Timestamp 0 so it can never be mistaken for a later real frame:
 * `detectForVideo` requires monotonically increasing timestamps.
 */
function warmUp(instance: PoseLandmarker): void {
  try {
    const canvas = new OffscreenCanvas(256, 256);
    const g = canvas.getContext("2d");
    if (!g) return;
    g.fillRect(0, 0, 256, 256);
    const bitmap = canvas.transferToImageBitmap();
    instance.detectForVideo(bitmap, 0);
    bitmap.close();
  } catch {
    // Warm-up is an optimisation, never a precondition. If it fails the
    // first real frame simply pays the cost, exactly as it used to.
  }
}

async function init(exerciseId: string, tier: string): Promise<void> {
  try {
    modelTier = tier;
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
      numPoses: 1,
      // Set explicitly rather than inherited from MediaPipe's defaults, which
      // are undocumented per-version and could shift under us on an upgrade.
      // Presence and tracking sit above detection: a rehab patient is
      // deliberately positioned and mostly stationary, so a pose that only
      // weakly looks like a person is far more likely to be a mis-detection
      // (a chair, a shadow) than the patient. Losing tracking is recoverable
      // and honestly reported as "no one in view"; scoring a phantom pose is
      // not.
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.65,
      minTrackingConfidence: 0.65,
      outputSegmentationMasks: false
    });

    warmUp(landmarker);

    currentExerciseId = exerciseId;
    resetSessionState();
    ctx.postMessage({ type: "ready", tier: modelTier });
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

  const startedAt = performance.now();
  const detection = landmarker.detectForVideo(bitmap, t);
  const inferenceMs = performance.now() - startedAt;

  frameCounter += 1;
  if (frameCounter % LUMINANCE_SAMPLE_INTERVAL_FRAMES === 1) {
    lastMeanLuminance = computeMeanLuminance(bitmap);
  }
  const meanLuminance = lastMeanLuminance;
  bitmap.close(); // release the transferred bitmap promptly — it is not retained (ADR-0002)

  const perf = { inferenceMs, tier: modelTier };
  const rawLandmarks = detection.landmarks[0];
  const rawWorld = detection.worldLandmarks[0];

  // No person in frame. Previously this returned silently, freezing the UI
  // on the last good frame — so a patient who walked out of shot still saw
  // "good positioning". Report the empty frame instead and let the UI say so.
  if (!rawLandmarks || !rawWorld) {
    discardPartialRep();
    displaySmoother.reset();
    ctx.postMessage({
      type: "result",
      t,
      perf,
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

  // The drawn skeleton was previously the only unsmoothed thing in the
  // pipeline — raw landmark jitter went straight to the canvas, which reads
  // as the tracking being worse than it is. Smoothed with a lag-cutting
  // filter so it settles without trailing the patient's movement.
  const landmarks = displaySmoother.smooth(toContractLandmarks(rawLandmarks), t);
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
    perf,
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
      void init(msg.exerciseId, msg.tier);
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
