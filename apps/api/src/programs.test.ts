import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

async function setUpLinkedPair(app: Awaited<ReturnType<typeof buildTestApp>>["app"]) {
  const clinician = await signup(app, { email: "linkclin@example.com", password: "hunter22222", displayName: "Dr. Link", role: "clinician" });
  const invite = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinician.body.token) });
  const patient = await signup(app, {
    email: "linkpat@example.com",
    password: "hunter22222",
    displayName: "Linked Patient",
    role: "patient",
    inviteCode: invite.json().code
  });
  return { clinician, patient };
}

describe("F6 (M2 slice) — clinician program assignment", () => {
  it("a clinician assigns a program and the patient reads it back, in order", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const create = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        notes: "Start gentle, twice a week.",
        exercises: [
          { exerciseId: "sit-to-stand", sets: 2, reps: 8 },
          { exerciseId: "seated-knee-extension", sets: 3, reps: 10 }
        ]
      }
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().exercises.map((e: { exerciseId: string }) => e.exerciseId)).toEqual([
      "sit-to-stand",
      "seated-knee-extension"
    ]);

    const mine = await app.inject({ method: "GET", url: "/programs/mine", headers: authHeader(patient.body.token) });
    expect(mine.json().notes).toBe("Start gentle, twice a week.");
    expect(mine.json().exercises).toHaveLength(2);
  });

  it("cannot assign a program to a patient not on the clinician's roster", async () => {
    const { app } = await buildTestApp();
    const { clinician } = await setUpLinkedPair(app);
    const outsider = await signup(app, { email: "outsider@example.com", password: "hunter22222", displayName: "Outsider", role: "patient" });

    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: { patientId: outsider.body.user.id, exercises: [{ exerciseId: "sit-to-stand", sets: 1, reps: 1 }] }
    });
    expect(res.statusCode).toBe(403);
  });

  it("a patient cannot assign themselves a program", async () => {
    const { app } = await buildTestApp();
    const { patient } = await setUpLinkedPair(app);
    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(patient.body.token),
      payload: { patientId: patient.body.user.id, exercises: [{ exerciseId: "sit-to-stand", sets: 1, reps: 1 }] }
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("G5/F5 — clinician access is logged and patient-visible", () => {
  it("viewing a patient's sessions writes an audit entry the patient can read", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/sessions`,
      headers: authHeader(clinician.body.token)
    });

    const log = await app.inject({ method: "GET", url: "/audit-log", headers: authHeader(patient.body.token) });
    expect(log.json()).toHaveLength(1);
    expect(log.json()[0]).toMatchObject({
      actorDisplayName: "Dr. Link",
      action: "view_sessions"
    });
  });

  it("a patient's audit log starts empty if no clinician has looked", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, { email: "unwatched@example.com", password: "hunter22222", displayName: "U", role: "patient" });
    const log = await app.inject({ method: "GET", url: "/audit-log", headers: authHeader(auth.token) });
    expect(log.json()).toEqual([]);
  });
});
