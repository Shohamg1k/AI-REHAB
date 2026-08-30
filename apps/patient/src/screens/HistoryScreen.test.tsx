import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryScreen } from "./HistoryScreen.js";
import { setSession } from "../lib/authStore.js";

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://test.local");
  setSession({
    token: "t",
    user: {
      id: "pat-1",
      tenantId: "tenant-1",
      email: "pat@example.com",
      displayName: "Pat",
      role: "patient",
      contraindicatedRegions: [],
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function mockThreeEndpoints(sessions: unknown[], adherence: unknown[], auditLog: unknown[]) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith("/sessions")) return Promise.resolve({ ok: true, json: async () => sessions });
    if (url.includes("/projections/adherence")) return Promise.resolve({ ok: true, json: async () => adherence });
    if (url.endsWith("/audit-log")) return Promise.resolve({ ok: true, json: async () => auditLog });
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }) as unknown as typeof fetch;
}

describe("HistoryScreen", () => {
  it("renders sessions, adherence calendar, and audit log together", async () => {
    mockThreeEndpoints(
      [
        {
          sessionId: "s1",
          wallClock: "2026-08-30T10:00:00.000Z",
          exerciseIds: ["sit-to-stand"],
          repCount: 8,
          avgFormScore: 82,
          endedReason: "completed"
        }
      ],
      [{ date: new Date().toISOString().slice(0, 10), sessionCount: 1 }],
      [
        {
          id: "a1",
          actorId: "clin-1",
          actorDisplayName: "Dr. Test",
          subjectUserId: "pat-1",
          action: "view_sessions",
          createdAt: "2026-08-30T11:00:00.000Z"
        }
      ]
    );

    render(<HistoryScreen onBack={vi.fn()} />);

    expect(await screen.findByText(/sit-to-stand/)).toBeInTheDocument();
    expect(screen.getByText(/8 reps/)).toBeInTheDocument();
    expect(screen.getByText(/Dr. Test/)).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // the streak count
  });

  it("shows empty states when nothing has synced yet", async () => {
    mockThreeEndpoints([], [], []);

    render(<HistoryScreen onBack={vi.fn()} />);

    expect(await screen.findByText(/no synced sessions yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no clinician has viewed/i)).toBeInTheDocument();
  });

  it("shows an error if the API call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal", message: "server exploded" })
    }) as unknown as typeof fetch;

    render(<HistoryScreen onBack={vi.fn()} />);

    expect(await screen.findByText("server exploded")).toBeInTheDocument();
  });
});
