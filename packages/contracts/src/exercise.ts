import { z } from "zod";
import { JointNameSchema } from "./pose.js";
import { PoseLandmarkNameSchema } from "./landmarks.js";

export const BODY_REGIONS = [
  "shoulder",
  "elbow",
  "wrist",
  "lower_back",
  "hip",
  "knee",
  "ankle",
  "neck"
] as const;
export const BodyRegionSchema = z.enum(BODY_REGIONS);
export type BodyRegion = z.infer<typeof BodyRegionSchema>;

export const IntensitySchema = z.enum(["none", "low", "medium", "high"]);
export type Intensity = z.infer<typeof IntensitySchema>;

export const RepPhaseSchema = z.object({
  name: z.string(),
  joint: JointNameSchema,
  enter: z.object({
    angle: z.number(),
    direction: z.enum(["above", "below"])
  }),
  minDurationMs: z.number().positive().optional(),
  maxDurationMs: z.number().positive().optional()
});
export type RepPhase = z.infer<typeof RepPhaseSchema>;

export const FormCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  joint: JointNameSchema,
  /**
   * What this criterion reads off the rep. The first five are single-value
   * readings; the last four summarise the movement's shape over time (see
   * packages/core/src/reps/temporal.ts) so a rep is scored as a trajectory
   * rather than a pose snapshot.
   */
  measure: z.enum([
    "peak_angle",
    "end_angle",
    "tempo_ms",
    "symmetry",
    "trunk_lean",
    "range_of_motion",
    "smoothness",
    "phase_balance",
    "stability"
  ]),
  target: z.object({ min: z.number(), max: z.number() }),
  tolerance: z.object({ warn: z.number().nonnegative(), fail: z.number().nonnegative() }),
  weight: z.number().positive()
});
export type FormCriterion = z.infer<typeof FormCriterionSchema>;

export const CompensationRuleSchema = z.object({
  id: z.string(),
  label: z.string(),
  // A5 is post-MVP (fast-follow), but the shape is specified now so an
  // ExerciseSpec authored today does not need a breaking change later.
  joint: JointNameSchema,
  detect: z.enum(["trunk_lean_exceeds", "asymmetry_exceeds", "joint_substitution"]),
  threshold: z.number(),
  severity: z.number().min(0).max(1)
});
export type CompensationRule = z.infer<typeof CompensationRuleSchema>;

export const CueTemplateSchema = z.object({
  id: z.string(),
  triggerCriterion: z.string(),
  direction: z.enum(["over", "under"]),
  text: z.string().min(1),
  cooldownMs: z.number().nonnegative(),
  priority: z.number()
});
export type CueTemplate = z.infer<typeof CueTemplateSchema>;

export const SafetyThresholdsSchema = z.object({
  maxAngle: z.record(JointNameSchema, z.number()).optional(),
  minAngle: z.record(JointNameSchema, z.number()).optional(),
  maxTrunkLean: z.number().optional(),
  instabilityVelocity: z.number().optional(),
  consecutiveFailedRepsToBlock: z.number().int().positive()
});
export type SafetyThresholds = z.infer<typeof SafetyThresholdsSchema>;

/**
 * Optional demonstration material for an exercise, resolved from exercise
 * data rather than hardcoded in a component — adding a video to an exercise
 * is authoring, not a UI change.
 *
 * `url` may be a bundled asset path or a remote URL. It is *outbound
 * presentation media only*: it is never produced from, and never mixed
 * with, the patient's camera. Nothing in this product writes to this field
 * at runtime (ADR-0002).
 */
export const ReferenceMediaSchema = z.object({
  type: z.enum(["image", "video", "animation"]),
  url: z.string().min(1),
  thumbnail: z.string().min(1).optional(),
  /** Alt text / caption. Required so reference media is never image-only. */
  instructions: z.string().min(1),
  /** Ordered technique cues shown alongside the media. */
  keyPoints: z.array(z.string().min(1)).optional()
});
export type ReferenceMedia = z.infer<typeof ReferenceMediaSchema>;

/**
 * The exercise DSL (A6) — the leverage point of the whole system. An
 * exercise is data, not code; adding one is authoring, not engineering.
 *
 * `provisional: true` marks specs whose reference ranges were authored
 * without clinical sign-off (see docs/STATUS.md "Blocked" — the M1
 * exercises need a physiotherapist). A provisional spec must say so in the
 * UI (docs/MVP-BUILD-PROMPT.md §7) — it must never be presented as a
 * validated reference model.
 */
export const ExerciseSpecSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  rationale: z.string().min(1),
  provisional: z.boolean(),
  provisionalNote: z.string().optional(),

  targetRegions: z.array(BodyRegionSchema),
  contraindicatedRegions: z.array(BodyRegionSchema),
  intensity: IntensitySchema,
  difficulty: z.number().min(0).max(5),
  movementType: z.enum(["mobility", "strength", "control", "balance", "recovery"]),
  progression: z.string().nullable(),
  regression: z.string().nullable(),

  referenceMedia: ReferenceMediaSchema.optional(),

  setup: z.object({
    view: z.enum(["front", "side", "either"]),
    posture: z.enum(["seated", "standing", "supine", "prone"]),
    requiredJoints: z.array(JointNameSchema),
    /**
     * The framing contract (A7). Only these landmarks are validated before
     * and during the exercise — everything else may be out of shot without
     * penalty. Optional for backward compatibility: a spec that omits it
     * falls back to `landmarksForJoints(requiredJoints)`, which is what
     * every pre-existing spec effectively meant.
     */
    requiredLandmarks: z.array(PoseLandmarkNameSchema).optional(),
    /** Plain-language framing hint shown before the camera starts. */
    framingHint: z.string().optional()
  }),
  phases: z.array(RepPhaseSchema).min(1),
  criteria: z.array(FormCriterionSchema).min(1),
  compensations: z.array(CompensationRuleSchema),
  cues: z.array(CueTemplateSchema),
  safety: SafetyThresholdsSchema
});
export type ExerciseSpec = z.infer<typeof ExerciseSpecSchema>;
