import type { FormScore, SafetyVerdict } from "@ai-rehab/contracts";
import {
  computeJointAngles,
  createRepSegmenterState,
  evaluateSafety,
  scoreRep,
  stepRepSegmenter
} from "@ai-rehab/core";
import { getExerciseSpec } from "@ai-rehab/exercises";
import type { Fixture } from "./fixture.js";

/**
 * A rep below this score counts toward the safety gate's
 * `consecutiveFailedReps` input — mirrors the bookkeeping the patient app's
 * session loop is responsible for in production (packages/core/safety
 * takes the counter as external input by design; see CLAUDE.md invariant 3
 * — the gate itself has no state and no memory of prior reps).
 */
const PASS_SCORE_THRESHOLD = 50;

export type ReplayResult = {
  fixtureId: string;
  exerciseId: string;
  description: string;
  actualRepCount: number;
  avgFormScore: number | null;
  formScores: FormScore[];
  nonAllowVerdicts: SafetyVerdict[];
  firedRuleIds: string[];
  passed: boolean;
  failures: string[];
};

export function replayFixture(fixture: Fixture): ReplayResult {
  const spec = getExerciseSpec(fixture.exerciseId);
  if (!spec) {
    throw new Error(`fixture "${fixture.id}" references unknown exercise "${fixture.exerciseId}"`);
  }

  let segState = createRepSegmenterState();
  const formScores: FormScore[] = [];
  const nonAllowVerdicts: SafetyVerdict[] = [];
  const firedRuleIds = new Set<string>();
  let consecutiveFailedReps = 0;

  for (const frame of fixture.frames) {
    const angles = computeJointAngles(frame.world, frame.t);

    const verdict = evaluateSafety(
      { angles, consecutiveFailedReps },
      spec.safety,
      spec.regression,
      frame.t
    );
    if (verdict.verdict !== "allow") {
      nonAllowVerdicts.push(verdict);
      firedRuleIds.add(verdict.ruleId);
    }

    const step = stepRepSegmenter(segState, angles, spec, 0);
    segState = step.state;
    if (step.closedRep) {
      const score = scoreRep(step.closedRep.rep, step.closedRep.aux, spec.criteria, 1);
      formScores.push(score);
      consecutiveFailedReps = score.score <= PASS_SCORE_THRESHOLD ? consecutiveFailedReps + 1 : 0;
    }
  }

  const avgFormScore =
    formScores.length > 0 ? formScores.reduce((s, f) => s + f.score, 0) / formScores.length : null;

  const failures: string[] = [];
  const { expected } = fixture;

  if (formScores.length !== expected.repCount) {
    failures.push(`expected ${expected.repCount} rep(s), got ${formScores.length}`);
  }
  if (expected.avgFormScoreMin !== undefined && (avgFormScore ?? -1) < expected.avgFormScoreMin) {
    failures.push(`expected avg form score >= ${expected.avgFormScoreMin}, got ${avgFormScore?.toFixed(1) ?? "n/a"}`);
  }
  if (expected.avgFormScoreMax !== undefined && (avgFormScore ?? 101) > expected.avgFormScoreMax) {
    failures.push(`expected avg form score <= ${expected.avgFormScoreMax}, got ${avgFormScore?.toFixed(1) ?? "n/a"}`);
  }
  for (const ruleId of expected.requiredSafetyRuleIds ?? []) {
    if (!firedRuleIds.has(ruleId)) failures.push(`expected safety rule "${ruleId}" to fire — it never did`);
  }
  for (const tier of expected.forbiddenSafetyVerdicts ?? []) {
    if (nonAllowVerdicts.some((v) => v.verdict === tier)) {
      failures.push(`safety verdict "${tier}" fired but was forbidden for this fixture`);
    }
  }
  if (expected.expectSomeConfidenceBelow !== undefined) {
    const floor = expected.expectSomeConfidenceBelow;
    if (!formScores.some((f) => f.confidence < floor)) {
      failures.push(`expected some rep confidence below ${floor} — none were`);
    }
  }

  return {
    fixtureId: fixture.id,
    exerciseId: fixture.exerciseId,
    description: fixture.description,
    actualRepCount: formScores.length,
    avgFormScore,
    formScores,
    nonAllowVerdicts,
    firedRuleIds: [...firedRuleIds],
    passed: failures.length === 0,
    failures
  };
}

export function replayAll(fixtures: readonly Fixture[]): ReplayResult[] {
  return fixtures.map(replayFixture);
}
