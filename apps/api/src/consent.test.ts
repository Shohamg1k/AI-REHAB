import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

/**
 * G5's other half: the audit log (audit.test.ts, if present, or the
 * clinician-view tests in programs.test.ts) tells a patient who looked at
 * their data. This is the control that decides whether a clinician can
 * look at all — see routes/profile.ts and the enforcement in
 * routes/patients.ts.
 */
async function setUpLinkedPair(app: Awaited<ReturnType<typeof buildTestApp>>["app"]) {
  const clinician = await signup(app, {
    email: "consentclin@example.com",
    password: "hunter22222",
    displayName: "Dr. Consent",
    role: "clinician"
  });
  const invite = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinician.body.token) });
  const patient = await signup(app, {
    email: "consentpat@example.com",
    password: "hunter22222",
    displayName: "Consent Patient",
    role: "patient",
    inviteCode: invite.json().code
  });
  return { clinician, patient };
}

describe("G5 — data-sharing consent", () => {
  it("defaults to enabled, so a newly-joined patient's sessions are visible to their clinician", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const res = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/sessions`,
      headers: authHeader(clinician.body.token)
    });

    expect(res.statusCode).toBe(200);
  });

  it("a patient can turn data sharing off, and their clinician is then refused", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const toggle = await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(patient.body.token),
      payload: { dataSharingEnabled: false }
    });
    expect(toggle.statusCode).toBe(200);
    expect(toggle.json().dataSharingEnabled).toBe(false);

    const res = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/sessions`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(403);

    // Being blocked from viewing must not itself get logged as a view.
    const auditLog = await app.inject({ method: "GET", url: "/audit-log", headers: authHeader(patient.body.token) });
    expect(auditLog.json()).toEqual([]);
  });

  it("turning it back on restores the clinician's access", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(patient.body.token),
      payload: { dataSharingEnabled: false }
    });
    await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(patient.body.token),
      payload: { dataSharingEnabled: true }
    });

    const res = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/sessions`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(200);
  });

  it("a clinician account cannot toggle data sharing (has none)", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, {
      email: "notpatient2@example.com",
      password: "hunter22222",
      displayName: "NP2",
      role: "clinician"
    });

    const res = await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(auth.token),
      payload: { dataSharingEnabled: false }
    });

    expect(res.statusCode).toBe(403);
  });
});
