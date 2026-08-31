import type {
  AdherenceDay,
  BaselineEntry,
  JointName,
  ProgressReport,
  ReportObservation,
  ReportPainEntry,
  ReportSafetyEvent,
  RomTrendSeries,
  SessionEvent,
  SessionSummary
} from "@ai-rehab/contracts";

/**
 * G2 — pure projection logic over the raw event log, shared by both store
 * implementations so aggregation is written once regardless of where the
 * events physically live.
 *
 * Mirrors `FORM_SCORE_CONFIDENCE_FLOOR` from `@ai-rehab/core` as a literal
 * rather than importing it: `apps/api` depends on `@ai-rehab/contracts`
 * only (docs/ARCHITECTURE.md §3) — pulling in `core` here would blur the
 * fast-loop/slow-loop boundary the two-runtime split exists to keep clean.
 * If that floor changes, both need updating; that coupling is accepted
 * deliberately rather than accidentally.
 */
const FORM_SCORE_CONFIDENCE_FLOOR = 0.5;

export type StoredSession = {
  sessionId: string;
  /** (seq, event) pairs as originally synced — order within a session. */
  events: Array<{ seq: number; event: SessionEvent }>;
};

function sortedEvents(session: StoredSession): SessionEvent[] {
  return [...session.events].sort((a, b) => a.seq - b.seq).map((e) => e.event);
}

export function summariseSession(session: StoredSession): SessionSummary {
  const events = sortedEvents(session);

  let wallClock: string | null = null;
  const exerciseIds = new Set<string>();
  let repCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let endedReason: SessionSummary["endedReason"] = null;

  for (const event of events) {
    if (event.type === "session_started") wallClock = event.wallClock;
    if (event.type === "exercise_started") exerciseIds.add(event.exerciseId);
    if (event.type === "rep_completed") {
      repCount += 1;
      if (event.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR) {
        scoreSum += event.score.score;
        scoreCount += 1;
      }
    }
    if (event.type === "session_ended") endedReason = event.reason;
  }

  return {
    sessionId: session.sessionId,
    wallClock,
    exerciseIds: [...exerciseIds],
    repCount,
    avgFormScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    endedReason
  };
}

export function summariseSessions(sessions: StoredSession[]): SessionSummary[] {
  return sessions
    .map(summariseSession)
    .sort((a, b) => (a.wallClock ?? "").localeCompare(b.wallClock ?? "") * -1); // newest first
}

