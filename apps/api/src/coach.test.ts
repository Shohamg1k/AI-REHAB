import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authHeader, buildTestApp, signup } from "./testHelpers.js";

/**
 * ADR-0009. `fetch` is stubbed for Groq: these test *what we send and what
 * we refuse to send*, which is the part under our control. The quality of
 * the model's prose is not something a unit test can assert, and pretending
 * otherwise would be theatre.
 */

const FACTS = {
  exerciseName: "Sit to Stand",
  repCount: 8,
  scoredReps: 7,
  avgFormScore: 82,
  shortfalls: [{ label: "Standing fully upright", count: 3 }],
  painSeverity: 2,
  painRegion: "knee",
  safetyEvents: []
};

const originalKey = process.env.GROQ_API_KEY;

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key-not-real";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalKey;
  vi.restoreAllMocks();
});

function mockGroq(answer = "You stood up eight times and your form held steady.") {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: answer } }] })
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function patient(app: Awaited<ReturnType<typeof buildTestApp>>["app"], seed: string) {
  const { body } = await signup(app, {
    email: `coach-${seed}@example.com`,
    password: "hunter22222",
    displayName: "Coach Tester",
    role: "patient"
  });
  return body;
}

describe("C1/C3 — the coaching assistant", () => {
  it("answers a question and names the model that produced it", async () => {
    mockGroq("Your knee reached the target on most reps.");
    const { app } = await buildTestApp();
    const auth = await patient(app, "answer");

    const res = await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "How did that set go?", facts: FACTS }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().answer).toBe("Your knee reached the target on most reps.");
    // Surfaced so a generated answer is never mistaken for a measurement.
    expect(res.json().model).toBeTruthy();
  });

  it("sends the session's real numbers, and nothing that identifies the patient", async () => {
    const fetchMock = mockGroq();
    const { app } = await buildTestApp();
    const auth = await patient(app, "payload");

    await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "Why was my form marked down?", facts: FACTS }
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("groq.com");

    const sent = JSON.parse((init as RequestInit).body as string);
    const wire = JSON.stringify(sent);

    // The facts it needs to be useful.
    expect(wire).toContain("Sit to Stand");
    expect(wire).toContain("82");
    expect(wire).toContain("Standing fully upright");

    // Nothing that identifies the person. The request schema has no field
    // for these, so this asserts the shape is doing its job.
    expect(wire).not.toContain(auth.user.email);
    expect(wire).not.toContain(auth.user.id);
    expect(wire).not.toContain("Coach Tester");
  });

  it("tells the model the pain figure is the patient's own report, not an inference", async () => {
    const fetchMock = mockGroq();
    const { app } = await buildTestApp();
    const auth = await patient(app, "pain");

    await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "Is my knee okay?", facts: FACTS }
    });

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const system = sent.messages[0].content as string;

    // B6: an inferred signal must never be presented as a pain value.
    expect(system).toMatch(/their own report, not something the app inferred/i);
    // E3 and the safety invariant, stated as hard rules the user message
    // cannot override.
    expect(system).toMatch(/never tell the patient to push through pain/i);
    expect(system).toMatch(/safety gate has the final word/i);
    expect(system).toMatch(/never diagnose/i);
    expect(system).toMatch(/never invent, estimate, or extrapolate/i);
  });

  it("passes a safety block through so the assistant can only agree with it", async () => {
    const fetchMock = mockGroq();
    const { app } = await buildTestApp();
    const auth = await patient(app, "safety");

    await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: {
        question: "Why did it stop me?",
        facts: { ...FACTS, safetyEvents: ["Trunk lean 35° crossed the safe limit of 25°."] }
      }
    });

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.messages[0].content).toContain("Trunk lean 35°");
  });

  it("reports itself unavailable rather than failing, when no key is configured", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { app } = await buildTestApp();
    const auth = await patient(app, "nokey");

    const status = await app.inject({ method: "GET", url: "/coach/status" });
    expect(status.json()).toEqual({ available: false });

    const res = await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "Anything?", facts: FACTS }
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("coach_unavailable");
    expect(fetchMock).not.toHaveBeenCalled(); // never even tries
  });

  it("degrades to unavailable when Groq is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const { app } = await buildTestApp();
    const auth = await patient(app, "down");

    const res = await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "Anything?", facts: FACTS }
    });

    expect(res.statusCode).toBe(503);
    // The patient's session is unaffected by the coach being down.
    expect(res.json().message).toMatch(/session is saved/i);
  });

  it("requires a signed-in caller, because this spends money", async () => {
    mockGroq();
    const { app } = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/coach/ask",
      payload: { question: "Anything?", facts: FACTS }
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects an empty or oversized question", async () => {
    mockGroq();
    const { app } = await buildTestApp();
    const auth = await patient(app, "validate");

    const empty = await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "   ", facts: FACTS }
    });
    expect(empty.statusCode).toBe(400);

    const huge = await app.inject({
      method: "POST",
      url: "/coach/ask",
      headers: authHeader(auth.token),
      payload: { question: "x".repeat(5000), facts: FACTS }
    });
    expect(huge.statusCode).toBe(400);
  });
});
