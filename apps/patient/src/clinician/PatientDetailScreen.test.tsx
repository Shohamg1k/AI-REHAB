import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProgressReport } from "@ai-rehab/contracts";
import { PatientDetailScreen } from "./PatientDetailScreen.js";
import { setSession } from "../lib/authStore.js";

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://test.local");
  setSession({
    token: "t",
    user: {
      id: "clin-1",
      tenantId: "tenant-1",
      email: "clin@example.com",
      displayName: "Dr. Test",
      role: "clinician",
      contraindicatedRegions: [],
      dataSharingEnabled: true,
      routine: [],
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The checkbox and its exercise-name span are row siblings, not wrapped in
 * a <label> — clicking the visible text doesn't toggle it, so tests must
 * find the checkbox in the same row instead. */
function checkboxFor(exerciseName: string): HTMLInputElement {
  const row = screen.getByText(exerciseName).closest("div");
  const checkbox = row?.querySelector('input[type="checkbox"]');
  if (!checkbox) throw new Error(`No checkbox found for "${exerciseName}"`);
  return checkbox as HTMLInputElement;
}

/**
 * Dispatches on URL rather than call order: this screen now loads a report
 * and a message thread alongside the session list, and a `mockResolvedValueOnce`
 * chain silently hands the wrong payload to whichever request happens to fire
 * first.
 */
function mockApi(overrides: {
  sessions?: unknown;
  sessionsFail?: boolean;
  onProgram?: () => { ok: boolean; status?: number; json: () => Promise<unknown> };
} = {}) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes("/report")) return Promise.resolve({ ok: true, json: async () => EMPTY_REPORT });
    if (url.includes("/messages")) return Promise.resolve({ ok: true, json: async () => [] });
    if (url.endsWith("/programs") && init?.method === "POST") {
      return Promise.resolve(
        overrides.onProgram?.() ?? { ok: true, json: async () => ({ id: "prog-1" }) }
      );
    }
    if (overrides.sessionsFail) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ error: "internal", message: "boom" })
      });
    }
    return Promise.resolve({ ok: true, json: async () => overrides.sessions ?? [] });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/**
 * Typed as `ProgressReport` on purpose. As an untyped literal this fixture
 * silently went stale when the contract gained fields, and the failure landed
 * at runtime in seven tests instead of at the typecheck.
 */
const EMPTY_REPORT: ProgressReport = {
  patientId: "pat-1",
  patientDisplayName: "Pat",
  periodStart: "2026-08-24T00:00:00.000Z",
  periodEnd: "2026-08-31T00:00:00.000Z",
  lastActivityAt: null,
  sessionCount: 0,
  activeDays: 0,
  totalReps: 0,
  scoredReps: 0,
  avgFormScore: null,
  exercisesPerformed: [],
  perExercise: [],
  formTrend: [],
  dataQuality: { scoredRatio: 0, unscoredReps: 0, meanConfidence: null },
  adherence: [],
  pain: [],
  safetyEvents: [],
  observations: [
    { text: "No sessions were recorded in this period.", basis: "No session events.", exerciseId: null }
  ]
};

describe("PatientDetailScreen", () => {
  it("renders a patient's session history", async () => {
    mockApi({
      sessions: [
        {
          sessionId: "s1",
          wallClock: "2026-08-30T10:00:00.000Z",
          exerciseIds: ["sit-to-stand"],
          repCount: 6,
          avgFormScore: 75,
          endedReason: "completed"
        }
      ]
    });

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/sit-to-stand/)).toBeInTheDocument();
    expect(screen.getByText(/6 reps/)).toBeInTheDocument();
  });

  it("shows an empty state when the patient has no sessions", async () => {
    mockApi();

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/no sessions synced yet/i)).toBeInTheDocument();
  });

  it("shows an error if the session history fails to load", async () => {
    mockApi({ sessionsFail: true });

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("assigns a program with the selected exercise and shows confirmation", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(checkboxFor("Sit to Stand"));
    await user.click(screen.getByText("Assign program"));

    await waitFor(() => expect(screen.getByText("Program assigned.")).toBeInTheDocument());

    const programCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith("/programs") && c[1]?.method === "POST"
    );
    const body = JSON.parse(programCall![1].body);
    expect(body.patientId).toBe("pat-1");
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0].exerciseId).toBe("sit-to-stand");
  });

  it("requires at least one exercise before assigning", async () => {
    mockApi();
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(screen.getByText("Assign program"));

    expect(await screen.findByText(/pick at least one exercise/i)).toBeInTheDocument();
  });

  it("surfaces an E5 rejection with the specific reason from the server", async () => {
    mockApi({
      onProgram: () => ({
        ok: false,
        status: 422,
        json: async () => ({
          error: "exercise_blocked",
          message: "sit-to-stand is contraindicated for this patient's knee.",
          exerciseId: "sit-to-stand",
          riskLevel: "high"
        })
      })
    });
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(checkboxFor("Sit to Stand"));
    await user.click(screen.getByText("Assign program"));

    expect(await screen.findByText(/contraindicated for this patient's knee/i)).toBeInTheDocument();
  });

  it("calls onBack when the back link is clicked", async () => {
    mockApi();
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" clinicianId="clin-1" onBack={onBack} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(screen.getByText(/back to roster/i));

    expect(onBack).toHaveBeenCalled();
  });
});
