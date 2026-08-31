import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SharingScreen } from "./SharingScreen.js";
import { setSession } from "../lib/authStore.js";

const ME = {
  id: "pat-1",
  tenantId: "tenant-1",
  email: "pat@example.com",
  displayName: "Pat",
  role: "patient" as const,
  contraindicatedRegions: [],
  dataSharingEnabled: true,
      routine: [],
  createdAt: "2026-01-01T00:00:00.000Z"
};

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://test.local");
  setSession({ token: "t", user: ME });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mockEndpoints(auditLog: unknown[] = [], me = ME) {
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/audit-log")) return Promise.resolve({ ok: true, json: async () => auditLog });
    if (url.endsWith("/me/data-sharing")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return Promise.resolve({
        ok: true,
        json: async () => ({ ...me, dataSharingEnabled: body.dataSharingEnabled })
      });
    }
    if (url.includes("/messages")) return Promise.resolve({ ok: true, json: async () => [] });
    if (url.endsWith("/auth/me")) return Promise.resolve({ ok: true, json: async () => me });
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }) as unknown as typeof fetch;
}

describe("SharingScreen (G5)", () => {
  it("states the video-never-leaves guarantee regardless of sign-in state", () => {
    mockEndpoints();
    render(<SharingScreen user={null} signedIn={false} onSignIn={vi.fn()} onSignOut={vi.fn()} onUserChanged={vi.fn()} />);
    expect(screen.getByText(/never shared, by design/i)).toBeInTheDocument();
    expect(screen.getByText(/each frame is dropped as it is read/i)).toBeInTheDocument();
  });

  it("offers sign-in instead of a dead toggle when there is nobody to share with", async () => {
    mockEndpoints();
    const onSignIn = vi.fn();
    const user = userEvent.setup();

    render(<SharingScreen user={null} signedIn={false} onSignIn={onSignIn} onSignOut={vi.fn()} onUserChanged={vi.fn()} />);

    // The important half: no consent switch is shown, because a guest has no
    // clinician and a switch controlling nothing would misrepresent that.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(screen.getByText("Sign in"));
    expect(onSignIn).toHaveBeenCalled();
  });

  it("toggling sharing off calls the API and says what that now means", async () => {
    mockEndpoints();
    const user = userEvent.setup();

    render(<SharingScreen user={ME} signedIn onSignIn={vi.fn()} onSignOut={vi.fn()} onUserChanged={vi.fn()} />);

    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText(/cannot open your sessions while this is off/i)).toBeInTheDocument();
    // Turning sharing off must not read as being dropped by the clinician.
    expect(screen.getByText(/stay on your roster/i)).toBeInTheDocument();
  });

  it("renders the access log when a clinician has looked", async () => {
    mockEndpoints([
      {
        id: "a1",
        actorId: "clin-1",
        actorDisplayName: "Dr. Test",
        subjectUserId: "pat-1",
        action: "view_sessions",
        createdAt: "2026-08-30T11:00:00.000Z"
      }
    ]);

    render(<SharingScreen user={ME} signedIn onSignIn={vi.fn()} onSignOut={vi.fn()} onUserChanged={vi.fn()} />);

    expect(await screen.findByText(/Dr. Test — view sessions/)).toBeInTheDocument();
  });

  it("says so plainly when nobody has opened the data", async () => {
    mockEndpoints([]);
    render(<SharingScreen user={ME} signedIn onSignIn={vi.fn()} onSignOut={vi.fn()} onUserChanged={vi.fn()} />);
    expect(await screen.findByText(/no clinician has opened your data/i)).toBeInTheDocument();
  });
});
