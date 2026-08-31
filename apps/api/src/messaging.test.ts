import { describe, expect, it } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

type App = Awaited<ReturnType<typeof buildTestApp>>["app"];

async function linkedPair(app: App, seed: string) {
  const clinician = await signup(app, {
    email: `clin-${seed}@example.com`,
    password: "hunter22222",
    displayName: "Dr. Msg",
    role: "clinician"
  });
  const invite = await app.inject({
    method: "POST",
    url: "/invites",
    headers: authHeader(clinician.body.token)
  });
  const patient = await signup(app, {
    email: `pat-${seed}@example.com`,
    password: "hunter22222",
    displayName: "Pat Msg",
    role: "patient",
    inviteCode: invite.json().code
  });
  return { clinician, patient };
}

describe("F9 — messaging", () => {
  it("carries a message both ways in one thread, oldest first", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await linkedPair(app, "both");

    await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(patient.body.token),
      payload: { body: "My knee felt tight today." }
    });
    await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(clinician.body.token),
      payload: { patientId: patient.body.user.id, body: "Thanks — ease off the last set." }
    });

    const asPatient = await app.inject({
      method: "GET",
      url: "/messages",
      headers: authHeader(patient.body.token)
    });
    const thread = asPatient.json();
    expect(thread).toHaveLength(2);
    expect(thread[0].body).toBe("My knee felt tight today.");
    expect(thread[0].senderRole).toBe("patient");
    expect(thread[1].senderRole).toBe("clinician");
    expect(thread[1].senderDisplayName).toBe("Dr. Msg");

    // The clinician sees the same thread.
    const asClinician = await app.inject({
      method: "GET",
      url: `/messages?patientId=${patient.body.user.id}`,
      headers: authHeader(clinician.body.token)
    });
    expect(asClinician.json()).toHaveLength(2);
  });

  it("ignores a patientId sent by a patient rather than letting it redirect the message", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "redirect");
    const victim = await signup(app, {
      email: "victim@example.com",
      password: "hunter22222",
      displayName: "Victim",
      role: "patient"
    });

    await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(patient.body.token),
      payload: { patientId: victim.body.user.id, body: "should land in my own thread" }
    });

    const victimThread = await app.inject({
      method: "GET",
      url: "/messages",
      headers: authHeader(victim.body.token)
    });
    expect(victimThread.json()).toHaveLength(0);

    const ownThread = await app.inject({
      method: "GET",
      url: "/messages",
      headers: authHeader(patient.body.token)
    });
    expect(ownThread.json()).toHaveLength(1);
  });

  it("refuses a clinician the thread of someone not on their roster", async () => {
    const { app } = await buildTestApp();
    const { clinician } = await linkedPair(app, "roster");
    const stranger = await signup(app, {
      email: "stranger@example.com",
      password: "hunter22222",
      displayName: "Stranger",
      role: "patient"
    });

    const res = await app.inject({
      method: "GET",
      url: `/messages?patientId=${stranger.body.user.id}`,
      headers: authHeader(clinician.body.token)
    });
    expect(res.statusCode).toBe(403);
  });

  it("still works when the patient has turned data sharing off", async () => {
    const { app } = await buildTestApp();
    const { clinician, patient } = await linkedPair(app, "consent");

    await app.inject({
      method: "PUT",
      url: "/me/data-sharing",
      headers: authHeader(patient.body.token),
      payload: { dataSharingEnabled: false }
    });

    // Sessions are now closed to the clinician...
    const sessions = await app.inject({
      method: "GET",
      url: `/patients/${patient.body.user.id}/sessions`,
      headers: authHeader(clinician.body.token)
    });
    expect(sessions.statusCode).toBe(403);

    // ...but the conversation is not. A patient who paused sharing because
    // something is wrong must still be able to say so.
    const sent = await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(patient.body.token),
      payload: { body: "I've paused sharing but I need advice." }
    });
    expect(sent.statusCode).toBe(201);

    const reply = await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(clinician.body.token),
      payload: { patientId: patient.body.user.id, body: "Understood — let's talk." }
    });
    expect(reply.statusCode).toBe(201);
  });

  it("rejects an empty message", async () => {
    const { app } = await buildTestApp();
    const { patient } = await linkedPair(app, "empty");

    const res = await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(patient.body.token),
      payload: { body: "   " }
    });
    expect(res.statusCode).toBe(400);
  });

  it("keeps threads apart across tenants", async () => {
    const { app } = await buildTestApp();
    const a = await linkedPair(app, "tenant-a");
    const b = await linkedPair(app, "tenant-b");

    await app.inject({
      method: "POST",
      url: "/messages",
      headers: authHeader(a.patient.body.token),
      payload: { body: "tenant A only" }
    });

    const otherClinician = await app.inject({
      method: "GET",
      url: `/messages?patientId=${a.patient.body.user.id}`,
      headers: authHeader(b.clinician.body.token)
    });
    expect(otherClinician.statusCode).toBe(403);
  });
});
