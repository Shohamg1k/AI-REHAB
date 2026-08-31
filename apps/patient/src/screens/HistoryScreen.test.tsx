import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryScreen } from "./HistoryScreen.js";
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

function mockEndpoints(overrides: {
  sessions?: unknown[];
  adherence?: unknown[];
  auditLog?: unknown[];
  romTrend?: unknown[];
  me?: typeof ME;
}) {
  const { sessions = [], adherence = [], auditLog = [], romTrend = [], me = ME } = overrides;
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith("/sessions")) return Promise.resolve({ ok: true, json: async () => sessions });
    if (url.includes("/projections/adherence")) return Promise.resolve({ ok: true, json: async () => adherence });
    if (url.endsWith("/audit-log")) return Promise.resolve({ ok: true, json: async () => auditLog });
    if (url.includes("/projections/rom-trend")) return Promise.resolve({ ok: true, json: async () => romTrend });
    if (url.endsWith("/me/data-sharing")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      return Promise.resolve({ ok: true, json: async () => ({ ...me, dataSharingEnabled: body.dataSharingEnabled }) });
    }
    if (url.endsWith("/auth/me")) return Promise.resolve({ ok: true, json: async () => me });
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  }) as unknown as typeof fetch;
}

describe("HistoryScreen", () => {
  it("renders sessions, adherence calendar, and audit log together", async () => {
    mockEndpoints({
      sessions: [
        {
          sessionId: "s1",
          wallClock: "2026-08-30T10:00:00.000Z",
          exerciseIds: ["sit-to-stand"],
          repCount: 8,
          avgFormScore: 82,
          endedReason: "completed"
        }
      ],
      adherence: [{ date: new Date().toISOString().slice(0, 10), sessionCount: 1 }],
      auditLog: [
        {
          id: "a1",
          actorId: "clin-1",
          actorDisplayName: "Dr. Test",
          subjectUserId: "pat-1",
          action: "view_sessions",
          createdAt: "2026-08-30T11:00:00.000Z"
        }
      ]
    });

    render(<HistoryScreen />);

    expect(await screen.findByText(/sit-to-stand/)).toBeInTheDocument();
    expect(screen.getByText(/8 reps/)).toBeInTheDocument();
    expect(screen.getByText("1-day streak")).toBeInTheDocument();
    expect(screen.getByText(/First session/)).toBeInTheDocument();
  });

  it("shows empty states when nothing has synced yet", async () => {
    mockEndpoints({});

    render(<HistoryScreen />);

    expect(await screen.findByText(/no synced sessions yet/i)).toBeInTheDocument();
  });

  it("shows an error if the API call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal", message: "server exploded" })
    }) as unknown as typeof fetch;

    render(<HistoryScreen />);

    expect(await screen.findByText("server exploded")).toBeInTheDocument();
  });

  it("renders a range-of-motion trend with a delta since the first session", async () => {
    mockEndpoints({
      romTrend: [
        {
          exerciseId: "seated-knee-extension",
          joint: "left_knee",
          points: [
            { recordedAt: "2026-08-01T00:00:00.000Z", peakAngle: 90 },
            { recordedAt: "2026-08-15T00:00:00.000Z", peakAngle: 102 }
          ]
        }
      ]
    });

    render(<HistoryScreen />);

    expect(await screen.findByText(/left knee/)).toBeInTheDocument();
    expect(screen.getByText(/\+12° since first session/)).toBeInTheDocument();
  });

});
