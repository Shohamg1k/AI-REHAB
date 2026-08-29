import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID, getExerciseSpec, validateExerciseSpec } from "../src/index.js";

describe("exercise catalogue (A6)", () => {
  it("ships exactly the three MVP exercises", () => {
    expect(EXERCISES).toHaveLength(3);
    expect(EXERCISES.map((e) => e.id).sort()).toEqual([
      "seated-knee-extension",
      "sit-to-stand",
      "standing-shoulder-abduction"
    ]);
  });

  it("every spec is marked provisional with a note (no clinician sign-off yet)", () => {
    for (const spec of EXERCISES) {
      expect(spec.provisional).toBe(true);
      expect(spec.provisionalNote).toBeTruthy();
    }
  });

  it("every spec passes full schema + cross-field validation", () => {
    for (const spec of EXERCISES) {
      expect(() => validateExerciseSpec(spec)).not.toThrow();
    }
  });

  it("every cue's triggerCriterion resolves to a real criterion id", () => {
    for (const spec of EXERCISES) {
      const criterionIds = new Set(spec.criteria.map((c) => c.id));
      for (const cue of spec.cues) {
        expect(criterionIds.has(cue.triggerCriterion)).toBe(true);
      }
    }
  });

  it("every criterion and phase references a joint the setup requires or trunk", () => {
    for (const spec of EXERCISES) {
      const allowed = new Set([...spec.setup.requiredJoints, "trunk"]);
      for (const criterion of spec.criteria) {
        expect(allowed.has(criterion.joint)).toBe(true);
      }
      for (const phase of spec.phases) {
        expect(allowed.has(phase.joint)).toBe(true);
      }
    }
  });

  it("a progression/regression id, when set, points at another real spec", () => {
    for (const spec of EXERCISES) {
      if (spec.progression) expect(EXERCISES_BY_ID.has(spec.progression)).toBe(true);
      if (spec.regression) expect(EXERCISES_BY_ID.has(spec.regression)).toBe(true);
    }
  });

  it("getExerciseSpec looks up by id and returns undefined for an unknown one", () => {
    expect(getExerciseSpec("sit-to-stand")?.displayName).toBe("Sit to Stand");
    expect(getExerciseSpec("not-a-real-exercise")).toBeUndefined();
  });

  it("phases are a two-step concentric/eccentric cycle with a rationale sentence", () => {
    for (const spec of EXERCISES) {
      expect(spec.phases.length).toBeGreaterThanOrEqual(2);
      expect(spec.rationale.length).toBeGreaterThan(10);
    }
  });
});
