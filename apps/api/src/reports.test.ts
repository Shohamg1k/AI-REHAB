import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

type App = Awaited<ReturnType<typeof buildTestApp>>["app"];

function repEvent(seq: number, score: number, confidence = 0.9) {
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
        peakAngles: { right_knee: 120 },
        endAngles: { right_knee: 90 },
        tempoMs: 1200,
        meanConfidence: confidence
      },
      score: {
        t: seq * 1000,
        repIndex: seq,
        score,
        breakdown: [],
        compensations: [],
        confidence,
        reason: "test fixture"
      }
    }
  };
}

/** A session recorded "now", so it falls inside the default 7-day window. */
async function recordSession(app: App, token: string, sessionId: string, extra: unknown[] = []) {
  return app.inject({
    method: "POST",
    url: "/events",
    headers: authHeader(token),
    payload: {
      sessionId,
      events: [
        {
          seq: 0,
          event: {
            type: "session_started",
            t: 0,
            sessionId,
            programId: null,
            wallClock: new Date().toISOString()
          }
        },
        {
          seq: 1,
          event: {
            type: "exercise_started",
            t: 1,
            exerciseId: "sit-to-stand",
            prescribed: { sets: 1, reps: 2 }
          }
        },
        repEvent(2, 80),
        repEvent(3, 90),
        ...extra
      ]
    }
  });
}

async function linkedPair(app: App, seed: string) {
  const clinician = await signup(app, {
    email: `rclin-${seed}@example.com`,
    password: "hunter22222",
    displayName: "Dr. Report",
    role: "clinician"
  });
  const invite = await app.inject({
    method: "POST",
    url: "/invites",
    headers: authHeader(clinician.body.token)
  });
  const patient = await signup(app, {
    email: `rpat-${seed}@example.com`,
    password: "hunter22222",
    displayName: "Pat Report",
    role: "patient",
    inviteCode: invite.json().code
  });
  return { clinician, patient };
}

describe("F1 — progress report", () => {
  it("summarises the period from the event log", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "sum");
    await recordSession(app, patient.body.token, "r1");

    const res = await app.inject({
      method: "GET",
      url: "/me/report",
      headers: authHeader(patient.body.token)
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.sessionCount).toBe(1);
    expect(report.totalReps).toBe(2);
    expect(report.scoredReps).toBe(2);
    expect(report.avgFormScore).toBe(85);
    expect(report.exercisesPerformed).toEqual(["sit-to-stand"]);
    // Invariant 4: no bare numbers — every observation carries its basis.
    expect(report.observations.length).toBeGreaterThan(0);
    for (const o of report.observations) expect(o.basis).toBeTruthy();
  });

  it("excludes low-confidence reps from the score and says how many", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "conf");
    await recordSession(app, patient.body.token, "r2", [repEvent(4, 10, 0.2)]);

    const report = (
      await app.inject({ method: "GET", url: "/me/report", headers: authHeader(patient.body.token) })
    ).json();

    expect(report.totalReps).toBe(3);
    expect(report.scoredReps).toBe(2);
    expect(report.avgFormScore).toBe(85); // the 0.2-confidence rep does not drag it down
    expect(JSON.stringify(report.observations)).toMatch(/could not be scored reliably/);
  });

  it("reports only self-reported pain, never an inferred signal", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "pain");

    await recordSession(app, patient.body.token, "r3", [
      {
        seq: 4,
        event: {
          type: "pain_reported",
          t: 4000,
          signal: {
            t: 4000,
            region: "knee",
            inferred: null,
            selfReported: { severity: 3, repIndex: 1 },
            fusion: "self_report_only",
            recordedSeverity: 3,
            reason: "self-report"
          }
        }
      },
      {
        // Inferred-only: PainSignalSchema forbids showing this as a pain
        // value to anyone. It must not appear in the report at all.
        seq: 5,
        event: {
          type: "pain_reported",
          t: 5000,
          signal: {
            t: 5000,
            region: "hip",
            inferred: { severity: 0.9, confidence: 0.8, basis: ["guarding"] },
            selfReported: null,
            fusion: "inferred_only",
            recordedSeverity: 4.5,
            reason: "inferred only"
          }
        }
      }
    ]);

    const report = (
      await app.inject({ method: "GET", url: "/me/report", headers: authHeader(patient.body.token) })
    ).json();

    expect(report.pain).toHaveLength(1);
    expect(report.pain[0].region).toBe("knee");
    expect(report.pain[0].severity).toBe(3);
    expect(JSON.stringify(report)).not.toMatch(/hip/);
  });

  it("lets a clinician read it, and writes that to the patient's audit log", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await linkedPair(app, "audit");
    await recordSession(app, patient.body.token, "r4");

    const res = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/report`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().patientDisplayName).toBe("Pat Report");

    const log = (
      await app.inject({ method: "GET", url: "/audit-log", headers: authHeader(patient.body.token) })
    ).json();
    expect(log.map((e: { action: string }) => e.action)).toContain("view_report");
  });

  it("refuses a clinician when the patient has turned sharing off, and logs nothing", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await linkedPair(app, "off");
    await recordSession(app, patient.body.token, "r5");
    await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(patient.body.token),
      payload: { dataSharingEnabled: false }
    });

    const res = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/report`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(403);

    // A refused read is not a read.
    const log = (
      await app.inject({ method: "GET", url: "/audit-log", headers: authHeader(patient.body.token) })
    ).json();
    expect(log).toEqual([]);

    // The patient can still read their own report — consent governs the
    // clinician's access, not the patient's access to themselves.
    const own = await app.inject({
      method: "GET",
      url: "/me/report",
      headers: authHeader(patient.body.token)
    });
    expect(own.statusCode).toBe(200);
  });

  it("says plainly when there is nothing in the period", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "empty");

    const report = (
      await app.inject({ method: "GET", url: "/me/report", headers: authHeader(patient.body.token) })
    ).json();

    expect(report.sessionCount).toBe(0);
    expect(report.avgFormScore).toBeNull();
    expect(report.observations[0].text).toMatch(/No sessions were recorded/);
  });

  it("refuses a clinician the report of someone not on their roster", async () => {
    const { app } = await buildTestApp();
    const { clinician } = await linkedPair(app, "stranger");
    const other = await signup(app, {
      email: "rstranger@example.com",
      password: "hunter22222",
      displayName: "Other",
      role: "patient"
    });

    const res = await app.inject({
      method: "GET",
      url: `/patients/${other.body.user.id}/report`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(403);
  });
});
