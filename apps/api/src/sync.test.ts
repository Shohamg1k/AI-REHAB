import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

function repCompletedEvent(seq: number, score: number) {
  return {
    seq,
    event: {
      type: "rep_completed" as const,
      t: seq * 1000,
      rep: {
        t: seq * 1000,
        repIndex: seq,
        setIndex: 0,
        phaseTimings: {},
        peakAngles: { right_knee: 170 },
        endAngles: { right_knee: 90 },
        tempoMs: 1200,
        meanConfidence: 0.9
      },
      score: {
        t: seq * 1000,
        repIndex: seq,
        score,
        breakdown: [],
        compensations: [],
        confidence: 0.9,
        reason: "test fixture"
      }
    }
  };
}

describe("G6 — sync is idempotent, and G2 projections read back correctly", () => {
  it("retrying the same batch upserts rather than duplicating", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, { email: "sync@example.com", password: "hunter22222", displayName: "Sync", role: "patient" });

    const batch = {
      sessionId: "sess-1",
      events: [
        { seq: 0, event: { type: "session_started", t: 0, sessionId: "sess-1", programId: null, wallClock: "2026-08-30T10:00:00.000Z" } },
        repCompletedEvent(1, 90)
      ]
    };

    const first = await app.inject({ method: "POST", url: "/events", headers: authHeader(auth.token), payload: batch });
    expect(first.json()).toEqual({ inserted: 2, duplicates: 0 });

    // Same batch again — simulating a retry after a dropped response.
    const second = await app.inject({ method: "POST", url: "/events", headers: authHeader(auth.token), payload: batch });
    expect(second.json()).toEqual({ inserted: 0, duplicates: 2 });

    const events = await app.inject({ method: "GET", url: "/sessions/sess-1/events", headers: authHeader(auth.token) });
    expect(events.json()).toHaveLength(2); // not 4 — the retry did not duplicate anything
  });

  it("404s a session that was never synced", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, { email: "nosess@example.com", password: "hunter22222", displayName: "N", role: "patient" });
    const res = await app.inject({ method: "GET", url: "/sessions/does-not-exist/events", headers: authHeader(auth.token) });
    expect(res.statusCode).toBe(404);
  });

  it("summarises a session's rep count and average score, excluding low-confidence reps", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, { email: "summary@example.com", password: "hunter22222", displayName: "S", role: "patient" });

    const lowConfidenceRep = repCompletedEvent(3, 10);
    lowConfidenceRep.event.score.confidence = 0.2; // below the 0.5 floor — must not drag the average down

    await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(auth.token),
      payload: {
        sessionId: "sess-2",
        events: [
          { seq: 0, event: { type: "session_started", t: 0, sessionId: "sess-2", programId: null, wallClock: "2026-08-30T10:00:00.000Z" } },
          { seq: 1, event: { type: "exercise_started", t: 1, exerciseId: "seated-knee-extension", prescribed: { sets: 1, reps: 8 } } },
          repCompletedEvent(2, 80),
          lowConfidenceRep,
          { seq: 4, event: { type: "session_ended", t: 5000, reason: "completed" } }
        ]
      }
    });

    const sessions = await app.inject({ method: "GET", url: "/sessions", headers: authHeader(auth.token) });
    const [summary] = sessions.json();
    expect(summary.repCount).toBe(2);
    expect(summary.avgFormScore).toBe(80); // only the confident rep counts
    expect(summary.exerciseIds).toEqual(["seated-knee-extension"]);
    expect(summary.endedReason).toBe("completed");
  });

  it("computes an adherence day for each date with a synced session", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, { email: "adherence@example.com", password: "hunter22222", displayName: "Ad", role: "patient" });

    await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(auth.token),
      payload: {
        sessionId: "day-1",
        events: [{ seq: 0, event: { type: "session_started", t: 0, sessionId: "day-1", programId: null, wallClock: "2026-08-30T09:00:00.000Z" } }]
      }
    });
    await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(auth.token),
      payload: {
        sessionId: "day-2",
        events: [{ seq: 0, event: { type: "session_started", t: 0, sessionId: "day-2", programId: null, wallClock: "2026-08-31T09:00:00.000Z" } }]
      }
    });

    const adherence = await app.inject({ method: "GET", url: "/projections/adherence", headers: authHeader(auth.token) });
    expect(adherence.json()).toEqual([
      { date: "2026-08-30", sessionCount: 1 },
      { date: "2026-08-31", sessionCount: 1 }
    ]);
  });
});
