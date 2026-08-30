import type {
  AdherenceDay,
  AuditEntry,
  BaselineEntry,
  Program,
  ProgramExercise,
  SessionEvent,
  SessionSummary,
  Tenant,
  User
} from "@ai-rehab/contracts";

/**
 * The one seam every route handler talks through instead of a database
 * client directly. Two implementations exist: `postgresStore.ts` (Drizzle +
 * Postgres RLS, what runs in production) and `memoryStore.ts` (in-process,
 * what the test suite runs against).
 *
 * This split exists because this development environment has no Postgres
 * and no Docker available to run one — see docs/STATUS.md. Rather than
 * ship the API with zero integration coverage, route logic, auth, tenant
 * isolation, and idempotent event sync are all tested for real (via
 * Fastify's `.inject()`) against the in-memory store, which implements the
 * exact same contract the real one does. It is not a mock of the
 * interface — it *is* a full, correct implementation of it, just without
 * durability. The real store still needs verification against a live
 * Postgres before this goes anywhere near production; that is flagged
 * explicitly in docs/STATUS.md, not glossed over.
 *
 * Every method takes `tenantId` explicitly even though the Postgres
 * implementation additionally enforces it via RLS (see
 * apps/api/src/db/rls.sql). That is deliberate defense in depth: a bug in
 * RLS policy setup should not silently become a cross-tenant data leak if
 * the application layer already scopes every query.
 */
export interface Store {
  // --- tenants & users ---
  createTenant(name: string): Promise<Tenant>;
  createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string;
    role: User["role"];
  }): Promise<User>;
  findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null>;
  findUserById(tenantId: string, userId: string): Promise<User | null>;

  // --- invites ---
  createInvite(input: { tenantId: string; createdBy: string }): Promise<{
    code: string;
    expiresAt: string;
  }>;
  /** Consumes (single-use) a valid, unexpired invite and returns its tenant. */
  consumeInvite(code: string): Promise<{ tenantId: string; createdBy: string } | null>;

  // --- clinician <-> patient links ---
  linkPatient(input: { tenantId: string; clinicianId: string; patientId: string }): Promise<void>;
  listPatients(tenantId: string, clinicianId: string): Promise<User[]>;
  isLinked(tenantId: string, clinicianId: string, patientId: string): Promise<boolean>;

  // --- programs ---
  createProgram(input: {
    tenantId: string;
    patientId: string;
    createdBy: string;
    notes: string | null;
    exercises: ProgramExercise[];
  }): Promise<Program>;
  getCurrentProgram(tenantId: string, patientId: string): Promise<Program | null>;

  // --- session events (G1 sync target) ---
  /** Idempotent on (userId, sessionId, seq) — a retried batch upserts, never duplicates. */
  appendEvents(input: {
    tenantId: string;
    userId: string;
    sessionId: string;
    events: Array<{ seq: number; event: SessionEvent }>;
  }): Promise<{ inserted: number; duplicates: number }>;
  listSessions(tenantId: string, userId: string): Promise<SessionSummary[]>;
  listSessionEvents(tenantId: string, userId: string, sessionId: string): Promise<SessionEvent[]>;

  // --- projections (G2) ---
  getAdherence(tenantId: string, userId: string): Promise<AdherenceDay[]>;
  getBaseline(tenantId: string, userId: string): Promise<BaselineEntry[]>;

  // --- audit (G5 / F5) ---
  recordAccess(input: {
    tenantId: string;
    actorId: string;
    subjectUserId: string;
    action: string;
  }): Promise<void>;
  listAccessLog(tenantId: string, subjectUserId: string): Promise<AuditEntry[]>;
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
