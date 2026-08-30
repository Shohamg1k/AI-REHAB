import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("PatientDetailScreen", () => {
  it("renders a patient's session history", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sessionId: "s1",
          wallClock: "2026-08-30T10:00:00.000Z",
          exerciseIds: ["sit-to-stand"],
          repCount: 6,
          avgFormScore: 75,
          endedReason: "completed"
        }
      ]
    }) as unknown as typeof fetch;

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/sit-to-stand/)).toBeInTheDocument();
    expect(screen.getByText(/6 reps/)).toBeInTheDocument();
  });

  it("shows an empty state when the patient has no sessions", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);

    expect(await screen.findByText(/no sessions synced yet/i)).toBeInTheDocument();
  });

  it("shows an error if the session history fails to load", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal", message: "boom" })
    }) as unknown as typeof fetch;

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("assigns a program with the selected exercise and shows confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // sessions load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "prog-1",
          tenantId: "tenant-1",
          patientId: "pat-1",
          createdBy: "clin-1",
          notes: null,
          exercises: [],
          createdAt: "2026-08-30T00:00:00.000Z"
        })
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(checkboxFor("Sit to Stand"));
    await user.click(screen.getByText("Assign program"));

    await waitFor(() => expect(screen.getByText("Program assigned.")).toBeInTheDocument());

    const [, programCall] = fetchMock.mock.calls;
    const body = JSON.parse(programCall![1].body);
    expect(body.patientId).toBe("pat-1");
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0].exerciseId).toBe("sit-to-stand");
  });

  it("requires at least one exercise before assigning", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(screen.getByText("Assign program"));

    expect(await screen.findByText(/pick at least one exercise/i)).toBeInTheDocument();
  });

  it("surfaces an E5 rejection with the specific reason from the server", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // sessions load
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
          error: "exercise_blocked",
          message: "sit-to-stand is contraindicated for this patient's knee.",
          exerciseId: "sit-to-stand",
          riskLevel: "high"
        })
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" onBack={vi.fn()} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(checkboxFor("Sit to Stand"));
    await user.click(screen.getByText("Assign program"));

    expect(await screen.findByText(/contraindicated for this patient's knee/i)).toBeInTheDocument();
  });

  it("calls onBack when the back link is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    const onBack = vi.fn();
    const user = userEvent.setup();

    render(<PatientDetailScreen patientId="pat-1" onBack={onBack} />);
    await screen.findByText(/no sessions synced yet/i);

    await user.click(screen.getByText(/back to roster/i));

    expect(onBack).toHaveBeenCalled();
  });
});
