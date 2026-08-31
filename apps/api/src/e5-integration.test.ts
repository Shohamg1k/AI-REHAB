import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

/**
 * Tests the *integration point* docs/STATUS.md flagged as the real gap:
 * does POST /programs actually act on what E5 decides. The Python decision
 * logic itself (which rule fires when) has its own 12 tests in
 * services/rehab-engine/tests/test_supervisor.py — deliberately not
 * duplicated here. `fetch` is stubbed to stand in for a running
 * rehab-engine, since this environment cannot boot the real Python service
 * as part of a JS test run.
 */

async function setUpLinkedPair(app: Awaited<ReturnType<typeof buildTestApp>>["app"]) {
  const clinician = await signup(app, {
    email: "e5clin@example.com",
    password: "hunter22222",
    displayName: "Dr. Supervisor",
    role: "clinician"
  });
  const invite = await app.inject({ method: "POST", url: "/invites", headers: authHeader(clinician.body.token) });
  const patient = await signup(app, {
    email: "e5pat@example.com",
    password: "hunter22222",
    displayName: "E5 Patient",
    role: "patient",
    inviteCode: invite.json().code
  });
  return { clinician, patient };
}

const originalFetch = global.fetch;
const originalUrl = process.env.REHAB_ENGINE_URL;

beforeEach(() => {
  process.env.REHAB_ENGINE_URL = "http://rehab-engine.test";
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.REHAB_ENGINE_URL;
  else process.env.REHAB_ENGINE_URL = originalUrl;
  vi.restoreAllMocks();
});

function mockSupervisorResponse(decision: { allowed: boolean; blocked: boolean; risk_level: string; reason: string }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => decision
  }) as unknown as typeof fetch;
}

describe("E5 integration — POST /programs actually calls the supervisor", () => {
  it("rejects the whole program with 422 when the supervisor blocks one exercise", async () => {
    mockSupervisorResponse({
      allowed: false,
      blocked: true,
      risk_level: "high",
      reason: "This exercise targets shoulder, which is marked contraindicated for this patient."
    });

    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        exercises: [
          { exerciseId: "standing-shoulder-abduction", targetRegions: ["shoulder"], intensity: "low", sets: 2, reps: 8 }
        ]
      }
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("exercise_blocked");
    expect(res.json().exerciseId).toBe("standing-shoulder-abduction");

    // Confirm the program was genuinely not created, not just that the
    // response looked right.
    const mine = await app.inject({ method: "GET", url: "/programs/mine", headers: authHeader(patient.body.token) });
    expect(mine.json()).toBeNull();
  });

  it("creates the program normally when the supervisor allows every exercise", async () => {
    mockSupervisorResponse({ allowed: true, blocked: false, risk_level: "low", reason: "Within safe thresholds." });

    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        exercises: [{ exerciseId: "sit-to-stand", targetRegions: ["knee", "hip"], intensity: "medium", sets: 2, reps: 8 }]
      }
    });

    expect(res.statusCode).toBe(201);
  });

  it("sends the patient's declared contraindications through to the supervisor call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allowed: true, blocked: false, risk_level: "low", reason: "ok" })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    await app.inject({
      method: "PUT",
      url: "/me/contraindications",
      headers: authHeader(patient.body.token),
      payload: { contraindicatedRegions: ["shoulder"] }
    });

    await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        exercises: [{ exerciseId: "sit-to-stand", targetRegions: ["knee"], intensity: "low", sets: 1, reps: 1 }]
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.patient_contraindicated_regions).toEqual(["shoulder"]);
  });

  it("fails open (does not block program creation) when the supervisor is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        exercises: [{ exerciseId: "sit-to-stand", targetRegions: ["knee"], intensity: "low", sets: 1, reps: 1 }]
      }
    });

    // A second, coarser safety net failing must not take down the primary
    // path (E1, client-side, already runs regardless) — see
    // rehabEngineClient.ts's doc comment on why this fails open.
    expect(res.statusCode).toBe(201);
  });

  it("fails open when REHAB_ENGINE_URL is not configured at all", async () => {
    delete process.env.REHAB_ENGINE_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { app } = await buildTestApp();
    const { clinician, patient } = await setUpLinkedPair(app);

    const res = await app.inject({
      method: "POST",
      url: "/programs",
      headers: authHeader(clinician.body.token),
      payload: {
        patientId: patient.body.user.id,
        exercises: [{ exerciseId: "sit-to-stand", targetRegions: ["knee"], intensity: "low", sets: 1, reps: 1 }]
      }
    });

    expect(res.statusCode).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled(); // never even tries to reach an unconfigured URL
  });
});

