import type {
  AdherenceDay,
  BaselineEntry,
  JointName,
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
