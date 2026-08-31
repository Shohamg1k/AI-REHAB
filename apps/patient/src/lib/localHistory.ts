import type { AdherenceDay, SessionSummary } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR } from "@ai-rehab/core";
import { getSessionEvents, listSessions } from "./db.js";

/**
 * Session history for a patient with no account.
 *
 * Every session has always been written to IndexedDB (G1), but nothing ever
 * read it back — Progress fetched from `apps/api`, so a guest, who is the
 * default and the whole point of H7, saw an empty screen no matter how many
 * sessions they had done. This is the missing reader.
 *
 * The aggregation deliberately mirrors `apps/api/src/projections.ts` rather
 * than importing it: `apps/api` may only depend on `@ai-rehab/contracts`
 * (docs/ARCHITECTURE.md §3), so there is no shared module either side could
 * import. The confidence floor comes from `@ai-rehab/core`, which this app
 * may depend on, so at least that constant is not duplicated.
 */

function summarise(sessionId: string, events: Awaited<ReturnType<typeof getSessionEvents>>): SessionSummary {
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
    sessionId,
    wallClock,
    exerciseIds: [...exerciseIds],
    repCount,
    avgFormScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
    endedReason
  };
}

/** Newest first, and only sessions that actually recorded something. */
export async function loadLocalSessions(): Promise<SessionSummary[]> {
  const sessions = await listSessions();
  const summaries = await Promise.all(
    sessions.map(async (s) => summarise(s.sessionId, await getSessionEvents(s.sessionId)))
  );
  return summaries
    .filter((s) => s.repCount > 0)
    .sort((a, b) => (a.wallClock ?? "").localeCompare(b.wallClock ?? "") * -1);
}

export function adherenceFromSessions(sessions: readonly SessionSummary[]): AdherenceDay[] {
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (!s.wallClock) continue;
    const date = s.wallClock.slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return [...byDate.entries()]
    .map(([date, sessionCount]) => ({ date, sessionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Which exercises have been completed today — drives Today's done markers. */
export async function completedExercisesToday(): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sessions = await loadLocalSessions();
  const done = new Set<string>();
  for (const s of sessions) {
    if (s.wallClock?.slice(0, 10) !== today) continue;
    for (const id of s.exerciseIds) done.add(id);
  }
  return [...done];
}
