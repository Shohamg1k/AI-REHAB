import { beforeEach, describe, expect, it } from "vitest";
import { EXERCISES } from "@ai-rehab/exercises";
import { hasChosenRoutine, loadRoutine, routineExercises, saveRoutine } from "./routine.js";

beforeEach(() => {
  localStorage.clear();
});

describe("routine storage", () => {
  it("distinguishes 'never chosen' from a stored choice", () => {
    expect(loadRoutine()).toBeNull();
    expect(hasChosenRoutine()).toBe(false);

    saveRoutine(["sit-to-stand"]);

    expect(loadRoutine()).toEqual(["sit-to-stand"]);
    expect(hasChosenRoutine()).toBe(true);
  });

  it("drops exercises that no longer exist in the catalogue", () => {
    // A routine saved before an exercise was renamed or removed would
    // otherwise show a row the patient can never start.
    saveRoutine(["sit-to-stand", "removed-in-a-later-release"]);
    expect(loadRoutine()).toEqual(["sit-to-stand"]);
  });

  it("treats a routine of only dead ids as never chosen, so onboarding can re-run", () => {
    saveRoutine(["gone-a", "gone-b"]);
    expect(loadRoutine()).toBeNull();
    expect(hasChosenRoutine()).toBe(false);
  });

  it("survives malformed storage", () => {
    localStorage.setItem("ai-rehab:routine", "not json {{{");
    expect(loadRoutine()).toBeNull();

    localStorage.setItem("ai-rehab:routine", JSON.stringify({ not: "an array" }));
    expect(loadRoutine()).toBeNull();
  });
});

describe("routineExercises", () => {
  it("shows the whole catalogue when nothing has been chosen", () => {
    expect(routineExercises(null)).toHaveLength(EXERCISES.length);
  });

  it("shows only the chosen exercises", () => {
    const picked = routineExercises(["seated-neck-side-tilt", "sit-to-stand"]);
    expect(picked.map((e) => e.id).sort()).toEqual(["seated-neck-side-tilt", "sit-to-stand"]);
  });

  it("returns them in catalogue order, not the order they were picked", () => {
    // The catalogue is ordered easiest-first; someone who happens to tick the
    // hardest exercise first should not be handed it first.
    const picked = routineExercises(["seated-neck-side-tilt", "seated-knee-extension"]);
    const catalogueOrder = EXERCISES.filter((e) =>
      ["seated-neck-side-tilt", "seated-knee-extension"].includes(e.id)
    ).map((e) => e.id);
    expect(picked.map((e) => e.id)).toEqual(catalogueOrder);
  });

  it("falls back to the full catalogue rather than showing an empty Today", () => {
    expect(routineExercises([])).toHaveLength(EXERCISES.length);
    expect(routineExercises(["nothing-real"])).toHaveLength(EXERCISES.length);
  });
});
