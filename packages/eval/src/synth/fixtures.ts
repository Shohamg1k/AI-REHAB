import type { Fixture, FixtureExpectation } from "../fixture.js";
import {
  seatedElbowFlexionPose,
  seatedKneeExtensionPose,
  seatedNeckSideTiltPose,
  sitToStandPose,
  standingShoulderAbductionPose
} from "./skeleton.js";
import { cycleValueAt, frameTimestamps, type RepCycleSpec } from "./trajectory.js";

const DEFAULT_CYCLE: Omit<RepCycleSpec, "restValue" | "peakValue"> = {
  riseMs: 700,
  holdMs: 150,
  fallMs: 700,
  gapMs: 400
};
const FRAME_INTERVAL_MS = 33; // ~30fps, matching the fast-loop frame budget (ARCHITECTURE.md §4)

function kneeExtensionFixture(opts: {
  id: string;
  description: string;
  reps: number;
  peakAngle: number;
  restAngle?: number;
  trunkLean?: number;
  visibility?: number;
  expected: FixtureExpectation;
}): Fixture {
  const restAngle = opts.restAngle ?? 90;
  const cycle: RepCycleSpec = { ...DEFAULT_CYCLE, restValue: restAngle, peakValue: opts.peakAngle };
  const timestamps = frameTimestamps({ reps: opts.reps, frameIntervalMs: FRAME_INTERVAL_MS, cycle: DEFAULT_CYCLE });

  return {
    id: opts.id,
    exerciseId: "seated-knee-extension",
    description: opts.description,
    source: "synthetic",
    frames: timestamps.map((t) => ({
      t,
      world: seatedKneeExtensionPose(cycleValueAt(cycle, t), opts.trunkLean ?? 2, opts.visibility ?? 1)
    })),
    expected: opts.expected
  };
}

/**
 * Elbow flexion runs "backwards": the angle *falls* through the rep, so
 * `restValue` is the straight arm and `peakValue` is the bent one.
 */
function elbowFlexionFixture(opts: {
  id: string;
  description: string;
  reps: number;
  flexedAngle: number;
  straightAngle?: number;
  trunkLean?: number;
  expected: FixtureExpectation;
}): Fixture {
  const cycle: RepCycleSpec = {
    ...DEFAULT_CYCLE,
    restValue: opts.straightAngle ?? 175,
    peakValue: opts.flexedAngle
  };
  const timestamps = frameTimestamps({ reps: opts.reps, frameIntervalMs: FRAME_INTERVAL_MS, cycle: DEFAULT_CYCLE });

  return {
    id: opts.id,
    exerciseId: "seated-elbow-flexion",
    description: opts.description,
    source: "synthetic",
    frames: timestamps.map((t) => ({
      t,
      world: seatedElbowFlexionPose(cycleValueAt(cycle, t), opts.trunkLean ?? 2)
    })),
    expected: opts.expected
  };
}

function neckSideTiltFixture(opts: {
  id: string;
  description: string;
  reps: number;
  peakAngle: number;
  restAngle?: number;
  trunkLean?: number;
  expected: FixtureExpectation;
}): Fixture {
  const cycle: RepCycleSpec = {
    ...DEFAULT_CYCLE,
    restValue: opts.restAngle ?? 2,
    peakValue: opts.peakAngle
  };
  // Neck work is coached slowly, so the cycle is stretched to match the
  // spec's 2.5-7s tempo target rather than reusing the default.
  const slowCycle = { ...DEFAULT_CYCLE, riseMs: 1600, holdMs: 400, fallMs: 1600, gapMs: 600 };
  const timestamps = frameTimestamps({ reps: opts.reps, frameIntervalMs: FRAME_INTERVAL_MS, cycle: slowCycle });
  const slow: RepCycleSpec = { ...slowCycle, restValue: opts.restAngle ?? 2, peakValue: opts.peakAngle };
  void cycle;

  return {
    id: opts.id,
    exerciseId: "seated-neck-side-tilt",
    description: opts.description,
    source: "synthetic",
    frames: timestamps.map((t) => ({
      t,
      world: seatedNeckSideTiltPose(cycleValueAt(slow, t), opts.trunkLean ?? 2)
    })),
    expected: opts.expected
  };
}

function shoulderAbductionFixture(opts: {
  id: string;
  description: string;
  reps: number;
  peakAngle: number;
  restAngle?: number;
  trunkLean?: number;
  expected: FixtureExpectation;
}): Fixture {
  const restAngle = opts.restAngle ?? 10;
  const cycle: RepCycleSpec = { ...DEFAULT_CYCLE, restValue: restAngle, peakValue: opts.peakAngle };
  const timestamps = frameTimestamps({ reps: opts.reps, frameIntervalMs: FRAME_INTERVAL_MS, cycle: DEFAULT_CYCLE });

  return {
    id: opts.id,
    exerciseId: "standing-shoulder-abduction",
    description: opts.description,
    source: "synthetic",
    frames: timestamps.map((t) => ({
      t,
      world: standingShoulderAbductionPose(cycleValueAt(cycle, t), opts.trunkLean ?? 2)
    })),
    expected: opts.expected
  };
}

