import { z } from "zod";

/**
 * The 12 joints upstream OpenRehabAgent's `JOINT_INDEX` covers, plus `trunk`.
 * Deliberately the same set so the MediaPipe → upstream adapter is a pure
 * lookup table rather than a translation layer. See docs/UPSTREAM.md §1.4.
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
  "trunk"
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

export const CaptureQualitySchema = z.object({
  score: z.number().min(0).max(1),
  framing: z.enum(["ok", "too_close", "too_far", "partially_out_of_frame"]),
  lighting: z.enum(["ok", "dim", "blown_out"]),
  missingJoints: z.array(JointNameSchema)
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
  trunkLean: z.number()
});
export type JointAngles = z.infer<typeof JointAnglesSchema>;
