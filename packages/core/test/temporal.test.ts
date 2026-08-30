import { describe, expect, it } from "vitest";
import {
  computeTemporalMetrics,
  repConsistency,
  MIN_TEMPORAL_SAMPLES,
  type AngleSample
} from "../src/index.js";

/** A rep traversed at constant speed — the reference "controlled" movement. */
function steadyRep(from: number, to: number, samples = 20, intervalMs = 40): AngleSample[] {
  return Array.from({ length: samples }, (_, i) => ({
    t: i * intervalMs,
    angle: from + ((to - from) * i) / (samples - 1)
  }));
}

/**
 * Same endpoints and therefore the exact same range of motion, but covered
 * in lurch-then-stall steps instead of continuously. Keeping the range
 * identical is the point: it isolates smoothness from range.
 */
function jerkyRep(from: number, to: number, samples = 20, intervalMs = 40): AngleSample[] {
  const steps = 4;
  return Array.from({ length: samples }, (_, i) => {
    const progress = i / (samples - 1);
    const quantised = Math.round(progress * steps) / steps;
    return { t: i * intervalMs, angle: from + (to - from) * quantised };
  });
}

describe("computeTemporalMetrics", () => {
  it("returns empty metrics when the rep was observed too sparsely to judge", () => {
    const metrics = computeTemporalMetrics(steadyRep(90, 170, MIN_TEMPORAL_SAMPLES - 1), []);
    expect(metrics.sampleCount).toBeLessThan(MIN_TEMPORAL_SAMPLES);
    expect(metrics.smoothness).toBe(0);
  });

  it("measures range of motion as peak-to-trough travel", () => {
    const metrics = computeTemporalMetrics(steadyRep(90, 170), []);
    expect(metrics.rangeOfMotion).toBeCloseTo(80, 1);
  });

  it("scores a steady movement as smoother than a jerky one of equal range", () => {
    const steady = computeTemporalMetrics(steadyRep(90, 170), []);
    const jerky = computeTemporalMetrics(jerkyRep(90, 170), []);
    expect(steady.rangeOfMotion).toBeCloseTo(jerky.rangeOfMotion, 0);
    expect(steady.smoothness).toBeGreaterThan(jerky.smoothness);
  });

  it("keeps smoothness scale-free — a fast controlled rep scores like a slow one", () => {
    const slow = computeTemporalMetrics(steadyRep(90, 170, 20, 80), []);
    const fast = computeTemporalMetrics(steadyRep(90, 170, 20, 20), []);
    expect(Math.abs(slow.smoothness - fast.smoothness)).toBeLessThan(0.05);
  });

  it("reports higher peak velocity for a rep thrown with momentum", () => {
    const controlled = computeTemporalMetrics(steadyRep(90, 170, 20, 80), []);
    const thrown = computeTemporalMetrics(steadyRep(90, 170, 20, 15), []);
    expect(thrown.peakVelocity).toBeGreaterThan(controlled.peakVelocity);
  });

  it("scores phase balance high when lifting and lowering take equal time", () => {
    const up = steadyRep(90, 170, 12);
    const down = steadyRep(170, 90, 12).map((s) => ({ ...s, t: s.t + 12 * 40 }));
    const metrics = computeTemporalMetrics([...up, ...down], []);
    expect(metrics.phaseBalance).toBeGreaterThan(0.9);
  });

  it("scores phase balance low when the return is rushed", () => {
    const up = steadyRep(90, 170, 18);
    const down = steadyRep(170, 90, 3).map((s) => ({ ...s, t: s.t + 18 * 40 }));
    const metrics = computeTemporalMetrics([...up, ...down], []);
    expect(metrics.phaseBalance).toBeLessThan(0.7);
  });

  it("scores stability from trunk steadiness across the rep", () => {
    const samples = steadyRep(90, 170);
    const steadyTrunk = computeTemporalMetrics(samples, samples.map(() => 4));
    const wobblyTrunk = computeTemporalMetrics(
      samples,
      samples.map((_, i) => (i % 2 === 0 ? 0 : 28))
    );
    expect(steadyTrunk.stability).toBeGreaterThan(wobblyTrunk.stability);
    expect(steadyTrunk.stability).toBeGreaterThan(0.9);
  });

  it("keeps every score inside 0..1", () => {
    for (const samples of [steadyRep(90, 170), jerkyRep(20, 175), steadyRep(100, 100)]) {
      const m = computeTemporalMetrics(samples, [3, 4, 5]);
      for (const value of [m.smoothness, m.phaseBalance, m.stability]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("repConsistency", () => {
  it("scores a set of near-identical reps as highly consistent", () => {
    expect(repConsistency([80, 79, 81, 80])).toBeGreaterThan(0.9);
  });

  it("scores a drifting set lower than a steady one", () => {
    expect(repConsistency([80, 62, 45, 30])).toBeLessThan(repConsistency([80, 79, 81, 80]));
  });

  it("treats a single rep as trivially consistent rather than undefined", () => {
    expect(repConsistency([80])).toBe(1);
    expect(repConsistency([])).toBe(1);
  });
});
