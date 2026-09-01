import type {
  JointName,
  ReportCompensationSummary,
  ReportCriterionSummary,
  ReportDataQuality,
  ReportExerciseSummary,
  ReportRomChange,
  ReportTrendPoint,
  SessionEvent
} from "@ai-rehab/contracts";

/**
 * F1 — the per-exercise depth of the progress report.
 *
 * Split out of `projections.ts` because it is the substantial half and has
 * its own shape: everything here answers "what specifically is going wrong",
 * where the rest of the report answers "how much happened".
 *
 * **Why this exists.** The report used to reduce every rep to one number.
 * `Average form 62` tells a clinician something is wrong; it does not tell
 * them what, and it cannot be acted on. `FormScore.breakdown` has carried the
 * per-criterion value, target and pass/fail since M1, and `compensations`
 * has carried named compensation patterns — the report simply averaged them
 * away. This keeps them.
 *
 * Mirrors `FORM_SCORE_CONFIDENCE_FLOOR` for the same reason `projections.ts`
 * does: `apps/api` may depend on `@ai-rehab/contracts` only.
 */
const FORM_SCORE_CONFIDENCE_FLOOR = 0.5;

/** Distance outside the target band. Zero when inside it. */
export function missBy(value: number, target: { min: number; max: number }): number {
  if (value < target.min) return target.min - value;
  if (value > target.max) return value - target.max;
  return 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

type CriterionAcc = {
  criterionId: string;
  label: string;
  reps: number;
  failed: number;
  warned: number;
  valueSum: number;
  missSum: number;
  missCount: number;
  target: { min: number; max: number };
};

type CompensationAcc = { ruleId: string; label: string; occurrences: number; severitySum: number };

type ExerciseAcc = {
  exerciseId: string;
  sessions: Set<string>;
  totalReps: number;
  scoredReps: number;
  scoreSum: number;
  prescribedReps: number;
  criteria: Map<string, CriterionAcc>;
  compensations: Map<string, CompensationAcc>;
  /** sessionId -> joint -> best peak that session. */
  peaksBySession: Map<string, Map<string, number>>;
  sessionOrder: string[];
};

export type SessionWithEvents = { sessionId: string; events: SessionEvent[]; startedAt: string };

/**
 * Build the per-exercise summaries.
 *
 * Only reps that cleared the confidence floor contribute to criterion and
 * compensation statistics. A rep the tracker could barely see would otherwise
 * report a confident-looking "failed" against a criterion it never actually
 * measured — the same rule that keeps unscored reps out of the average, applied
 * one level deeper (G7).
 */
export function computeExerciseSummaries(
  sessions: readonly SessionWithEvents[]
): ReportExerciseSummary[] {
  const byExercise = new Map<string, ExerciseAcc>();

  for (const session of sessions) {
    let currentExerciseId: string | null = null;

    for (const event of session.events) {
      if (event.type === "exercise_started") {
        currentExerciseId = event.exerciseId;
        const acc = ensure(byExercise, currentExerciseId, session.sessionId);
        acc.sessions.add(session.sessionId);
        acc.prescribedReps += event.prescribed.sets * event.prescribed.reps;
        continue;
      }

      if (event.type !== "rep_completed" || !currentExerciseId) continue;
      const acc = ensure(byExercise, currentExerciseId, session.sessionId);
      acc.sessions.add(session.sessionId);
      acc.totalReps += 1;

      // Peak angles are recorded for every rep, scored or not: range of
      // motion is a geometric fact about the movement, not a judgement of it,
      // and it is measurable on reps that were too noisy to score.
      const peaks = acc.peaksBySession.get(session.sessionId) ?? new Map<string, number>();
      acc.peaksBySession.set(session.sessionId, peaks);
      if (!acc.sessionOrder.includes(session.sessionId)) acc.sessionOrder.push(session.sessionId);
      for (const [joint, peak] of Object.entries(event.rep.peakAngles) as Array<
        [JointName, number]
      >) {
        const prev = peaks.get(joint);
        if (prev === undefined || peak > prev) peaks.set(joint, peak);
      }

      if (event.score.confidence < FORM_SCORE_CONFIDENCE_FLOOR) continue;
      acc.scoredReps += 1;
      acc.scoreSum += event.score.score;

      for (const item of event.score.breakdown) {
        const criterion = acc.criteria.get(item.criterionId) ?? {
          criterionId: item.criterionId,
          label: item.label,
          reps: 0,
          failed: 0,
          warned: 0,
          valueSum: 0,
          missSum: 0,
          missCount: 0,
          target: item.target
        };
        acc.criteria.set(item.criterionId, criterion);
        criterion.reps += 1;
        criterion.valueSum += item.value;
        if (item.status === "fail") criterion.failed += 1;
        if (item.status === "warn") criterion.warned += 1;
        const miss = missBy(item.value, item.target);
        if (miss > 0) {
          criterion.missSum += miss;
          criterion.missCount += 1;
        }
      }

      for (const compensation of event.score.compensations) {
        const existing = acc.compensations.get(compensation.ruleId) ?? {
          ruleId: compensation.ruleId,
          label: compensation.label,
          occurrences: 0,
          severitySum: 0
        };
        acc.compensations.set(compensation.ruleId, existing);
        existing.occurrences += 1;
        existing.severitySum += compensation.severity;
      }
    }
  }

  return [...byExercise.values()].map(finalise);
}

function ensure(map: Map<string, ExerciseAcc>, exerciseId: string, _sessionId: string): ExerciseAcc {
  const existing = map.get(exerciseId);
  if (existing) return existing;
  const created: ExerciseAcc = {
    exerciseId,
    sessions: new Set(),
    totalReps: 0,
    scoredReps: 0,
    scoreSum: 0,
    prescribedReps: 0,
    criteria: new Map(),
    compensations: new Map(),
    peaksBySession: new Map(),
    sessionOrder: []
  };
  map.set(exerciseId, created);
  return created;
}

function finalise(acc: ExerciseAcc): ReportExerciseSummary {
  const criteria: ReportCriterionSummary[] = [...acc.criteria.values()]
    .map((c) => ({
      criterionId: c.criterionId,
      label: c.label,
      reps: c.reps,
      failed: c.failed,
      warned: c.warned,
      avgValue: round1(c.valueSum / c.reps),
      target: c.target,
      avgMissBy: c.missCount > 0 ? round1(c.missSum / c.missCount) : 0
    }))
    // Worst first, so the clinician reads the actionable line without
    // scanning. Failure *rate* decides, then raw failure count; the tie-break
    // is deliberately not `avgMissBy`, because criteria carry different units
    // and ranking 600ms above 8.2° is comparing nothing to nothing. criterionId
    // last, so equal criteria order deterministically rather than by hash.
    .sort(
      (a, b) =>
        b.failed / b.reps - a.failed / a.reps ||
        b.failed - a.failed ||
        a.criterionId.localeCompare(b.criterionId)
    );

  const compensations: ReportCompensationSummary[] = [...acc.compensations.values()]
    .map((c) => ({
      ruleId: c.ruleId,
      label: c.label,
      occurrences: c.occurrences,
      avgSeverity: round1(c.severitySum / c.occurrences)
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    exerciseId: acc.exerciseId,
    sessions: acc.sessions.size,
    totalReps: acc.totalReps,
    scoredReps: acc.scoredReps,
    avgFormScore: acc.scoredReps > 0 ? round1(acc.scoreSum / acc.scoredReps) : null,
    completionRate:
      acc.prescribedReps > 0 ? round1((acc.totalReps / acc.prescribedReps) * 100) / 100 : null,
    criteria,
    compensations,
    romChange: computeRomChange(acc)
  };
}

/**
 * Best peak in the first session against best peak in the last.
 *
 * Peak rather than mean because peak is what the exercise trains — a patient
 * whose average dips because they tired still gained range if their best
 * improved. Requires two sessions; with one there is nothing to compare and
 * the joint is omitted rather than reported as "no change".
 */
function computeRomChange(acc: ExerciseAcc): ReportRomChange[] {
  if (acc.sessionOrder.length < 2) return [];
  const first = acc.peaksBySession.get(acc.sessionOrder[0]!);
  const last = acc.peaksBySession.get(acc.sessionOrder[acc.sessionOrder.length - 1]!);
  if (!first || !last) return [];

  const out: ReportRomChange[] = [];
  for (const [joint, firstPeak] of first) {
    const lastPeak = last.get(joint);
    if (lastPeak === undefined) continue;
    out.push({
      joint,
      firstPeak: round1(firstPeak),
      lastPeak: round1(lastPeak),
      changeDeg: round1(lastPeak - firstPeak),
      sessions: acc.sessionOrder.length
    });
  }
  return out.sort((a, b) => Math.abs(b.changeDeg) - Math.abs(a.changeDeg));
}

/** Average form score per session, oldest first. */
export function computeFormTrend(sessions: readonly SessionWithEvents[]): ReportTrendPoint[] {
  const points: ReportTrendPoint[] = [];
  for (const session of sessions) {
    let sum = 0;
    let scored = 0;
    for (const event of session.events) {
      if (event.type !== "rep_completed") continue;
      if (event.score.confidence < FORM_SCORE_CONFIDENCE_FLOOR) continue;
      sum += event.score.score;
      scored += 1;
    }
    if (scored > 0) {
      points.push({ at: session.startedAt, avgFormScore: round1(sum / scored), scoredReps: scored });
    }
  }
  return points.sort((a, b) => a.at.localeCompare(b.at));
}

export function computeDataQuality(sessions: readonly SessionWithEvents[]): ReportDataQuality {
  let total = 0;
  let scored = 0;
  let confidenceSum = 0;

  for (const session of sessions) {
    for (const event of session.events) {
      if (event.type !== "rep_completed") continue;
      total += 1;
      confidenceSum += event.score.confidence;
      if (event.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR) scored += 1;
    }
  }

  return {
    scoredRatio: total > 0 ? Math.round((scored / total) * 100) / 100 : 0,
    unscoredReps: total - scored,
    meanConfidence: total > 0 ? Math.round((confidenceSum / total) * 100) / 100 : null
  };
}
