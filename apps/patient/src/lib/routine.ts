import { EXERCISES, getExerciseSpec } from "@ai-rehab/exercises";

/**
 * The exercises a patient has chosen for themselves.
 *
 * Distinct from a clinician's `Program`, and deliberately so. A prescription
 * is a clinical instruction that passed the E5 contraindication check before
 * it was assigned; a routine is a preference. Letting a patient quietly
 * delete a prescribed exercise from their own device would make the
 * clinician's copy a lie, so a routine never overrides a prescription — it
 * is what a patient follows when nobody has prescribed anything, which is
 * the default and the whole point of the guest-first flow (H7).
 *
 * Stored locally, like the rest of a guest's data. That means it does not
 * follow a signed-in patient between devices — a real gap, recorded in
 * docs/STATUS.md rather than papered over. Syncing it needs a
 * patient-owned routine on the server, which is new backend surface and a
 * larger decision than a preference warrants today.
 */

const ROUTINE_KEY = "ai-rehab:routine";

/** `null` means "never chosen" — which is not the same as "chose nothing". */
export function loadRoutine(): string[] | null {
  try {
    const raw = localStorage.getItem(ROUTINE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    // Filter against the live catalogue: an exercise can be renamed or
    // removed between releases, and a routine holding a dead id would show
    // a patient a row they can never start.
    const valid = parsed.filter(
      (id): id is string => typeof id === "string" && getExerciseSpec(id) !== undefined
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null; // storage disabled, or malformed
  }
}

export function saveRoutine(exerciseIds: readonly string[]): void {
  try {
    localStorage.setItem(ROUTINE_KEY, JSON.stringify([...exerciseIds]));
  } catch {
    /* storage disabled — the choice applies this session and is forgotten */
  }
}

export function hasChosenRoutine(): boolean {
  return loadRoutine() !== null;
}

/**
 * The exercises to actually show, in catalogue order.
 *
 * Catalogue order rather than selection order on purpose: the catalogue is
 * ordered easiest-first, and a patient who happens to tick the hardest
 * exercise first should not be handed it first.
 */
export function routineExercises(routine: readonly string[] | null) {
  if (!routine) return EXERCISES;
  const chosen = new Set(routine);
  const filtered = EXERCISES.filter((e) => chosen.has(e.id));
  // A routine that somehow matches nothing falls back to the full catalogue
  // rather than showing a patient an empty Today with no way out.
  return filtered.length > 0 ? filtered : EXERCISES;
}
