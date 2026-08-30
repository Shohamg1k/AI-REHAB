import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, login, signup } from "./testHelpers.js";

describe("G3/G4 — signup, login, me", () => {
  it("signs up a standalone patient with their own tenant", async () => {
    const { app } = await buildTestApp();
    const { status, body } = await signup(app, {
      email: "pat@example.com",
      password: "hunter22222",
      displayName: "Pat",
      role: "patient"
    });
    expect(status).toBe(201);
    expect(body.user.role).toBe("patient");
    expect(body.token).toEqual(expect.any(String));
  });

  it("rejects a second signup with the same email", async () => {
    const { app } = await buildTestApp();
    await signup(app, { email: "dup@example.com", password: "hunter22222", displayName: "A", role: "patient" });
    const { status, body } = await signup(app, {
      email: "dup@example.com",
      password: "hunter22222",
      displayName: "B",
      role: "patient"
    });
    expect(status).toBe(409);
    expect(body.error).toBe("conflict");
  });

  it("rejects a password under 8 characters", async () => {
    const { app } = await buildTestApp();
    const { status } = await signup(app, { email: "short@example.com", password: "abc", displayName: "A", role: "patient" });
    expect(status).toBe(400);
  });

  it("logs in with correct credentials and rejects wrong ones with the same error shape", async () => {
    const { app } = await buildTestApp();
    await signup(app, { email: "log@example.com", password: "correct-horse", displayName: "Log", role: "patient" });

    const ok = await login(app, "log@example.com", "correct-horse");
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));

    const wrongPassword = await login(app, "log@example.com", "wrong-password");
    const noSuchUser = await login(app, "nobody@example.com", "whatever12");
    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    // Same message either way — must not let login distinguish "no such
    // account" from "wrong password" (email enumeration).
    expect(wrongPassword.body.message).toBe(noSuchUser.body.message);
  });

  it("returns the authenticated user from /auth/me, and 401 without a token", async () => {
    const { app } = await buildTestApp();
    const { body } = await signup(app, {
      email: "me@example.com",
      password: "hunter22222",
      displayName: "Me",
      role: "patient"
    });

    const authed = await app.inject({ method: "GET", url: "/auth/me", headers: authHeader(body.token) });
    expect(authed.statusCode).toBe(200);
    expect(authed.json().email).toBe("me@example.com");

    const anon = await app.inject({ method: "GET", url: "/auth/me" });
    expect(anon.statusCode).toBe(401);
  });

  it("joins a clinician's tenant via invite code instead of creating a standalone one", async () => {
    const { app } = await buildTestApp();
    const clinician = await signup(app, {
      email: "clin@example.com",
      password: "hunter22222",
      displayName: "Dr. Clin",
      role: "clinician"
    });

    const invite = await app.inject({
      method: "POST",
      url: "/invites",
      headers: authHeader(clinician.body.token)
    });
    expect(invite.statusCode).toBe(201);
    const { code } = invite.json();

    const patient = await signup(app, {
      email: "invited@example.com",
      password: "hunter22222",
      displayName: "Invited Patient",
      role: "patient",
      inviteCode: code
    });
    expect(patient.status).toBe(201);
    expect(patient.body.user.tenantId).toBe(clinician.body.user.tenantId);

    // And the clinician can now see them on their roster.
    const roster = await app.inject({
      method: "GET",
      url: "/patients",
      headers: authHeader(clinician.body.token)
    });
    expect(roster.json()).toHaveLength(1);
    expect(roster.json()[0].email).toBe("invited@example.com");
  });

  it("rejects an invalid or already-used invite code", async () => {
    const { app } = await buildTestApp();
    const clinician = await signup(app, {
      email: "clin2@example.com",
      password: "hunter22222",
      displayName: "Dr. Clin2",
      role: "clinician"
    });
    const invite = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinician.body.token) });
    const { code } = invite.json();

    await signup(app, { email: "first@example.com", password: "hunter22222", displayName: "First", role: "patient", inviteCode: code });
    const second = await signup(app, {
      email: "second@example.com",
      password: "hunter22222",
      displayName: "Second",
      role: "patient",
      inviteCode: code // already consumed
    });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("invalid_invite");
  });

  it("rejects a clinician signup that also supplies an invite code", async () => {
    const { app } = await buildTestApp();
    const { status } = await signup(app, {
      email: "badclinician@example.com",
      password: "hunter22222",
      displayName: "Bad",
      role: "clinician",
      inviteCode: "SOMECODE"
    });
    expect(status).toBe(400);
  });

  it("only a clinician can mint invite codes", async () => {
    const { app } = await buildTestApp();
    const patient = await signup(app, {
      email: "notaclin@example.com",
      password: "hunter22222",
      displayName: "Not A Clinician",
      role: "patient"
    });
    const res = await app.inject({ method: "POST", url: "/invites", headers: authHeader(patient.body.token) });
    expect(res.statusCode).toBe(403);
  });
});
