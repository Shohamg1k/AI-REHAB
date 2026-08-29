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
      landmarks: Landmark[];
      captureQuality: CaptureQuality;
      jointAngles: JointAngles;
      closedRep: { rep: RepEvent; score: FormScore } | null;
      cue: CoachingCue | null;
      safetyVerdict: SafetyVerdict;
    };
