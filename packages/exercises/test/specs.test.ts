import { describe, expect, it } from "vitest";
import { JOINT_TO_LANDMARKS } from "@ai-rehab/contracts";
import { EXERCISES, EXERCISES_BY_ID, getExerciseSpec, validateExerciseSpec } from "../src/index.js";

describe("exercise catalogue (A6)", () => {
  it("ships the expected catalogue — three lower-body, three upper-body", () => {
    expect(EXERCISES).toHaveLength(6);
    expect(EXERCISES.map((e) => e.id).sort()).toEqual([
      "seated-elbow-flexion",
      "seated-knee-extension",
      "seated-neck-side-tilt",
      "sit-to-stand",
      "standing-shoulder-abduction",
      "standing-shoulder-flexion"
    ]);
  });

  it("covers the upper body as well as the lower", () => {
    const regions = new Set(EXERCISES.flatMap((e) => e.targetRegions));
    for (const region of ["knee", "hip", "shoulder", "elbow", "neck"]) {
      expect(regions).toContain(region);
    }
  });

  /**
   * A joint-angle cap above 180° can never fire: these are three-point
   * interior angles, mathematically bounded at 180°. Configuring one implies
   * a protection that does not exist, which is worse than configuring none.
   * The eval harness catches it indirectly by demanding a fixture per rule;
   * this catches it directly, at the spec.
   */
  it("configures no joint cap that the angle model cannot reach", () => {
    for (const spec of EXERCISES) {
      for (const [joint, limit] of Object.entries(spec.safety.maxAngle ?? {})) {
        expect(
          limit,
          `${spec.id}: maxAngle.${joint} = ${limit}° can never be reached`
        ).toBeLessThanOrEqual(180);
      }
    }
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

describe("framing configuration (A7)", () => {
  it("every spec declares an explicit requiredLandmarks framing contract", () => {
    for (const spec of EXERCISES) {
      expect(spec.setup.requiredLandmarks?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("requiredLandmarks covers every landmark the spec's measured joints need", () => {
    // Same invariant the validator enforces, asserted here so a reviewer can
    // see it rather than having to trust the import-time check.
    for (const spec of EXERCISES) {
      const declared = new Set(spec.setup.requiredLandmarks ?? []);
      for (const joint of spec.setup.requiredJoints) {
        for (const landmark of JOINT_TO_LANDMARKS[joint]) {
          expect(declared.has(landmark)).toBe(true);
        }
      }
    }
  });

  it("the upper-body exercise does not require any leg landmark", () => {
    const spec = EXERCISES_BY_ID.get("standing-shoulder-abduction")!;
    const required = spec.setup.requiredLandmarks ?? [];
    for (const leg of ["LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_FOOT_INDEX"]) {
      expect(required).not.toContain(leg);
    }
  });

  it("the lower-body exercise does not require wrist or face landmarks", () => {
    const spec = EXERCISES_BY_ID.get("seated-knee-extension")!;
    const required = spec.setup.requiredLandmarks ?? [];
    for (const upper of ["LEFT_WRIST", "RIGHT_WRIST", "NOSE", "LEFT_EAR"]) {
      expect(required).not.toContain(upper);
    }
  });

  it("gives every exercise a plain-language framing hint", () => {
    for (const spec of EXERCISES) {
      expect(spec.setup.framingHint?.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("reference media", () => {
  it("every exercise ships demonstration material with instructions", () => {
    for (const spec of EXERCISES) {
      expect(spec.referenceMedia).toBeDefined();
      expect(spec.referenceMedia!.instructions.length).toBeGreaterThan(10);
      expect(spec.referenceMedia!.url.length).toBeGreaterThan(0);
    }
  });

  it("reference media is a local bundled asset, not a third-party URL", () => {
    // Keeps the exercise demo working offline and avoids leaking which
    // exercise a patient is doing to a third-party host.
    for (const spec of EXERCISES) {
      expect(spec.referenceMedia!.url.startsWith("/")).toBe(true);
    }
  });
});
