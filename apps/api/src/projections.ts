import {
  computeDataQuality,
  computeExerciseSummaries,
  computeFormTrend,
  type SessionWithEvents
} from "./reportDepth.js";
import {
  DEFAULT_TIME_ZONE,
  endOfLocalDay,
  localDateKey,
  startOfLocalDay
} from "./timezone.js";
import type {
  AdherenceDay,
  BaselineEntry,
  JointName,
  ProgressReport,
  ReportObservation,
  ReportExerciseSummary,
  ReportPainEntry,
  ReportSafetyEvent,
  ReportTrendPoint,
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

export function computeAdherence(
  sessions: StoredSession[],
  timeZone: string = DEFAULT_TIME_ZONE
): AdherenceDay[] {
  const byDate = new Map<string, number>();
  for (const session of sessions) {
    const started = sortedEvents(session).find((e) => e.type === "session_started");
    if (started?.type !== "session_started") continue;
    // The patient's calendar day, not UTC's. Exercising at 11pm in Kolkata
    // used to count towards the previous day, and the streak agreed.
    const date = localDateKey(started.wallClock, timeZone);
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
  input: {
    patientId: string;
    patientDisplayName: string;
    periodStart: string;
    periodEnd: string;
    timeZone?: string;
    /** Set only for a single-day report; see `ProgressReport.periodDate`. */
    periodDate?: string | null;
  }
): ProgressReport {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
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

  const withEvents: SessionWithEvents[] = [];

  for (const session of inPeriod) {
    const events = sortedEvents(session);
    const started = events.find((e) => e.type === "session_started");
    const at = started?.type === "session_started" ? started.wallClock : input.periodStart;
    withEvents.push({ sessionId: session.sessionId, events, startedAt: at });

    // Pain is recorded against whatever exercise was running. "Knee pain" is a
    // symptom; "knee pain on rep 6 of sit-to-stand" is something a clinician
    // can change a prescription over.
    let currentExerciseId: string | null = null;

    for (const event of events) {
      if (event.type === "exercise_started") {
        exercises.add(event.exerciseId);
        currentExerciseId = event.exerciseId;
      }
      if (event.type === "exercise_completed") currentExerciseId = null;
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
          severity: event.signal.selfReported.severity,
          exerciseId: currentExerciseId,
          repIndex: event.signal.selfReported.repIndex ?? null
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

  // The latest session in the window, by wall clock. Not `Date.now()`: this
  // projection is deliberately clock-free so it can be tested against a
  // fixture, and "when did this report last change" is a fact about the
  // events, not about when someone happened to open it.
  const lastActivityAt =
    withEvents.length > 0
      ? withEvents.reduce((a, b) => (b.startedAt > a.startedAt ? b : a)).startedAt
      : null;

  const adherence = computeAdherence(inPeriod, timeZone);
  const avgFormScore = scoredReps > 0 ? Math.round((scoreSum / scoredReps) * 10) / 10 : null;
  const perExercise = computeExerciseSummaries(withEvents);
  const formTrend = computeFormTrend(withEvents);
  const dataQuality = computeDataQuality(withEvents);

  return {
    patientId: input.patientId,
    patientDisplayName: input.patientDisplayName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodDate: input.periodDate ?? null,
    timeZone,
    lastActivityAt,
    sessionCount: inPeriod.length,
    activeDays: adherence.length,
    totalReps,
    scoredReps,
    avgFormScore,
    exercisesPerformed: [...exercises],
    perExercise,
    formTrend,
    dataQuality,
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
      safetyEvents,
      perExercise,
      formTrend
    })
  };
}

/**
 * A criterion has to miss on this share of reps before it is worth a
 * clinician's attention. One bad rep in twenty is how humans move.
 */
const CRITERION_FINDING_THRESHOLD = 0.3;
/** Below this many scored reps, a failure rate is not a rate. */
const MIN_REPS_FOR_A_FINDING = 3;
/** Keep the summary readable when several criteria are failing at once. */
const MAX_CRITERIA_PER_EXERCISE = 2;
/** Peak-angle change smaller than this is inside pose-estimation noise. */
const ROM_CHANGE_THRESHOLD_DEG = 5;
/** Form-score movement worth mentioning at all. */
const FORM_TREND_THRESHOLD = 5;
/** Completing less than this share of prescribed reps is worth flagging. */
const COMPLETION_CONCERN = 0.8;

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
  perExercise: ReportExerciseSummary[];
  formTrend: ReportTrendPoint[];
}): ReportObservation[] {
  const out: ReportObservation[] = [];

  if (d.sessionCount === 0) {
    return [
      {
        text: "No sessions were recorded in this period.",
        basis: "No session_started events fell inside the reporting window.",
        exerciseId: null
      }
    ];
  }

  out.push({
    text: `${d.sessionCount} session${d.sessionCount === 1 ? "" : "s"} across ${d.activeDays} day${d.activeDays === 1 ? "" : "s"}.`,
    basis: "Counted from synced session events.",
    exerciseId: null
  });

  if (d.avgFormScore !== null) {
    out.push({
      text: `Average form score ${d.avgFormScore} across ${d.scoredReps} scored rep${d.scoredReps === 1 ? "" : "s"}.`,
      basis: "Mean of per-rep scores that cleared the tracking-confidence floor.",
      exerciseId: null
    });
  }

  const unscored = d.totalReps - d.scoredReps;
  if (unscored > 0) {
    out.push({
      text: `${unscored} of ${d.totalReps} reps could not be scored reliably.`,
      basis: "Tracking confidence fell below the floor — usually framing or lighting, not performance.",
      exerciseId: null
    });
  }

  // The actionable line. A clinician cannot do anything with "average 62";
  // they can do something with "peak knee angle short of target on 14 of 18
  // reps". Only criteria that failed a real share of reps are worth surfacing
  // — one bad rep in twenty is noise, not a finding.
  for (const exercise of d.perExercise) {
    // Every criterion that is failing often enough to matter, not just the
    // worst one: an exercise can be going wrong in two ways at once, and
    // reporting only the top one hides the second.
    const failing = exercise.criteria
      .filter((c) => c.reps >= MIN_REPS_FOR_A_FINDING)
      .filter((c) => c.failed / c.reps >= CRITERION_FINDING_THRESHOLD)
      .slice(0, MAX_CRITERIA_PER_EXERCISE);
    for (const criterion of failing) {
      out.push({
        text: `${criterion.label} missed target on ${criterion.failed} of ${criterion.reps} scored reps.`,
        basis: `Mean ${criterion.avgValue} against a target of ${criterion.target.min}–${criterion.target.max}; average miss ${criterion.avgMissBy}.`,
        exerciseId: exercise.exerciseId
      });
    }
  }

  for (const exercise of d.perExercise) {
    const top = exercise.compensations[0];
    if (!top) continue;
    out.push({
      text: `${top.label} seen on ${top.occurrences} rep${top.occurrences === 1 ? "" : "s"}.`,
      basis: `Compensation rule ${top.ruleId}, mean severity ${top.avgSeverity} of 1.`,
      exerciseId: exercise.exerciseId
    });
  }

  // Range of motion, which is the question rehab review is usually actually
  // asking. Only reported across two or more sessions, and only when the
  // change is large enough not to be measurement noise.
  for (const exercise of d.perExercise) {
    const moved = exercise.romChange.filter((r) => Math.abs(r.changeDeg) >= ROM_CHANGE_THRESHOLD_DEG);
    for (const rom of moved) {
      const direction = rom.changeDeg > 0 ? "increased" : "decreased";
      out.push({
        text: `Peak ${rom.joint.replace(/_/g, " ")} angle ${direction} by ${Math.abs(rom.changeDeg)}° over the period.`,
        basis: `Best rep of the first session (${rom.firstPeak}°) against the best of the last (${rom.lastPeak}°), across ${rom.sessions} sessions.`,
        exerciseId: exercise.exerciseId
      });
    }
  }

  for (const exercise of d.perExercise) {
    if (exercise.completionRate === null || exercise.completionRate >= COMPLETION_CONCERN) continue;
    out.push({
      text: `${Math.round(exercise.completionRate * 100)}% of prescribed reps were completed.`,
      basis: `${exercise.totalReps} reps done against ${Math.round(exercise.totalReps / exercise.completionRate)} prescribed across ${exercise.sessions} session${exercise.sessions === 1 ? "" : "s"}. Sets being cut short is a different problem from sets being done badly.`,
      exerciseId: exercise.exerciseId
    });
  }

  if (d.formTrend.length >= 2) {
    const first = d.formTrend[0]!;
    const last = d.formTrend[d.formTrend.length - 1]!;
    const delta = Math.round((last.avgFormScore - first.avgFormScore) * 10) / 10;
    if (Math.abs(delta) >= FORM_TREND_THRESHOLD) {
      out.push({
        text: `Form score ${delta > 0 ? "rose" : "fell"} ${Math.abs(delta)} points across the period.`,
        basis: `First session averaged ${first.avgFormScore} over ${first.scoredReps} scored reps; last averaged ${last.avgFormScore} over ${last.scoredReps}. Two points are a difference, not a trend.`,
        exerciseId: null
      });
    }
  }

  if (d.pain.length > 0) {
    const worst = d.pain.reduce((a, b) => (b.severity > a.severity ? b : a));
    out.push({
      text: `Pain was reported ${d.pain.length} time${d.pain.length === 1 ? "" : "s"}, highest ${worst.severity} of 5${worst.region ? ` in the ${worst.region.replace(/_/g, " ")}` : ""}.`,
      // The exercise is carried in `exerciseId` and rendered as a prefix by
      // the UI. Naming it in the text too produced "Seated Knee Extension:
      // ... during seated-knee-extension" — twice, once as a raw id.
      basis: "Patient self-report on the 1–5 scale they were shown, tagged to the exercise that was running. Never inferred from movement.",
      exerciseId: worst.exerciseId
    });
  }

  if (d.safetyEvents.length > 0) {
    out.push({
      text: `The safety gate flagged ${d.safetyEvents.length} moment${d.safetyEvents.length === 1 ? "" : "s"} for review.`,
      // ADR-0012: the gate no longer stops the patient, so this must not say
      // it did. Thresholds are provisional and fire on a single frame, so
      // these are worth a clinician's eye, not a conclusion.
      basis: `Provisional thresholds, single-frame — treat as flags, not findings. ${d.safetyEvents.map((e) => e.reason).join(" · ")}`,
      exerciseId: null
    });
  }

  return out;
}


