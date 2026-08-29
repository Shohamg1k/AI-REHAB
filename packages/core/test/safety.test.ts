import { describe, expect, it } from "vitest";
import type { JointAngles, SafetyThresholds } from "@ai-rehab/contracts";
import { evaluateSafety } from "../src/index.js";

function angles(overrides: Partial<JointAngles["angles"]> = {}, trunkLean = 2): JointAngles {
  // 120° sits comfortably outside both the min(60)/max(185) caution bands
  // (caution starts at 66° and 166.5° respectively) so the "allow" case is
  // unambiguous; tests that want to exercise a threshold override this.
  return {
    t: 0,
    angles: { left_knee: 120, ...overrides },
    confidence: { left_knee: 0.9 },
    symmetry: {},
    trunkLean
  };
}

const thresholds: SafetyThresholds = {
  maxAngle: { left_knee: 185 },
  minAngle: { left_knee: 60 },
  maxTrunkLean: 30,
  instabilityVelocity: 1.5,
  consecutiveFailedRepsToBlock: 3
};

describe("evaluateSafety — E1 real-time gate", () => {
  it("allows a frame within every threshold", () => {
    const verdict = evaluateSafety(
      { angles: angles(), consecutiveFailedReps: 0 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("allow");
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  it("blocks when a joint angle exceeds maxAngle, with the offending threshold in the verdict", () => {
    const verdict = evaluateSafety(
      { angles: angles({ left_knee: 190 }), consecutiveFailedReps: 0 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("block");
    expect(verdict.ruleId).toBe("max_angle_left_knee");
    expect(verdict.threshold).toEqual({ name: "maxAngle.left_knee", limit: 185, observed: 190 });
  });

  it("blocks when a joint angle drops below minAngle", () => {
    const verdict = evaluateSafety(
      { angles: angles({ left_knee: 40 }), consecutiveFailedReps: 0 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("block");
    expect(verdict.ruleId).toBe("min_angle_left_knee");
  });

  it("downgrades (does not block) when approaching but not yet crossing a threshold", () => {
    const verdict = evaluateSafety(
      { angles: angles({ left_knee: 180 }), consecutiveFailedReps: 0 }, // 180/185 = 97% > 90% caution ratio
      thresholds,
      "easier-variant",
      0
    );
    expect(verdict.verdict).toBe("downgrade");
    expect(verdict.downgradeTo).toBe("easier-variant");
  });

  it("blocks on excessive trunk lean", () => {
    const verdict = evaluateSafety(
      { angles: angles({}, 35), consecutiveFailedReps: 0 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("block");
    expect(verdict.ruleId).toBe("max_trunk_lean");
  });

  it("escalates on repeated consecutive failed reps", () => {
    const verdict = evaluateSafety(
      { angles: angles(), consecutiveFailedReps: 3 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("escalate");
    expect(verdict.ruleId).toBe("consecutive_failed_reps");
  });

  it("escalates on instability velocity when supplied", () => {
    const verdict = evaluateSafety(
      { angles: angles(), consecutiveFailedReps: 0, instabilityVelocity: 2.0 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("escalate");
    expect(verdict.ruleId).toBe("instability_velocity");
  });

  it("never softens the outcome when multiple rules fire at once — escalate beats block", () => {
    const verdict = evaluateSafety(
      { angles: angles({ left_knee: 190 }), consecutiveFailedReps: 3 },
      thresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("escalate"); // consecutive-failed-reps outranks the angle block
  });

  it("ignores thresholds that are not configured for this exercise", () => {
    const looseThresholds: SafetyThresholds = { consecutiveFailedRepsToBlock: 99 };
    const verdict = evaluateSafety(
      { angles: angles({ left_knee: 999 }), consecutiveFailedReps: 0 },
      looseThresholds,
      null,
      0
    );
    expect(verdict.verdict).toBe("allow");
  });
});
