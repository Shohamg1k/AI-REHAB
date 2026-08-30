import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RosterScreen } from "./RosterScreen.js";
import { setSession } from "../lib/authStore.js";

const PATIENT = {
  id: "pat-1",
  tenantId: "tenant-1",
  email: "pat@example.com",
  displayName: "Pat Patient",
  role: "patient" as const,
  contraindicatedRegions: [],
  createdAt: "2026-01-01T00:00:00.000Z"
};

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://test.local");
  setSession({
    token: "t",
    user: { ...PATIENT, id: "clin-1", role: "clinician", displayName: "Dr. Test" }
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RosterScreen", () => {
  it("renders the clinician's patients from the API", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [PATIENT]
    }) as unknown as typeof fetch;

    render(<RosterScreen onSelectPatient={vi.fn()} />);

    expect(await screen.findByText("Pat Patient")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
  });

  it("shows an empty state with no patients", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;

    render(<RosterScreen onSelectPatient={vi.fn()} />);

    expect(await screen.findByText(/no patients yet/i)).toBeInTheDocument();
  });

  it("clicking a patient calls onSelectPatient with their id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [PATIENT]
    }) as unknown as typeof fetch;
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<RosterScreen onSelectPatient={onSelect} />);
    await user.click(await screen.findByText("Pat Patient"));

    expect(onSelect).toHaveBeenCalledWith("pat-1");
  });

  it("generating an invite shows the code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // initial roster load
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: "ABC12345", expiresAt: "2026-09-06T00:00:00.000Z" })
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<RosterScreen onSelectPatient={vi.fn()} />);
    await screen.findByText(/no patients yet/i);
    await user.click(screen.getByText("Invite a patient"));

    await waitFor(() => expect(screen.getByText("ABC12345")).toBeInTheDocument());
  });

  it("shows an error message when the roster fails to load", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal", message: "boom" })
    }) as unknown as typeof fetch;

    render(<RosterScreen onSelectPatient={vi.fn()} />);

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