/**
 * F1 — one report per day the patient did something.
 *
 * **Why a day is the right period, and why nothing is stored.** A report is
 * recomputed from the event log on every read, so "the report for today" is
 * always already up to date: finish another exercise and the same day's report
 * simply says more the next time it is opened. There is no generate step, no
 * regenerate step, and no stored copy that can disagree with the events it
 * came from.
 *
 * Days with no sessions are omitted rather than returned empty. A list of
 * blank reports for the days someone did not exercise is noise, and adherence
 * already answers "which days were missed" properly.
 *
 * **Days are the patient's, not UTC's.** Bucketing on the UTC date filed an
 * 11pm session in Kolkata under the previous day. `timeZone` is the same one
 * `computeAdherence` is given, so the report list and the streak can never
 * disagree about which day a session belongs to. Each report's period is the
 * real instant-bracket of that local day, which is why `periodDate` is carried
 * separately — east of UTC the bracket *starts* on the previous UTC date.
 *
 * Clock-free, like everything else in this file: the caller passes the window.
 */
export function computeDailyReports(
  sessions: StoredSession[],
  input: {
    patientId: string;
    patientDisplayName: string;
    periodStart: string;
    periodEnd: string;
    timeZone?: string;
  }
): ProgressReport[] {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const byDate = new Map<string, StoredSession[]>();

  for (const session of sessions) {
    const started = sortedEvents(session).find((e) => e.type === "session_started");
    if (started?.type !== "session_started") continue;
    if (started.wallClock < input.periodStart || started.wallClock > input.periodEnd) continue;
    const date = localDateKey(started.wallClock, timeZone);
    byDate.set(date, [...(byDate.get(date) ?? []), session]);
  }

  return [...byDate.entries()]
    // Newest first: the day someone is most likely to want is the one they
    // just finished.
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, daysSessions]) =>
      computeReport(daysSessions, {
        patientId: input.patientId,
        patientDisplayName: input.patientDisplayName,
        periodStart: startOfLocalDay(date, timeZone),
        periodEnd: endOfLocalDay(date, timeZone),
        periodDate: date,
        timeZone
      })
    );
}
