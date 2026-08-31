import type { ExerciseSpec } from "@ai-rehab/contracts";
import { seatedKneeExtension } from "./specs/seatedKneeExtension.js";
import { standingShoulderAbduction } from "./specs/standingShoulderAbduction.js";
import { sitToStand } from "./specs/sitToStand.js";
import { seatedElbowFlexion } from "./specs/seatedElbowFlexion.js";
import { standingShoulderFlexion } from "./specs/standingShoulderFlexion.js";
import { seatedNeckSideTilt } from "./specs/seatedNeckSideTilt.js";
import { validateCatalog } from "./validator.js";

export { seatedKneeExtension } from "./specs/seatedKneeExtension.js";
export { standingShoulderAbduction } from "./specs/standingShoulderAbduction.js";
export { sitToStand } from "./specs/sitToStand.js";
export { seatedElbowFlexion } from "./specs/seatedElbowFlexion.js";
export { standingShoulderFlexion } from "./specs/standingShoulderFlexion.js";
export { seatedNeckSideTilt } from "./specs/seatedNeckSideTilt.js";
export * from "./validator.js";
export { PROVISIONAL_NOTE } from "./provisional.js";

/**
 * The catalogue — A6. Validated at import time, so a malformed spec fails
 * the build rather than a session.
 *
 * Ordered lower body then upper body, which is also roughly easiest-first.
 * Every spec here is `provisional`: the ranges are reasoned from ordinary
 * clinical norms, not signed off by a physiotherapist. See docs/STATUS.md.
 */
export const EXERCISES: readonly ExerciseSpec[] = [
  seatedKneeExtension,
  sitToStand,
  standingShoulderAbduction,
  standingShoulderFlexion,
  seatedElbowFlexion,
  seatedNeckSideTilt
];
validateCatalog(EXERCISES);

export const EXERCISES_BY_ID: ReadonlyMap<string, ExerciseSpec> = new Map(
  EXERCISES.map((e) => [e.id, e])
);

export function getExerciseSpec(id: string): ExerciseSpec | undefined {
  return EXERCISES_BY_ID.get(id);
}
