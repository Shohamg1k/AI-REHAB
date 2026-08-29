import { describe, expect, it } from "vitest";
import type { ExerciseSpec, JointAngles } from "@ai-rehab/contracts";
import { createRepSegmenterState, stepRepSegmenter } from "../src/index.js";

function angles(t: number, leftKnee: number): JointAngles {
  return {
    t,
    angles: { left_knee: leftKnee },
    confidence: { left_knee: 0.9 },
    symmetry: {},
    trunkLean: 1
  };
}

const spec: ExerciseSpec = {
  id: "test-knee-extension",
  displayName: "Test knee extension",
  rationale: "test fixture",
  provisional: true,
  targetRegions: ["knee"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 1,
  movementType: "strength",
  progression: null,
  regression: null,
  setup: { view: "front", posture: "seated", requiredJoints: ["left_knee"] },
  phases: [
    { name: "concentric", joint: "left_knee", enter: { angle: 160, direction: "above" } },
    { name: "eccentric", joint: "left_knee", enter: { angle: 100, direction: "below" } }
  ],
  criteria: [
    {
      id: "peak-extension",
      label: "Peak extension",
      joint: "left_knee",
      measure: "peak_angle",
      target: { min: 165, max: 180 },
      tolerance: { warn: 5, fail: 15 },
      weight: 1
    }
  ],
  compensations: [],
  cues: [],
  safety: { consecutiveFailedRepsToBlock: 3 }
};

/** Feed a full rep: rest -> rises to `peak` -> returns to `bottom`, one frame per 50ms. */
function feedRep(state: ReturnType<typeof createRepSegmenterState>, startT: number, peak: number, bottom: number) {
  const trajectory = [90, 120, 150, peak, 150, 120, bottom];
  let s = state;
  let closed = null;
  trajectory.forEach((a, i) => {
    const result = stepRepSegmenter(s, angles(startT + i * 50, a), spec, 0);
    s = result.state;
    if (result.closedRep) closed = result.closedRep;
  });
  return { state: s, closed };
}

describe("stepRepSegmenter", () => {
  it("counts exactly one rep for one full concentric/eccentric cycle", () => {
    const { closed } = feedRep(createRepSegmenterState(), 0, 175, 90);
    expect(closed).not.toBeNull();
    expect(closed!.rep.repIndex).toBe(0);
  });

  it("does not close a rep on a partial cycle (never returns below the eccentric threshold)", () => {
    let state = createRepSegmenterState();
    for (const a of [90, 120, 150, 175, 150, 130]) {
      const result = stepRepSegmenter(state, angles(a, a), spec, 0);
      state = result.state;
      expect(result.closedRep).toBeNull();
    }
  });

  it("captures the peak angle reached during the rep", () => {
    const { closed } = feedRep(createRepSegmenterState(), 0, 178, 90);
    expect(closed!.rep.peakAngles.left_knee).toBeCloseTo(178, 5);
  });

  it("counts two consecutive reps distinctly, incrementing repIndex", () => {
    let state = createRepSegmenterState();
    const first = feedRep(state, 0, 175, 90);
    expect(first.closed!.rep.repIndex).toBe(0);
    const second = feedRep(first.state, 1000, 172, 92);
    expect(second.closed!.rep.repIndex).toBe(1);
  });

  it("does not double-count on a jittery near-threshold oscillation", () => {
    // Oscillate just below the concentric threshold before actually crossing —
    // this is the "double-count on slow eccentric" failure mode from
    // docs/ROADMAP.md M1. It must not close two reps for one movement.
    let state = createRepSegmenterState();
    let closedCount = 0;
    const trajectory = [90, 120, 158, 159, 158, 161, 150, 120, 90];
    trajectory.forEach((a, i) => {
      const result = stepRepSegmenter(state, angles(i * 50, a), spec, 0);
      state = result.state;
      if (result.closedRep) closedCount += 1;
    });
    expect(closedCount).toBe(1);
  });

  it("computes a positive tempoMs proportional to elapsed time", () => {
    const { closed } = feedRep(createRepSegmenterState(), 0, 175, 90);
    expect(closed!.rep.tempoMs).toBeGreaterThan(0);
    expect(closed!.rep.tempoMs).toBe(300); // 6 steps * 50ms in feedRep's trajectory
  });

  it("honours a phase's minDurationMs before accepting the transition", () => {
    const specWithHold: ExerciseSpec = {
      ...spec,
      phases: [
        { name: "concentric", joint: "left_knee", enter: { angle: 160, direction: "above" }, minDurationMs: 500 },
        { name: "eccentric", joint: "left_knee", enter: { angle: 100, direction: "below" } }
      ]
    };
    let state = createRepSegmenterState();
    // Crosses 160 immediately (t=0), well before 500ms of "waiting" has passed.
    const early = stepRepSegmenter(state, angles(0, 175), specWithHold, 0);
    // cursor should NOT have advanced past phase 0 yet.
    expect(early.state.cursor).toBe(0);

    state = early.state;
    const late = stepRepSegmenter(state, angles(600, 175), specWithHold, 0);
    expect(late.state.cursor).toBe(1);
  });

  it("stamps the caller-provided setIndex onto the closed rep", () => {
    let state = createRepSegmenterState();
    let closed: { rep: { setIndex: number } } | null = null;
    for (const [i, a] of [90, 120, 150, 175, 150, 120, 90].entries()) {
      const result = stepRepSegmenter(state, angles(i * 50, a), spec, 2);
      state = result.state;
      if (result.closedRep) closed = result.closedRep;
    }
    expect(closed!.rep.setIndex).toBe(2);
  });
});
