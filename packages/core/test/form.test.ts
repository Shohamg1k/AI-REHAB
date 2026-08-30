import { describe, expect, it } from "vitest";
import type { FormCriterion, RepEvent } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR, isFailedRep, scoreRep, type RepAuxMetrics } from "../src/index.js";

const baseRep: RepEvent = {
  t: 1000,
  repIndex: 0,
  setIndex: 0,
  phaseTimings: {},
  peakAngles: { left_knee: 178 },
  endAngles: { left_knee: 92 },
  tempoMs: 1200,
  meanConfidence: 0.9
};

const aux: RepAuxMetrics = {
  peakTrunkLean: 3,
  peakSymmetry: {},
  temporal: {
    rangeOfMotion: 86,
    smoothness: 0.8,
    peakVelocity: 120,
    phaseBalance: 0.9,
    stability: 0.9,
    sampleCount: 30
  }
};

const criteria: FormCriterion[] = [
  {
    id: "peak-extension",
    label: "Peak extension",
    joint: "left_knee",
    measure: "peak_angle",
    target: { min: 165, max: 180 },
    tolerance: { warn: 5, fail: 15 },
    weight: 2
  },
  {
    id: "tempo",
    label: "Controlled tempo",
    joint: "left_knee",
    measure: "tempo_ms",
    target: { min: 800, max: 3000 },
    tolerance: { warn: 200, fail: 600 },
    weight: 1
  }
];

describe("scoreRep", () => {
  it("scores 100 when every criterion is within target", () => {
    const score = scoreRep(baseRep, aux, criteria, 1);
    expect(score.score).toBe(100);
    expect(score.breakdown.every((b) => b.status === "ok")).toBe(true);
    expect(score.reason).toMatch(/within target/i);
  });

  it("docks points proportional to weight when a criterion fails", () => {
    const shortRep: RepEvent = { ...baseRep, peakAngles: { left_knee: 140 } }; // way under 165 target
    const score = scoreRep(shortRep, aux, criteria, 1);
    expect(score.score).toBeLessThan(100);
    const peakItem = score.breakdown.find((b) => b.criterionId === "peak-extension")!;
    expect(peakItem.status).toBe("fail");
    expect(score.reason).toMatch(/peak extension/i);
  });

  it("scores warn (partial credit) inside the warn-to-fail band", () => {
    const closeRep: RepEvent = { ...baseRep, peakAngles: { left_knee: 155 } }; // 10° short — between warn(5) and fail(15)
    const score = scoreRep(closeRep, aux, criteria, 1);
    const peakItem = score.breakdown.find((b) => b.criterionId === "peak-extension")!;
    expect(peakItem.status).toBe("warn");
  });

  it("excludes an unmeasurable criterion rather than penalising it, and lowers confidence", () => {
    const noJoint: RepEvent = { ...baseRep, peakAngles: {} };
    const score = scoreRep(noJoint, aux, criteria, 1);
    const peakItem = score.breakdown.find((b) => b.criterionId === "peak-extension")!;
    expect(Number.isNaN(peakItem.value)).toBe(true);
    expect(peakItem.contribution).toBe(0);
    expect(score.confidence).toBeLessThan(baseRep.meanConfidence);
  });

  it("scales confidence down with capture quality", () => {
    const full = scoreRep(baseRep, aux, criteria, 1);
    const degraded = scoreRep(baseRep, aux, criteria, 0.4);
    expect(degraded.confidence).toBeLessThan(full.confidence);
  });

  it("never returns a score outside 0..100", () => {
    const terrible: RepEvent = { ...baseRep, peakAngles: { left_knee: 0 }, tempoMs: 50 };
    const score = scoreRep(terrible, aux, criteria, 1);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it("documents the confidence floor UI code gates on", () => {
    expect(FORM_SCORE_CONFIDENCE_FLOOR).toBeGreaterThan(0);
    expect(FORM_SCORE_CONFIDENCE_FLOOR).toBeLessThan(1);
  });

  it("always returns an empty compensations array — A5 is not built in the MVP", () => {
    const score = scoreRep(baseRep, aux, criteria, 1);
    expect(score.compensations).toEqual([]);
  });
});

describe("isFailedRep — what counts toward the safety gate", () => {
  it("counts a rep whose criterion failed outright, independent of the aggregate", () => {
    // Why this replaced the old `score <= 50` cutoff: with the real
    // seated-knee-extension weights, a rep reaching 140 deg of a 165-180 deg
    // target scores 52 — above any cutoff you would pick, while having
    // missed the entire point of the exercise. Asking "did a criterion
    // fail" is independent of how the weighted average happens to land.
    const shortRep: RepEvent = { ...baseRep, peakAngles: { left_knee: 140 } };
    const score = scoreRep(shortRep, aux, criteria, 1);
    expect(score.breakdown.find((b) => b.criterionId === "peak-extension")?.status).toBe("fail");
    expect(isFailedRep(score)).toBe(true);
  });

  it("does not count a clean rep", () => {
    expect(isFailedRep(scoreRep(baseRep, aux, criteria, 1))).toBe(false);
  });

  it("does not count a rep that only warns", () => {
    const closeRep: RepEvent = { ...baseRep, peakAngles: { left_knee: 158 } };
    const score = scoreRep(closeRep, aux, criteria, 1);
    expect(score.breakdown.some((b) => b.status === "warn")).toBe(true);
    expect(isFailedRep(score)).toBe(false);
  });

  it("does not count an unmeasurable criterion as a failure", () => {
    const noJoint: RepEvent = { ...baseRep, peakAngles: {} };
    expect(isFailedRep(scoreRep(noJoint, aux, criteria, 1))).toBe(false);
  });
});
