import { z } from "zod";
import {
  POSE_LANDMARK_NAMES,
  PoseLandmarkNameSchema,
  type PoseLandmarkName
} from "./landmarks.js";

/**
 * The 12 joints upstream OpenRehabAgent's `JOINT_INDEX` covers, plus `trunk`
 * and `neck`. The first 12 are deliberately the same set so the MediaPipe →
 * upstream adapter stays a pure lookup table (docs/UPSTREAM.md §1.4);
 * `trunk` and `neck` are ours, because neither is a three-point joint and
 * upstream has no equivalent.
 *
 * `neck` measures how far the head is off the torso axis, in 3D — see
 * `computeJointAngles`. It is a *magnitude*, not a direction: a head tilted
 * 20° sideways and a head poked 20° forward read the same. Exercises using
 * it must therefore constrain direction through their setup and cues, not
 * expect the angle to distinguish it.
 */
export const JOINT_NAMES = [
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
  "left_wrist",
  "right_wrist",
  "trunk",
  "neck"
] as const;

export const JointNameSchema = z.enum(JOINT_NAMES);
export type JointName = z.infer<typeof JointNameSchema>;

export const LandmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  visibility: z.number().min(0).max(1)
});
export type Landmark = z.infer<typeof LandmarkSchema>;

/**
 * Which landmarks a joint's angle is computed from. Lets a spec that only
 * declares `requiredJoints` derive a sensible `requiredLandmarks`
 * (backward compatibility), and lets framing explain *which* measurement a
 * missing landmark actually costs.
 *
 * `trunk` maps to both shoulders and both hips — it is a midpoint-derived
 * angle, not a three-point joint (see packages/core landmarkAdapter).
 */