export function computeAdherence(sessions: StoredSession[]): AdherenceDay[] {
  const byDate = new Map<string, number>();
  for (const session of sessions) {
    const started = sortedEvents(session).find((e) => e.type === "session_started");
    if (started?.type !== "session_started") continue;
    const date = started.wallClock.slice(0, 10); // YYYY-MM-DD
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return [...byDate.entries()]
    .map(([date, sessionCount]) => ({ date, sessionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * First-ever recorded peak angle per (exercise, joint), across all of a
 * patient's sessions in wall-clock order. A5/A9-scope note: this is
 * computed from stored joint angles, never from stored landmarks — see
 * docs/STATUS.md on why "replay from stored skeletons" as originally
 * worded in ROADMAP.md M2 needed re-scoping. We never persist a landmark
 * array past the pose worker (docs/CONTRACTS.md), on-device or off.
 */
export function computeBaseline(sessions: StoredSession[]): BaselineEntry[] {
  const ordered = [...sessions].sort((a, b) => {
    const aStart = sortedEvents(a).find((e) => e.type === "session_started");
    const bStart = sortedEvents(b).find((e) => e.type === "session_started");
    const aClock = aStart?.type === "session_started" ? aStart.wallClock : "";
    const bClock = bStart?.type === "session_started" ? bStart.wallClock : "";
    return aClock.localeCompare(bClock);
  });

  const seen = new Set<string>();
  const baseline: BaselineEntry[] = [];

  for (const session of ordered) {
    let currentExerciseId: string | null = null;
    let recordedAt: string | null = null;

    for (const event of sortedEvents(session)) {
      if (event.type === "session_started") recordedAt = event.wallClock;
      if (event.type === "exercise_started") currentExerciseId = event.exerciseId;
      if (event.type === "rep_completed" && currentExerciseId && recordedAt) {
        for (const [joint, peakAngle] of Object.entries(event.rep.peakAngles) as Array<
          [JointName, number]
        >) {
          const key = `${currentExerciseId}:${joint}`;
          if (seen.has(key)) continue;
          seen.add(key);
          baseline.push({ exerciseId: currentExerciseId, joint, peakAngle, recordedAt });
        }
      }
    }
  }

  return baseline;
}

/**
 * G2's range-of-motion trend — a real time series, unlike `computeBaseline`
 * (which only ever keeps the first point per joint per exercise). Each
 * session contributes at most one point per (exercise, joint): that
 * session's best peak angle, so noisy individual reps don't dominate.
 */
export function computeRomTrend(sessions: StoredSession[]): RomTrendSeries[] {
  const ordered = [...sessions].sort((a, b) => {
    const aStart = sortedEvents(a).find((e) => e.type === "session_started");
    const bStart = sortedEvents(b).find((e) => e.type === "session_started");
    const aClock = aStart?.type === "session_started" ? aStart.wallClock : "";
    const bClock = bStart?.type === "session_started" ? bStart.wallClock : "";
    return aClock.localeCompare(bClock);
  });

  const seriesByExercise = new Map<string, Map<string, RomTrendSeries>>();

  for (const session of ordered) {
    let currentExerciseId: string | null = null;
    let recordedAt: string | null = null;
    const sessionBest = new Map<string, Map<string, number>>();

    for (const event of sortedEvents(session)) {
      if (event.type === "session_started") recordedAt = event.wallClock;
      if (event.type === "exercise_started") currentExerciseId = event.exerciseId;
      if (event.type === "rep_completed" && currentExerciseId) {
        const byJoint = sessionBest.get(currentExerciseId) ?? new Map<string, number>();
        sessionBest.set(currentExerciseId, byJoint);
        for (const [joint, peakAngle] of Object.entries(event.rep.peakAngles) as Array<
          [JointName, number]
        >) {
          const prev = byJoint.get(joint);
          if (prev === undefined || peakAngle > prev) byJoint.set(joint, peakAngle);
        }
      }
    }

    if (!recordedAt) continue;
    for (const [exerciseId, byJoint] of sessionBest) {
      const exerciseSeries = seriesByExercise.get(exerciseId) ?? new Map<string, RomTrendSeries>();
      seriesByExercise.set(exerciseId, exerciseSeries);
      for (const [joint, peakAngle] of byJoint) {
        const series = exerciseSeries.get(joint) ?? { exerciseId, joint, points: [] };
        exerciseSeries.set(joint, series);
        series.points.push({ recordedAt, peakAngle });
      }
    }
  }

  return [...seriesByExercise.values()].flatMap((byJoint) => [...byJoint.values()]);
}


/**
 * F1 — the periodic report, derived from the same event log as everything
 * else rather than stored. See the doc comment on `ProgressReport`.
 *
 * `periodStart`/`periodEnd` are passed in rather than computed from a clock:
 * this file is a pure projection, and a function whose output depends on
 * `Date.now()` cannot be tested against a fixture.
 */
export function computeReport(
  sessions: StoredSession[],
  input: { patientId: string; patientDisplayName: string; periodStart: string; periodEnd: string }
): ProgressReport {
  const inPeriod = sessions.filter((session) => {
    const started = sortedEvents(session).find((e) => e.type === "session_started");
    if (started?.type !== "session_started") return false;
    return started.wallClock >= input.periodStart && started.wallClock <= input.periodEnd;
  });

  const exercises = new Set<string>();
  const pain: ReportPainEntry[] = [];
  const safetyEvents: ReportSafetyEvent[] = [];
  let totalReps = 0;
  let scoredReps = 0;
  let scoreSum = 0;

  for (const session of inPeriod) {
    const events = sortedEvents(session);
    const started = events.find((e) => e.type === "session_started");
    const at = started?.type === "session_started" ? started.wallClock : input.periodStart;

    for (const event of events) {
      if (event.type === "exercise_started") exercises.add(event.exerciseId);
      if (event.type === "rep_completed") {
        totalReps += 1;
        if (event.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR) {
          scoredReps += 1;
          scoreSum += event.score.score;
        }
      }
      // B6, and the explicit rule on `PainSignalSchema`: an inferred signal
      // must never be shown to anyone as a pain value — its only legitimate
      // use is choosing which question to ask. So the report reads
      // `selfReported.severity` and skips anything the patient did not
      // answer, rather than reading `recordedSeverity`, which would silently
      // start reporting inferred numbers the moment B1 lands.
      if (event.type === "pain_reported" && event.signal.selfReported) {
        pain.push({
          at,
          region: event.signal.region ?? null,
          severity: event.signal.selfReported.severity
        });
      }
      if (
        event.type === "safety_verdict" &&
        (event.verdict.verdict === "block" || event.verdict.verdict === "escalate")
      ) {
        safetyEvents.push({ at, verdict: event.verdict.verdict, reason: event.verdict.reason });
      }
    }
  }

  const adherence = computeAdherence(inPeriod);
  const avgFormScore = scoredReps > 0 ? Math.round((scoreSum / scoredReps) * 10) / 10 : null;

  return {
    patientId: input.patientId,
    patientDisplayName: input.patientDisplayName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sessionCount: inPeriod.length,
    activeDays: adherence.length,
    totalReps,
    scoredReps,
    avgFormScore,
    exercisesPerformed: [...exercises],
    adherence,
    pain,
    safetyEvents,
    observations: buildObservations({
      sessionCount: inPeriod.length,
      activeDays: adherence.length,
      totalReps,
      scoredReps,
      avgFormScore,
      pain,
      safetyEvents
    })
  };
}

/**
 * Plain-language observations. Each carries the `basis` it was drawn from,
 * so a clinician reading "form is holding up" can see it means "average 84
 * across 22 scored reps" and not a judgement the system formed on its own
 * (CLAUDE.md invariant 4).
 *
 * Deliberately conservative: it reports counts and averages and stops. It
 * does not say whether the patient is improving clinically, because nothing
 * here is competent to judge that.
 */
function buildObservations(d: {
  sessionCount: number;
  activeDays: number;
  totalReps: number;
  scoredReps: number;
  avgFormScore: number | null;
  pain: ReportPainEntry[];
  safetyEvents: ReportSafetyEvent[];
}): ReportObservation[] {
  const out: ReportObservation[] = [];

  if (d.sessionCount === 0) {
    return [
      {
        text: "No sessions were recorded in this period.",
        basis: "No session_started events fell inside the reporting window."
      }
    ];
  }

  out.push({
    text: `${d.sessionCount} session${d.sessionCount === 1 ? "" : "s"} across ${d.activeDays} day${d.activeDays === 1 ? "" : "s"}.`,
    basis: "Counted from synced session events."
  });

  if (d.avgFormScore !== null) {
    out.push({
      text: `Average form score ${d.avgFormScore} across ${d.scoredReps} scored rep${d.scoredReps === 1 ? "" : "s"}.`,
      basis: "Mean of per-rep scores that cleared the tracking-confidence floor."
    });
  }

  const unscored = d.totalReps - d.scoredReps;
  if (unscored > 0) {
    out.push({
      text: `${unscored} of ${d.totalReps} reps could not be scored reliably.`,
      basis: "Tracking confidence fell below the floor — usually framing or lighting, not performance."
    });
  }

  if (d.pain.length > 0) {
    const worst = d.pain.reduce((a, b) => (b.severity > a.severity ? b : a));
    out.push({
      text: `Pain was reported ${d.pain.length} time${d.pain.length === 1 ? "" : "s"}, highest ${worst.severity} of 5${worst.region ? ` in the ${worst.region.replace(/_/g, " ")}` : ""}.`,
      basis: "Patient self-report. Never inferred from movement."
    });
  }

  if (d.safetyEvents.length > 0) {
    out.push({
      text: `The safety gate stopped a set ${d.safetyEvents.length} time${d.safetyEvents.length === 1 ? "" : "s"}.`,
      basis: d.safetyEvents.map((e) => e.reason).join(" · ")
    });
  }

  return out;
}
