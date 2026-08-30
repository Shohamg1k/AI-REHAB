import type { AuthResponse, Role, SessionSummary, SyncResponse } from "@ai-rehab/contracts";
import { getSession } from "./authStore.js";

/**
 * Thin fetch wrapper around apps/api. Unset `VITE_API_URL` means "no
 * server configured" — every function here throws `ApiUnavailableError`
 * in that case, and every call site treats that as "stay in local-only
 * mode" rather than a crash. The guest-first flow (H7) never calls any of
 * this.
 */
export class ApiUnavailableError extends Error {
  constructor() {
    super("No API server is configured for this build (VITE_API_URL is unset).");
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function baseUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (!url) throw new ApiUnavailableError();
  return url.replace(/\/$/, "");
}

export function isApiConfigured(): boolean {
  return !!import.meta.env.VITE_API_URL;
}

async function request<T>(path: string, init: RequestInit = {}, authed = false): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (authed) {
    const session = getSession();
    if (!session) throw new ApiError(401, "Not signed in.");
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? body?.error ?? `Request to ${path} failed (${res.status}).`);
  }
  return body as T;
}

export function signup(input: {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  inviteCode?: string;
}): Promise<AuthResponse> {
  return request("/auth/signup", { method: "POST", body: JSON.stringify(input) });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function syncEvents(
  sessionId: string,
  events: Array<{ seq: number; event: unknown }>
): Promise<SyncResponse> {
  return request("/events", { method: "POST", body: JSON.stringify({ sessionId, events }) }, true);
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return request("/sessions", {}, true);
}
