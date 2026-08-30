import {
  ExerciseSpecSchema,
  JOINT_TO_LANDMARKS,
  type ExerciseSpec,
  type PoseLandmarkName
} from "@ai-rehab/contracts";

/**
 * Authoring-time validation for the exercise DSL (A6). Checks the Zod shape
 * plus a few cross-field invariants Zod alone can't express: every cue and
 * phase must reference a criterion/joint that actually exists on the spec,
 * and a provisional spec must carry a note (docs/MVP-BUILD-PROMPT.md §7).
 */
export class ExerciseSpecValidationError extends Error {}

export function validateExerciseSpec(spec: ExerciseSpec): ExerciseSpec {
  const parsed = ExerciseSpecSchema.safeParse(spec);
  if (!parsed.success) {
    throw new ExerciseSpecValidationError(
      `${spec.id ?? "<unknown>"}: ${parsed.error.issues.map((i) => i.message).join("; ")}`
    );
  }

  const criterionIds = new Set(spec.criteria.map((c) => c.id));
  for (const cue of spec.cues) {
    if (!criterionIds.has(cue.triggerCriterion)) {
      throw new ExerciseSpecValidationError(
        `${spec.id}: cue "${cue.id}" triggers unknown criterion "${cue.triggerCriterion}"`
      );
    }
  }

  if (spec.phases.length === 0) {
    throw new ExerciseSpecValidationError(`${spec.id}: must define at least one phase`);
  }

  // A spec that declares an explicit framing contract must still include
  // every landmark its own measurements depend on — otherwise framing would
  // pass while scoring silently had nothing to measure.
  const declared = spec.setup.requiredLandmarks;
  if (declared && declared.length > 0) {
    const declaredSet = new Set<PoseLandmarkName>(declared);
    for (const joint of spec.setup.requiredJoints) {
      const needed = JOINT_TO_LANDMARKS[joint] ?? [];
      const absent = needed.filter((l) => !declaredSet.has(l));
      if (absent.length > 0) {
        throw new ExerciseSpecValidationError(
          `${spec.id}: setup.requiredLandmarks is missing ${absent.join(", ")}, needed to measure joint "${joint}"`
        );
      }
    }
  }

  if (spec.provisional && !spec.provisionalNote) {
    throw new ExerciseSpecValidationError(
      `${spec.id}: provisional specs must carry a provisionalNote (see docs/MVP-BUILD-PROMPT.md §7)`
    );
  }

  return parsed.data;
}

export function validateCatalog(specs: readonly ExerciseSpec[]): void {
  const seenIds = new Set<string>();
  for (const spec of specs) {
    validateExerciseSpec(spec);
    if (seenIds.has(spec.id)) {
      throw new ExerciseSpecValidationError(`duplicate exercise id "${spec.id}"`);
    }
    seenIds.add(spec.id);
  }
}
