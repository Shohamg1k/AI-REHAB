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
  | { type: "init"; exerciseId: string }
  | { type: "setExercise"; exerciseId: string }
  | { type: "frame"; bitmap: ImageBitmap; t: number }
  | { type: "dispose" };

/** Pose worker -> main thread. */
export type WorkerToMainMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | {
      type: "result";
      t: number;
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
