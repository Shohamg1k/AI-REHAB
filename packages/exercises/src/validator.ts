import { ExerciseSpecSchema, type ExerciseSpec } from "@ai-rehab/contracts";

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
