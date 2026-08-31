import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

/**
 * Joining a clinician *after* signup moves the patient between tenants,
 * which is the one operation that deliberately crosses the isolation
 * boundary everything else exists to enforce. It therefore gets its own
 * tests, focused on what must remain true afterwards: the patient keeps
 * their own history, the new clinician can see them, and no other tenant
 * gained anything.
 */
describe("POST /me/join — redeeming an invite after signup", () => {
  it("moves a standalone patient into the clinician's tenant, with their history", async () => {
    const { app } = await buildTestApp();

    const patient = await signup(app, {
      email: "solo@example.com",
      password: "hunter22222",
      displayName: "Solo",
      role: "patient"
    });

    // A session recorded while still standalone.
    await app.inject({
      method: "POST",
      url: "/events",
      headers: authHeader(patient.body.token),
      payload: {
        sessionId: "pre-join",
        events: [
          {
            seq: 0,
            event: {
              type: "session_started",
              t: 0,
              sessionId: "pre-join",
              programId: null,
              wallClock: "2026-08-30T09:00:00.000Z"
            }
          }
        ]
      }
    });

    const clinician = await signup(app, {
      email: "joinclin@example.com",
      password: "hunter22222",
      displayName: "Dr. Join",
      role: "clinician"
    });
    const invite = await app.inject({
      method: "POST",
      url: "/invites",
      headers: authHeader(clinician.body.token)
    });

    const res = await app.inject({
      method: "POST",
      url: "/me/join",
      headers: authHeader(patient.body.token),
      payload: { code: invite.json().code }
    });

    expect(res.statusCode).toBe(200);
    const joined = res.json();
    expect(joined.user.tenantId).not.toBe(patient.body.user.tenantId);
    // A fresh token must come back: the tenant in the old one is now stale.
    expect(joined.token).toBeTruthy();
    expect(joined.token).not.toBe(patient.body.token);

    // The patient still has their own pre-join session, using the new token.
    const sessions = await app.inject({
      method: "GET",
      url: "/sessions",
      headers: authHeader(joined.token)
    });
    expect(sessions.json()).toHaveLength(1);

    // And the clinician can now see them.
    const roster = await app.inject({
      method: "GET",
      url: "/patients",
      headers: authHeader(clinician.body.token)
    });
    expect(roster.json().map((u: { id: string }) => u.id)).toContain(patient.body.user.id);
  });

  it("rejects an invalid code without moving the patient anywhere", async () => {
    const { app } = await buildTestApp();
    const patient = await signup(app, {
      email: "badcode@example.com",
      password: "hunter22222",
      displayName: "BC",
      role: "patient"
    });

    const res = await app.inject({
      method: "POST",
      url: "/me/join",
      headers: authHeader(patient.body.token),
      payload: { code: "NOPE-NOT-A-CODE" }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_invite");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(patient.body.token)
    });
    expect(me.json().tenantId).toBe(patient.body.user.tenantId);
  });

  it("will not let one invite code pull in two patients", async () => {
    const { app } = await buildTestApp();
    const clinician = await signup(app, {
      email: "onceclin@example.com",
      password: "hunter22222",
      displayName: "Dr. Once",
      role: "clinician"
    });
    const invite = await app.inject({
      method: "POST",
      url: "/invites",
      headers: authHeader(clinician.body.token)
    });
    const code = invite.json().code;

    const first = await signup(app, {
      email: "first@example.com",
      password: "hunter22222",
      displayName: "First",
      role: "patient"
    });
    const second = await signup(app, {
      email: "second@example.com",
      password: "hunter22222",
      displayName: "Second",
      role: "patient"
    });

    const a = await app.inject({
      method: "POST",
      url: "/me/join",
      headers: authHeader(first.body.token),
      payload: { code }
    });
    const b = await app.inject({
      method: "POST",
      url: "/me/join",
      headers: authHeader(second.body.token),
      payload: { code }
    });

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(400); // single-use, as at signup
  });

  it("a clinician cannot join another clinician's tenant with a code", async () => {
    const { app } = await buildTestApp();
    const owner = await signup(app, {
      email: "owner@example.com",
      password: "hunter22222",
      displayName: "Owner",
      role: "clinician"
    });
    const invite = await app.inject({
      method: "POST",
      url: "/invites",
      headers: authHeader(owner.body.token)
    });
    const other = await signup(app, {
      email: "other@example.com",
      password: "hunter22222",
      displayName: "Other",
      role: "clinician"
    });

    const res = await app.inject({
      method: "POST",
      url: "/me/join",
      headers: authHeader(other.body.token),
      payload: { code: invite.json().code }
    });

    expect(res.statusCode).toBe(403);
  });
});