function sitToStandFixture(opts: {
  id: string;
  description: string;
  reps: number;
  peakHipAngle: number;
  peakKneeAngle: number;
  restAngle?: number;
  leanAmplitudeDeg?: number;
  expected: FixtureExpectation;
}): Fixture {
  const restAngle = opts.restAngle ?? 95;
  const hipCycle: RepCycleSpec = { ...DEFAULT_CYCLE, restValue: restAngle, peakValue: opts.peakHipAngle };
  const kneeCycle: RepCycleSpec = { ...DEFAULT_CYCLE, restValue: restAngle, peakValue: opts.peakKneeAngle };
  // progress (0..1) shares the same timing curve so the trunk-lean bump stays in sync with the stand.
  const progressCycle: RepCycleSpec = { ...DEFAULT_CYCLE, restValue: 0, peakValue: 1 };
  const timestamps = frameTimestamps({ reps: opts.reps, frameIntervalMs: FRAME_INTERVAL_MS, cycle: DEFAULT_CYCLE });

  return {
    id: opts.id,
    exerciseId: "sit-to-stand",
    description: opts.description,
    source: "synthetic",
    frames: timestamps.map((t) => ({
      t,
      world: sitToStandPose(
        cycleValueAt(progressCycle, t),
        cycleValueAt(hipCycle, t),
        cycleValueAt(kneeCycle, t),
        opts.leanAmplitudeDeg ?? 35
      )
    })),
    expected: opts.expected
  };
}

/**
 * The MVP fixture library (I2). Every configured safety `ruleId` across the
 * three exercise specs has at least one fixture proving it fires
 * (CLAUDE.md §4: "no fixture, no merge") — see the "safety —" ids below —
 * alongside good-form and insufficient-ROM fixtures per exercise, and one
 * low-confidence fixture for the FORM_SCORE_CONFIDENCE_FLOOR gate.
 */
export const FIXTURES: Fixture[] = [
  kneeExtensionFixture({
    id: "knee-extension-good-form",
    description: "Three clean reps, full extension, upright trunk.",
    reps: 3,
    peakAngle: 175,
    expected: { repCount: 3, avgFormScoreMin: 80, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  kneeExtensionFixture({
    id: "knee-extension-insufficient-rom",
    description: "Three reps that never reach target extension (patient short-changing the range).",
    reps: 3,
    peakAngle: 145,
    expected: { repCount: 3, avgFormScoreMax: 60, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  kneeExtensionFixture({
    id: "knee-extension-safety-trunk-lean",
    description: "Patient leans back excessively to help kick the leg up — must block.",
    reps: 1,
    peakAngle: 175,
    trunkLean: 35,
    expected: { repCount: 1, requiredSafetyRuleIds: ["max_trunk_lean"] }
  }),
  kneeExtensionFixture({
    id: "knee-extension-safety-consecutive-fails",
    description: "Five reps in a row miss target — must escalate to contact clinician.",
    reps: 5,
    peakAngle: 140,
    expected: { repCount: 5, requiredSafetyRuleIds: ["consecutive_failed_reps"] }
  }),
  kneeExtensionFixture({
    id: "knee-extension-low-confidence",
    description: "Landmarks barely visible throughout (dim room / poor framing) — score must be gated as low confidence.",
    reps: 2,
    peakAngle: 175,
    visibility: 0.3,
    expected: { repCount: 2, expectSomeConfidenceBelow: 0.5 }
  }),

  shoulderAbductionFixture({
    id: "shoulder-abduction-good-form",
    description: "Three clean reps to shoulder height, upright trunk.",
    reps: 3,
    peakAngle: 95,
    expected: { repCount: 3, avgFormScoreMin: 80, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  shoulderAbductionFixture({
    id: "shoulder-abduction-insufficient-rom",
    description: "Arm never raised past ~half of target height.",
    reps: 3,
    peakAngle: 50,
    expected: { repCount: 3, avgFormScoreMax: 60, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  shoulderAbductionFixture({
    id: "shoulder-abduction-safety-overhead",
    description: "Arm raised past the configured safe ceiling — must block.",
    reps: 1,
    peakAngle: 178,
    expected: { repCount: 1, requiredSafetyRuleIds: ["max_angle_right_shoulder"] }
  }),

  elbowFlexionFixture({
    id: "elbow-flexion-good-form",
    description: "Three clean curls through a full range, body still.",
    reps: 3,
    flexedAngle: 45,
    expected: { repCount: 3, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  elbowFlexionFixture({
    id: "elbow-flexion-safety-overbend",
    description: "Elbow forced past the configured safe floor — must block.",
    reps: 1,
    flexedAngle: 18,
    expected: { repCount: 1, requiredSafetyRuleIds: ["min_angle_right_elbow"] }
  }),

  neckSideTiltFixture({
    id: "neck-tilt-good-form",
    description: "Three slow, controlled tilts within a comfortable range.",
    reps: 3,
    peakAngle: 27,
    expected: { repCount: 3, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  neckSideTiltFixture({
    id: "neck-tilt-safety-forced-range",
    description: "Neck forced well past the safe cap — must block. The tightest cap in the catalogue, deliberately.",
    reps: 1,
    peakAngle: 52,
    expected: { repCount: 1, requiredSafetyRuleIds: ["max_angle_neck"] }
  }),

  sitToStandFixture({
    id: "sit-to-stand-good-form",
    description: "Three clean stands, full hip/knee extension, normal momentum lean.",
    reps: 3,
    peakHipAngle: 175,
    peakKneeAngle: 175,
    expected: { repCount: 3, avgFormScoreMin: 70, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  sitToStandFixture({
    id: "sit-to-stand-insufficient-rom",
    description: "Half-stands — never reaches full hip/knee extension.",
    reps: 3,
    peakHipAngle: 130,
    peakKneeAngle: 130,
    expected: { repCount: 3, avgFormScoreMax: 60, forbiddenSafetyVerdicts: ["block", "escalate"] }
  }),
  sitToStandFixture({
    id: "sit-to-stand-safety-trunk-lean",
    description: "Excessive forward lean using momentum instead of leg strength — must block.",
    reps: 1,
    peakHipAngle: 175,
    peakKneeAngle: 175,
    leanAmplitudeDeg: 60,
    expected: { repCount: 1, requiredSafetyRuleIds: ["max_trunk_lean"] }
  })
];
