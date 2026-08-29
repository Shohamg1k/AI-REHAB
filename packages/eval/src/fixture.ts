import type { Landmark, SafetyVerdict } from "@ai-rehab/contracts";

/**
 * A fixture is a landmark stream plus expected outputs (ARCHITECTURE.md §6).
 * MVP scope note: fixtures store `world` (metric) frames only — sufficient
 * to drive computeJointAngles -> reps -> form -> safety, which is what I2's
 * stated purpose covers (rep-count accuracy, form-score distribution,
 * safety ruleId firing). Capture-quality / A7 already has direct unit
 * coverage in packages/core/test/pose.test.ts. Landmark-level fixtures
 * built from real recordings (rather than synthetic construction) are a
 * natural fast-follow once real device captures exist — see docs/STATUS.md.
 */
export type Fixture = {
  id: string;
  exerciseId: string;
  description: string;
  source: "synthetic" | "recorded";
  frames: Array<{ t: number; world: readonly Landmark[] }>;
  expected: FixtureExpectation;
};

export type FixtureExpectation = {
  repCount: number;
  avgFormScoreMin?: number;
  avgFormScoreMax?: number;
  /** Every one of these ruleIds must fire at least once during replay. */
  requiredSafetyRuleIds?: string[];
  /** These verdict tiers must never occur during replay. */
  forbiddenSafetyVerdicts?: SafetyVerdict["verdict"][];
  /** At least one closed rep's FormScore.confidence must fall below this. */
  expectSomeConfidenceBelow?: number;
};
