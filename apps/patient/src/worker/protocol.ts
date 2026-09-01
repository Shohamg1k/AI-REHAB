import type {
  CaptureQuality,
  CoachingCue,
  FormScore,
  JointAngles,
  Landmark,
  RepEvent,
  SafetyVerdict
} from "@ai-rehab/contracts";

/** Main thread -> pose worker. */
export type MainToWorkerMessage =
  /**
   * `tier` is passed in rather than read by the worker itself. It is
   * build-time configuration, and the two ways of injecting that into a
   * worker each work in only one mode — Vite skips `define` for workers in
   * dev, and bundles workers in a separate Rollup pass that cannot see a
   * custom virtual module in production. Passing it as data sidesteps the
   * split: the main thread resolves it once, the worker just receives it.
   */
  | { type: "init"; exerciseId: string; tier: string }
  | { type: "setExercise"; exerciseId: string }
  /**
   * Arms or disarms rep counting. Off until the patient actually starts, so
   * that moving around during camera framing cannot produce reps — see
   * `scoring` in poseWorker.ts.
   */
  | { type: "setScoring"; scoring: boolean }
  | { type: "frame"; bitmap: ImageBitmap; t: number }
  | { type: "dispose" };

/**
 * What the pipeline actually costs, measured rather than assumed.
 *
 * ADR-0007 and the M0 exit criterion both hinge on a number nobody has ever
 * had: how long inference really takes on real hardware. Carrying it in the
 * result message means any real session produces that number as a
 * side-effect, instead of it needing a dedicated spike.
 */
export type PosePerfSample = {
  /** Wall time inside `detectForVideo` for this frame. */
  inferenceMs: number;
  /** Which model tier produced it — a latency figure is meaningless without this. */
  tier: string;
};

/** Pose worker -> main thread. */
export type WorkerToMainMessage =
  | { type: "ready"; tier: string }
  | { type: "error"; message: string }
  | {
      type: "result";
      t: number;
      perf: PosePerfSample;
      /** False when no person is in shot at all — distinct from "framed badly". */
      personDetected: boolean;
      /** Empty when `personDetected` is false. Landmark coordinates only — never pixels (ADR-0002). */
      landmarks: Landmark[];
      captureQuality: CaptureQuality;
      jointAngles: JointAngles;
      /** Null while scoring is paused for insufficient signal, and when nobody is detected. */
      closedRep: { rep: RepEvent; score: FormScore } | null;
      cue: CoachingCue | null;
      /** Null when there is no pose to evaluate — absence of a verdict, not an "allow". */
      safetyVerdict: SafetyVerdict | null;
    };
