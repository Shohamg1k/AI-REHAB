import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClinicianApp } from "./ClinicianApp.js";
import { setSession } from "../lib/authStore.js";

const CLINICIAN = {
  id: "clin-1",
  tenantId: "tenant-1",
  email: "clin@example.com",
  displayName: "Dr. Test",
  role: "clinician" as const,
  contraindicatedRegions: [],
  dataSharingEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z"
};

const PATIENT = {
  id: "pat-1",
  tenantId: "tenant-1",
  email: "pat@example.com",
  displayName: "Pat Patient",
  role: "patient" as const,
  contraindicatedRegions: [],
  dataSharingEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z"
};

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://test.local");
  setSession({ token: "t", user: CLINICIAN });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ClinicianApp", () => {
  it("shows the clinician's name and the roster by default", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [PATIENT] }) as unknown as typeof fetch;

    render(<ClinicianApp user={CLINICIAN} onSignOut={vi.fn()} />);

    expect(screen.getByText("Dr. Test")).toBeInTheDocument();
    expect(screen.getByText("Clinician")).toBeInTheDocument();
    expect(await screen.findByText("Pat Patient")).toBeInTheDocument();
  });

  it("selecting a patient switches to their detail screen, and back returns to the roster", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/patients")) return Promise.resolve({ ok: true, json: async () => [PATIENT] });
      if (url.includes("/report")) return Promise.resolve({ ok: true, json: async () => null });
      if (url.includes("/messages")) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.includes("/sessions")) return Promise.resolve({ ok: true, json: async () => [] });
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;
    const user = userEvent.setup();

    render(<ClinicianApp user={CLINICIAN} onSignOut={vi.fn()} />);
    await user.click(await screen.findByText("Pat Patient"));

    expect(await screen.findByText(/back to roster/i)).toBeInTheDocument();
    expect(screen.getByText("Session history")).toBeInTheDocument();

    await user.click(screen.getByText(/back to roster/i));

    expect(await screen.findByText("Pat Patient")).toBeInTheDocument();
  });

  it("calls onSignOut when Sign out is clicked", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    const onSignOut = vi.fn();
    const user = userEvent.setup();

    render(<ClinicianApp user={CLINICIAN} onSignOut={onSignOut} />);
    await user.click(screen.getByText("Sign out"));

    expect(onSignOut).toHaveBeenCalled();
  });
});
