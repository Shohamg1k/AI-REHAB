import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

/**
 * The one thing that must never regress: a user can only ever see their
 * own tenant's data. This is what RLS enforces at the database layer in
 * production (migrations/0001_rls.sql) — this test suite verifies the
 * application-layer half of that defense-in-depth pair, against
 * `MemoryStore`, per the `Store` interface's own doc comment on why.
 */
describe("tenant isolation", () => {
  it("a clinician cannot see a patient who never joined their tenant", async () => {
    const { app } = await buildTestApp();
    const clinicianA = await signup(app, {
      email: "clinA@example.com",
      password: "hunter22222",
      displayName: "Clinician A",
      role: "clinician"
    });
    const strangerPatient = await signup(app, {
      email: "stranger@example.com",
      password: "hunter22222",
      displayName: "Stranger",
      role: "patient"
      // standalone signup — own tenant, never linked to clinicianA
    });

    const roster = await app.inject({ method: "GET", url: "/patients", headers: authHeader(clinicianA.body.token) });
    expect(roster.json()).toHaveLength(0);

    const attempt = await app.inject({
      method: "GET",
      url: `/patients/${strangerPatient.body.user.id}/sessions`,
      headers: authHeader(clinicianA.body.token)
    });
    expect(attempt.statusCode).toBe(403);
  });

  it("two standalone patients cannot see each other's synced sessions", async () => {
    const { app } = await buildTestApp();
    const alice = await signup(app, { email: "alice@example.com", password: "hunter22222", displayName: "Alice", role: "patient" });
    const bob = await signup(app, { email: "bob@example.com", password: "hunter22222", displayName: "Bob", role: "patient" });

    await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(alice.body.token),
      payload: {
        sessionId: "sess-alice-1",
        events: [{ seq: 0, event: { type: "session_started", t: 0, sessionId: "sess-alice-1", programId: null, wallClock: new Date().toISOString() } }]
      }
    });

    const bobsView = await app.inject({ method: "GET", url: "/sessions", headers: authHeader(bob.body.token) });
    expect(bobsView.json()).toHaveLength(0);

    const alicesView = await app.inject({ method: "GET", url: "/sessions", headers: authHeader(alice.body.token) });
    expect(alicesView.json()).toHaveLength(1);

    // Bob cannot read Alice's session events by guessing her sessionId either.
    const bobReadsAlice = await app.inject({
      method: "GET",
      url: "/sessions/sess-alice-1/events",
      headers: authHeader(bob.body.token)
    });
    expect(bobReadsAlice.statusCode).toBe(404);
  });

  it("two clinicians in different tenants cannot see each other's rosters", async () => {
    const { app } = await buildTestApp();
    const clinicianA = await signup(app, { email: "ca@example.com", password: "hunter22222", displayName: "A", role: "clinician" });
    const clinicianB = await signup(app, { email: "cb@example.com", password: "hunter22222", displayName: "B", role: "clinician" });

    const inviteA = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinicianA.body.token) });
    await signup(app, {
      email: "patientOfA@example.com",
      password: "hunter22222",
      displayName: "Patient of A",
      role: "patient",
      inviteCode: inviteA.json().code
    });

    const rosterB = await app.inject({ method: "GET", url: "/patients", headers: authHeader(clinicianB.body.token) });
    expect(rosterB.json()).toHaveLength(0);
  });

  it("a patient cannot read another patient's program by patientId", async () => {
    const { app } = await buildTestApp();
    const clinician = await signup(app, { email: "progclin@example.com", password: "hunter22222", displayName: "Doc", role: "clinician" });
    const invite = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinician.body.token) });
    const patientA = await signup(app, {
      email: "progpatA@example.com",
      password: "hunter22222",
      displayName: "Prog Patient A",
      role: "patient",
      inviteCode: invite.json().code
    });
    const patientB = await signup(app, {
      email: "progpatB@example.com",
      password: "hunter22222",
      displayName: "Prog Patient B",
      role: "patient"
      // standalone, not even in the same tenant
    });

    await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: { patientId: patientA.body.user.id, exercises: [{ exerciseId: "seated-knee-extension", targetRegions: ["knee"], intensity: "low", sets: 3, reps: 10 }] }
    });

    // GET /programs/mine is always scoped to the caller's own userId+tenant —
    // patientB simply gets their own (nonexistent) program, never A's.
    const bView = await app.inject({ method: "GET", url: "/programs/mine", headers: authHeader(patientB.body.token) });
    expect(bView.json()).toBeNull();

    const aView = await app.inject({ method: "GET", url: "/programs/mine", headers: authHeader(patientA.body.token) });
    expect(aView.json().exercises).toHaveLength(1);
  });
});
