import type { ExerciseSpec } from "@ai-rehab/contracts";
import { seatedKneeExtension } from "./specs/seatedKneeExtension.js";
import { standingShoulderAbduction } from "./specs/standingShoulderAbduction.js";
import { sitToStand } from "./specs/sitToStand.js";
import { validateCatalog } from "./validator.js";

export { seatedKneeExtension } from "./specs/seatedKneeExtension.js";
export { standingShoulderAbduction } from "./specs/standingShoulderAbduction.js";
export { sitToStand } from "./specs/sitToStand.js";
export * from "./validator.js";
export { PROVISIONAL_NOTE } from "./provisional.js";

/** The full MVP catalogue — A6. All three exercises, validated at import time. */
export const EXERCISES: readonly ExerciseSpec[] = [
  seatedKneeExtension,
  standingShoulderAbduction,
  sitToStand
];
validateCatalog(EXERCISES);

export const EXERCISES_BY_ID: ReadonlyMap<string, ExerciseSpec> = new Map(
  EXERCISES.map((e) => [e.id, e])
);

export function getExerciseSpec(id: string): ExerciseSpec | undefined {
  return EXERCISES_BY_ID.get(id);
}
