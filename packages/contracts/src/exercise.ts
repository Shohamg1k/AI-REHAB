import { z } from "zod";
import { JointNameSchema } from "./pose.js";

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
  measure: z.enum(["peak_angle", "end_angle", "tempo_ms", "symmetry", "trunk_lean"]),
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
  intensity: z.enum(["none", "low", "medium", "high"]),
  difficulty: z.number().min(0).max(5),
  movementType: z.enum(["mobility", "strength", "control", "balance", "recovery"]),
  progression: z.string().nullable(),
  regression: z.string().nullable(),

  setup: z.object({
    view: z.enum(["front", "side", "either"]),
    posture: z.enum(["seated", "standing", "supine", "prone"]),
    requiredJoints: z.array(JointNameSchema)
  }),
  phases: z.array(RepPhaseSchema).min(1),
  criteria: z.array(FormCriterionSchema).min(1),
  compensations: z.array(CompensationRuleSchema),
  cues: z.array(CueTemplateSchema),
  safety: SafetyThresholdsSchema
});
export type ExerciseSpec = z.infer<typeof ExerciseSpecSchema>;