describe("patient contraindications profile", () => {
  it("a patient can set their own contraindicated regions", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, {
      email: "contraind@example.com",
      password: "hunter22222",
      displayName: "C",
      role: "patient"
    });

    const res = await app.inject({
      method: "PUT",
      url: "/me/contraindications",
      headers: authHeader(auth.token),
      payload: { contraindicatedRegions: ["knee", "shoulder"] }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().contraindicatedRegions).toEqual(["knee", "shoulder"]);

    const me = await app.inject({ method: "GET", url: "/auth/me", headers: authHeader(auth.token) });
    expect(me.json().contraindicatedRegions).toEqual(["knee", "shoulder"]);
  });

  it("a clinician account cannot set contraindications (has none)", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, {
      email: "notpatient@example.com",
      password: "hunter22222",
      displayName: "NP",
      role: "clinician"
    });

    const res = await app.inject({
      method: "PUT",
      url: "/me/contraindications",
      headers: authHeader(auth.token),
      payload: { contraindicatedRegions: ["knee"] }
    });

    expect(res.statusCode).toBe(403);
  });
});

/**
 * The routine is a patient preference, stored server-side only so it follows
 * them between devices. It is deliberately *not* a Program: a clinician
 * expressing what a patient should do goes through the E5 contraindication
 * check first, and this does not.
 */
describe("patient routine (cross-device sync)", () => {
  it("round-trips through the user record, so another device reads it back", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, {
      email: "routine@example.com",
      password: "hunter22222",
      displayName: "R",
      role: "patient"
    });

    // A new account has not chosen yet, which is distinct from choosing none.
    expect(auth.user.routine).toEqual([]);

    const res = await app.inject({
      method: "PUT",
      url: "/me/routine",
      headers: authHeader(auth.token),
      payload: { exerciseIds: ["sit-to-stand", "seated-neck-side-tilt"] }
    });
    expect(res.statusCode).toBe(200);

    // What a second device sees when it signs in.
    const me = await app.inject({ method: "GET", url: "/auth/me", headers: authHeader(auth.token) });
    expect(me.json().routine).toEqual(["sit-to-stand", "seated-neck-side-tilt"]);
  });

  it("keeps one patient's routine out of another's", async () => {
    const { app } = await buildTestApp();
    const a = await signup(app, {
      email: "routine-a@example.com",
      password: "hunter22222",
      displayName: "A",
      role: "patient"
    });
    const b = await signup(app, {
      email: "routine-b@example.com",
      password: "hunter22222",
      displayName: "B",
      role: "patient"
    });

    await app.inject({
      method: "PUT",
      url: "/me/routine",
      headers: authHeader(a.body.token),
      payload: { exerciseIds: ["seated-elbow-flexion"] }
    });

    const meB = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: authHeader(b.body.token)
    });
    expect(meB.json().routine).toEqual([]);
  });

  it("a clinician account has no routine to set", async () => {
    const { app } = await buildTestApp();
    const { body: auth } = await signup(app, {
      email: "routine-clin@example.com",
      password: "hunter22222",
      displayName: "C",
      role: "clinician"
    });

    const res = await app.inject({
      method: "PUT",
      url: "/me/routine",
      headers: authHeader(auth.token),
      payload: { exerciseIds: ["sit-to-stand"] }
    });
    expect(res.statusCode).toBe(403);
  });
});
