import type {
  AdherenceDay,
  AuditEntry,
  AuthResponse,
  BaselineEntry,
  BodyRegion,
  CreateProgramRequest,
  CoachAnswer,
  CoachQuestionRequest,
  Message,
  Program,
  ProgressReport,
  Role,
  RomTrendSeries,
  SessionSummary,
  SyncResponse,
  User
} from "@ai-rehab/contracts";
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
    message: string,
    public body?: unknown
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
  // Only when there's an actual body: Fastify's JSON body parser rejects a
  // request that declares this content-type but sends zero bytes (a bare
  // POST with no payload, like /invites) — found by actually clicking
  // through the flow in a browser, not by inspection.
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (authed) {
    const session = getSession();
    if (!session) throw new ApiError(401, "Not signed in.");
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.message ?? body?.error ?? `Request to ${path} failed (${res.status}).`, body);
  }
  return body as T;
}

// --- auth ---

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

export function fetchMe(): Promise<User> {
  return request("/auth/me", {}, true);
}

export function updateContraindications(regions: BodyRegion[]): Promise<User> {
  return request(
    "/me/contraindications",
    { method: "PUT", body: JSON.stringify({ contraindicatedRegions: regions }) },
    true
  );
}

/** Redeem a clinician's invite code after signup. Returns a fresh token: the caller's tenant has changed. */
export function joinWithCode(code: string): Promise<AuthResponse> {
  return request("/me/join", { method: "POST", body: JSON.stringify({ code }) }, true);
}

/** The patient's own exercise selection, stored server-side so it follows them between devices. */
export function updateRoutine(exerciseIds: readonly string[]): Promise<User> {
  return request("/me/routine", { method: "PUT", body: JSON.stringify({ exerciseIds }) }, true);
}

export function updateDataSharing(enabled: boolean): Promise<User> {
  return request(
    "/me/data-sharing",
    { method: "PUT", body: JSON.stringify({ dataSharingEnabled: enabled }) },
    true
  );
}

// --- patient: sync + history (G2/G6/H1/H2/G5) ---

export function syncEvents(
  sessionId: string,
  events: Array<{ seq: number; event: unknown }>
): Promise<SyncResponse> {
  return request("/events", { method: "POST", body: JSON.stringify({ sessionId, events }) }, true);
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return request("/sessions", {}, true);
}

export function fetchAdherence(): Promise<AdherenceDay[]> {
  return request("/projections/adherence", {}, true);
}

export function fetchBaseline(): Promise<BaselineEntry[]> {
  return request("/projections/baseline", {}, true);
}

export function fetchRomTrend(): Promise<RomTrendSeries[]> {
  return request("/projections/rom-trend", {}, true);
}

export function fetchAuditLog(): Promise<AuditEntry[]> {
  return request("/audit-log", {}, true);
}

export function fetchMyProgram(): Promise<Program | null> {
  return request("/programs/mine", {}, true);
}

// --- coaching assistant (C1/C3, ADR-0009) ---

/** Whether a coach is configured at all. Unauthenticated: it reveals nothing about a patient. */
export function fetchCoachStatus(): Promise<{ available: boolean }> {
  return request("/coach/status", {});
}

export function askCoach(input: CoachQuestionRequest): Promise<CoachAnswer> {
  return request("/coach/ask", { method: "POST", body: JSON.stringify(input) }, true);
}

// --- reports (F1) + messages (F9) ---

export function fetchMyReport(days = 7): Promise<ProgressReport> {
  return request(`/me/report?days=${days}`, {}, true);
}

/** Clinician-side. Gated by the patient's data-sharing consent, and audit-logged. */
export function fetchPatientReport(patientId: string, days = 7): Promise<ProgressReport> {
  return request(`/patients/${patientId}/report?days=${days}`, {}, true);
}

/** Omit `patientId` as a patient — the server always uses your own thread. */
export function fetchMessages(patientId?: string): Promise<Message[]> {
  return request(patientId ? `/messages?patientId=${patientId}` : "/messages", {}, true);
}

export function sendMessage(body: string, patientId?: string): Promise<Message> {
  return request("/messages", { method: "POST", body: JSON.stringify({ body, patientId }) }, true);
}

// --- clinician (F6) ---

export function fetchPatients(): Promise<User[]> {
  return request("/patients", {}, true);
}

export function fetchPatientSessions(patientId: string): Promise<SessionSummary[]> {
  return request(`/patients/${patientId}/sessions`, {}, true);
}

export function createInvite(): Promise<{ code: string; expiresAt: string }> {
  return request("/invites", { method: "POST" }, true);
}

export function createProgram(input: CreateProgramRequest): Promise<Program> {
  return request("/programs", { method: "POST", body: JSON.stringify(input) }, true);
}