export const JOINT_TO_LANDMARKS: Record<JointName, readonly PoseLandmarkName[]> = {
  left_shoulder: ["LEFT_HIP", "LEFT_SHOULDER", "LEFT_ELBOW"],
  right_shoulder: ["RIGHT_HIP", "RIGHT_SHOULDER", "RIGHT_ELBOW"],
  left_elbow: ["LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST"],
  right_elbow: ["RIGHT_SHOULDER", "RIGHT_ELBOW", "RIGHT_WRIST"],
  left_hip: ["LEFT_SHOULDER", "LEFT_HIP", "LEFT_KNEE"],
  right_hip: ["RIGHT_SHOULDER", "RIGHT_HIP", "RIGHT_KNEE"],
  left_knee: ["LEFT_HIP", "LEFT_KNEE", "LEFT_ANKLE"],
  right_knee: ["RIGHT_HIP", "RIGHT_KNEE", "RIGHT_ANKLE"],
  left_ankle: ["LEFT_KNEE", "LEFT_ANKLE", "LEFT_FOOT_INDEX"],
  right_ankle: ["RIGHT_KNEE", "RIGHT_ANKLE", "RIGHT_FOOT_INDEX"],
  left_wrist: ["LEFT_ELBOW", "LEFT_WRIST", "LEFT_INDEX"],
  right_wrist: ["RIGHT_ELBOW", "RIGHT_WRIST", "RIGHT_INDEX"],
  trunk: ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"],
  neck: ["NOSE", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"]
};

/** Union of the landmarks every listed joint needs, de-duplicated, in MediaPipe index order. */
export function landmarksForJoints(joints: readonly JointName[]): PoseLandmarkName[] {
  const set = new Set<PoseLandmarkName>();
  for (const joint of joints) {
    for (const landmark of JOINT_TO_LANDMARKS[joint] ?? []) set.add(landmark);
  }
  return POSE_LANDMARK_NAMES.filter((name) => set.has(name));
}

/**
 * Why a single required landmark isn't usable this frame. Distinguished
 * because each one earns different guidance: `out_of_frame` means move the
 * camera, `low_confidence` means the model can see something but isn't sure,
 * `not_detected` means it isn't in the picture at all.
 */
export const LandmarkStatusSchema = z.enum([
  "ok",
  "low_confidence",
  "out_of_frame",
  "not_detected"
]);
export type LandmarkStatus = z.infer<typeof LandmarkStatusSchema>;

export const LandmarkCheckSchema = z.object({
  landmark: PoseLandmarkNameSchema,
  status: LandmarkStatusSchema,
  visibility: z.number().min(0).max(1)
});
export type LandmarkCheck = z.infer<typeof LandmarkCheckSchema>;

/**
 * One user-facing framing instruction. `severity` drives presentation, not
 * wording — the message is already written for a patient to read aloud
 * (docs/UX-SPEC.md §5), so the UI never composes copy from parts.
 */
export const FramingGuidanceSchema = z.object({
  severity: z.enum(["ok", "warn", "fail"]),
  message: z.string().min(1)
});
export type FramingGuidance = z.infer<typeof FramingGuidanceSchema>;

/**
 * A7 + G7. Note what this deliberately does NOT say: "is the whole body
 * visible". Framing is judged only against the landmarks the *current
 * exercise* declares (`ExerciseSpec.setup.requiredLandmarks`), so a seated
 * knee exercise never fails because the patient's wrists are out of shot.
 *
 * `missingJoints` is retained for backward compatibility with persisted
 * `setup_completed` events written before landmark-level framing existed.
 */
export const CaptureQualitySchema = z.object({
  score: z.number().min(0).max(1),
  framing: z.enum(["ok", "too_close", "too_far", "partially_out_of_frame"]),
  lighting: z.enum(["ok", "dim", "blown_out"]),
  missingJoints: z.array(JointNameSchema),
  missingLandmarks: z.array(PoseLandmarkNameSchema),
  landmarkChecks: z.array(LandmarkCheckSchema),
  guidance: z.array(FramingGuidanceSchema),
  /** True only when every required landmark is usable — gates scoring (G7). */
  requiredLandmarksOk: z.boolean()
});
export type CaptureQuality = z.infer<typeof CaptureQualitySchema>;

/**
 * Produced by the pose worker, consumed by core/reps and core/form.
 * Rule: PoseFrame is the only place raw landmarks exist. Nothing downstream
 * of core/pose sees a landmark array — it sees angles and derived features.
 * That is what keeps "video never leaves the device" (ADR-0002) enforceable
 * by inspection rather than by promise.
 */
export const PoseFrameSchema = z.object({
  t: z.number(),
  landmarks: z.array(LandmarkSchema).length(33),
  world: z.array(LandmarkSchema).length(33),
  captureQuality: CaptureQualitySchema
});
export type PoseFrame = z.infer<typeof PoseFrameSchema>;

// JointName is a closed, finite union (13 members), so `Partial<Record<...>>`
// is modelled as an object schema over every key, then `.partial()` — not
// `z.record`, whose TS inference on an enum key still comes out as a fully
// required Record and would silently lie about which joints are present.
function partialMapOf<V extends z.ZodTypeAny>(keys: readonly string[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value]))).partial();
}

const SYMMETRY_KEYS = ["shoulder", "elbow", "hip", "knee"] as const;

export const JointAnglesSchema = z.object({
  t: z.number(),
  angles: partialMapOf(JOINT_NAMES, z.number()),
  confidence: partialMapOf(JOINT_NAMES, z.number().min(0).max(1)),
  symmetry: partialMapOf(SYMMETRY_KEYS, z.number()),
  /**
   * Null when the torso landmarks were not usable this frame — *not* 0.
   *
   * It used to default to 0, which reads as "perfectly upright". The
   * trunk-lean safety rule compares `observed > limit`, so an unmeasurable
   * trunk silently could never trip it: losing sight of the hips mid-set
   * disabled the rule and reported ideal posture. Unknown and upright are
   * different facts and the type now says so.
   */
  trunkLean: z.number().nullable()
});
export type JointAngles = z.infer<typeof JointAnglesSchema>;
