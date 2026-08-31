import { and, asc, eq, gt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type {
  AdherenceDay,
  AuditEntry,
  BaselineEntry,
  BodyRegion,
  Program,
  ProgramExercise,
  RomTrendSeries,
  SessionEvent,
  SessionSummary,
  Tenant,
  User
} from "@ai-rehab/contracts";
import {
  computeAdherence,
  computeBaseline,
  computeRomTrend,
  summariseSessions,
  type StoredSession
} from "../projections.js";
import { withTenant, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { ConflictError, NotFoundError, type Store } from "./types.js";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function toUser(row: typeof schema.users.$inferSelect): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    contraindicatedRegions: (row.contraindicatedRegions ?? []) as BodyRegion[],
    dataSharingEnabled: row.dataSharingEnabled,
    createdAt: row.createdAt.toISOString()
  };
}

/**
 * Real, Postgres-backed implementation of `Store`. Every method that
 * touches a tenant-scoped table wraps its work in `withTenant` so RLS
 * (migrations/0001_rls.sql) is enforced for the duration of the call — see
 * that file and `db/client.ts` for why. This has been reviewed carefully
 * but **not run against a live Postgres in this environment** — see
 * docs/STATUS.md for exactly what that means for how much to trust it
 * before using it anywhere real. The interface-level logic (auth flow,
 * tenant isolation, idempotent sync) is the same logic verified against
 * `MemoryStore` in the test suite; what's unverified here specifically is
 * the SQL itself and the RLS policies' actual runtime behaviour.
 */
export class PostgresStore implements Store {
  constructor(private readonly db: Db) {}

  async createTenant(name: string): Promise<Tenant> {
    const [row] = await this.db.insert(schema.tenants).values({ name }).returning();
    if (!row) throw new Error("tenant insert returned no row");
    return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
  }

  async createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string;
    role: User["role"];
  }): Promise<User> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      try {
        const [row] = await tx
          .insert(schema.users)
          .values({
            tenantId: input.tenantId,
            email: input.email.toLowerCase(),
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            role: input.role
          })
          .returning();
        if (!row) throw new Error("user insert returned no row");
        return toUser(row);
      } catch (err) {
        // Postgres unique_violation on users_email_unique.
        if (err instanceof Error && /unique/i.test(err.message)) {
          throw new ConflictError("An account with this email already exists.");
        }
        throw err;
      }
    });
  }

  async findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    // Deliberately not tenant-scoped — see migrations/0001_rls.sql on
    // `users_read_for_login`. This is the one lookup that has to run before
    // a tenant is known.
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase()))
      .limit(1);
    return row ? { ...toUser(row), passwordHash: row.passwordHash } : null;
  }

  async findUserById(tenantId: string, userId: string): Promise<User | null> {
    // Explicit tenantId filter even though RLS's read policy here is
    // unrestricted (see users_read_for_login) — the application layer
    // still enforces the boundary itself.
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async updateContraindications(
    tenantId: string,
    userId: string,
    regions: BodyRegion[]
  ): Promise<User> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set({ contraindicatedRegions: regions })
        .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)))
        .returning();
      if (!row) throw new NotFoundError(`user "${userId}" not found`);
      return toUser(row);
    });
  }

  async joinTenantByInvite(userId: string, code: string): Promise<User | null> {
    const invite = await this.consumeInvite(code);
    if (!invite) return null;

    // Runs against the *new* tenant: every row being written now belongs to
    // it, and the RLS policies are evaluated per statement.
    return withTenant(this.db, invite.tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set({ tenantId: invite.tenantId })
        .where(and(eq(schema.users.id, userId), eq(schema.users.role, "patient")))
        .returning();
      if (!row) return null;

      // The patient's own history has to move with them — it is tenant-scoped,
      // so left behind it would sit on the far side of an isolation boundary
      // the patient can no longer cross.
      await tx
        .update(schema.sessionEvents)
        .set({ tenantId: invite.tenantId })
        .where(eq(schema.sessionEvents.userId, userId));
      await tx
        .update(schema.programs)
        .set({ tenantId: invite.tenantId })
        .where(eq(schema.programs.patientId, userId));

      await tx
        .insert(schema.clinicianPatientLinks)
        .values({ tenantId: invite.tenantId, clinicianId: invite.createdBy, patientId: userId })
        .onConflictDoNothing();

      return toUser(row);
    });
  }

  async updateDataSharing(tenantId: string, userId: string, enabled: boolean): Promise<User> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set({ dataSharingEnabled: enabled })
        .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId)))
        .returning();
      if (!row) throw new NotFoundError(`user "${userId}" not found`);
      return toUser(row);
    });
  }

  async createInvite(input: { tenantId: string; createdBy: string }) {
    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await withTenant(this.db, input.tenantId, async (tx) => {
      await tx.insert(schema.inviteCodes).values({
        code,
        tenantId: input.tenantId,
        createdBy: input.createdBy,
        expiresAt
      });
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }

  async consumeInvite(code: string): Promise<{ tenantId: string; createdBy: string } | null> {
    // Not tenant-scoped — see invite_read_by_code / invite_delete_by_code
    // in migrations/0001_rls.sql. Possession of the code is the credential.
    const [row] = await this.db
      .select()
      .from(schema.inviteCodes)
      .where(and(eq(schema.inviteCodes.code, code), gt(schema.inviteCodes.expiresAt, new Date())))
      .limit(1);
    if (!row) return null;

    // Single-use: delete on redemption. A second submission of the same
    // code simply won't be found above.
    await this.db.delete(schema.inviteCodes).where(eq(schema.inviteCodes.code, code));
    return { tenantId: row.tenantId, createdBy: row.createdBy };
  }

  async linkPatient(input: { tenantId: string; clinicianId: string; patientId: string }): Promise<void> {
    await withTenant(this.db, input.tenantId, async (tx) => {
      await tx
        .insert(schema.clinicianPatientLinks)
        .values({ tenantId: input.tenantId, clinicianId: input.clinicianId, patientId: input.patientId })
        .onConflictDoNothing();
    });
  }

  async listPatients(tenantId: string, clinicianId: string): Promise<User[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ user: schema.users })
        .from(schema.clinicianPatientLinks)
        .innerJoin(schema.users, eq(schema.users.id, schema.clinicianPatientLinks.patientId))
        .where(
          and(
            eq(schema.clinicianPatientLinks.tenantId, tenantId),
            eq(schema.clinicianPatientLinks.clinicianId, clinicianId)
          )
        );
      return rows.map((r) => toUser(r.user));
    });
  }

  async isLinked(tenantId: string, clinicianId: string, patientId: string): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: schema.clinicianPatientLinks.id })
        .from(schema.clinicianPatientLinks)
        .where(
          and(
            eq(schema.clinicianPatientLinks.tenantId, tenantId),
            eq(schema.clinicianPatientLinks.clinicianId, clinicianId),
            eq(schema.clinicianPatientLinks.patientId, patientId)
          )
        )
        .limit(1);
      return !!row;
    });
  }

  async createProgram(input: {
    tenantId: string;
    patientId: string;
    createdBy: string;
    notes: string | null;
    exercises: ProgramExercise[];
  }): Promise<Program> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      const [programRow] = await tx
        .insert(schema.programs)
        .values({
          tenantId: input.tenantId,
          patientId: input.patientId,
          createdBy: input.createdBy,
          notes: input.notes
        })
        .returning();
      if (!programRow) throw new Error("program insert returned no row");

      if (input.exercises.length > 0) {
        await tx.insert(schema.programExercises).values(
          input.exercises.map((ex) => ({
            tenantId: input.tenantId,
            programId: programRow.id,
            exerciseId: ex.exerciseId,
            targetRegions: ex.targetRegions,
            intensity: ex.intensity,
            sets: ex.sets,
            reps: ex.reps,
            sortOrder: ex.sortOrder
          }))
        );
      }

      return {
        id: programRow.id,
        tenantId: programRow.tenantId,
        patientId: programRow.patientId,
        createdBy: programRow.createdBy,
        notes: programRow.notes,
        exercises: input.exercises,
        createdAt: programRow.createdAt.toISOString()
      };
    });
  }

  async getCurrentProgram(tenantId: string, patientId: string): Promise<Program | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [programRow] = await tx
        .select()
        .from(schema.programs)
        .where(and(eq(schema.programs.tenantId, tenantId), eq(schema.programs.patientId, patientId)))
        .orderBy(sql`${schema.programs.createdAt} desc`)
        .limit(1);
      if (!programRow) return null;

      const exerciseRows = await tx
        .select()
        .from(schema.programExercises)
        .where(eq(schema.programExercises.programId, programRow.id))
        .orderBy(asc(schema.programExercises.sortOrder));

      return {
        id: programRow.id,
        tenantId: programRow.tenantId,
        patientId: programRow.patientId,
        createdBy: programRow.createdBy,
        notes: programRow.notes,
        exercises: exerciseRows.map((e) => ({
          exerciseId: e.exerciseId,
          targetRegions: e.targetRegions as BodyRegion[],
          intensity: e.intensity,
          sets: e.sets,
          reps: e.reps,
          sortOrder: e.sortOrder
        })),
        createdAt: programRow.createdAt.toISOString()
      };
    });
  }

  async appendEvents(input: {
    tenantId: string;
    userId: string;
    sessionId: string;
    events: Array<{ seq: number; event: SessionEvent }>;
  }): Promise<{ inserted: number; duplicates: number }> {
    return withTenant(this.db, input.tenantId, async (tx) => {
      let inserted = 0;
      let duplicates = 0;
      // One row at a time via onConflictDoNothing rather than a single
      // bulk insert: needed to count inserted vs duplicate accurately,
      // which the sync response (SyncResponse) reports back to the client
      // for its own retry bookkeeping.
      for (const item of input.events) {
        const result = await tx
          .insert(schema.sessionEvents)
          .values({
            tenantId: input.tenantId,
            userId: input.userId,
            sessionId: input.sessionId,
            seq: item.seq,
            eventType: item.event.type,
            t: Math.trunc(item.event.t),
            payload: item.event
          })
          // Matches the session_events_idempotency unique index (schema.ts)
          // exactly — this is the idempotency guarantee SyncRequest depends on.
          .onConflictDoNothing({
            target: [schema.sessionEvents.userId, schema.sessionEvents.sessionId, schema.sessionEvents.seq]
          })
          .returning({ id: schema.sessionEvents.id });
        if (result.length > 0) inserted += 1;
        else duplicates += 1;
      }
      return { inserted, duplicates };
    });
  }

  async listSessions(tenantId: string, userId: string): Promise<SessionSummary[]> {
    const sessions = await this.fetchAllSessions(tenantId, userId);
    return summariseSessions(sessions);
  }

  async listSessionEvents(tenantId: string, userId: string, sessionId: string): Promise<SessionEvent[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ seq: schema.sessionEvents.seq, payload: schema.sessionEvents.payload })
        .from(schema.sessionEvents)
        .where(
          and(
            eq(schema.sessionEvents.tenantId, tenantId),
            eq(schema.sessionEvents.userId, userId),
            eq(schema.sessionEvents.sessionId, sessionId)
          )
        )
        .orderBy(asc(schema.sessionEvents.seq));
      if (rows.length === 0) throw new NotFoundError(`session "${sessionId}" not found`);
      return rows.map((r) => r.payload as SessionEvent);
    });
  }

  async getAdherence(tenantId: string, userId: string): Promise<AdherenceDay[]> {
    return computeAdherence(await this.fetchAllSessions(tenantId, userId));
  }

  async getBaseline(tenantId: string, userId: string): Promise<BaselineEntry[]> {
    return computeBaseline(await this.fetchAllSessions(tenantId, userId));
  }

  async getRomTrend(tenantId: string, userId: string): Promise<RomTrendSeries[]> {
    return computeRomTrend(await this.fetchAllSessions(tenantId, userId));
  }

  async recordAccess(input: {
    tenantId: string;
    actorId: string;
    subjectUserId: string;
    action: string;
  }): Promise<void> {
    await withTenant(this.db, input.tenantId, async (tx) => {
      await tx.insert(schema.auditLog).values({
        tenantId: input.tenantId,
        actorId: input.actorId,
        subjectUserId: input.subjectUserId,
        action: input.action
      });
    });
  }

  async listAccessLog(tenantId: string, subjectUserId: string): Promise<AuditEntry[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ log: schema.auditLog, actor: schema.users })
        .from(schema.auditLog)
        .innerJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
        .where(
          and(eq(schema.auditLog.tenantId, tenantId), eq(schema.auditLog.subjectUserId, subjectUserId))
        )
        .orderBy(sql`${schema.auditLog.createdAt} desc`);
      return rows.map((r) => ({
        id: String(r.log.id),
        actorId: r.log.actorId,
        actorDisplayName: r.actor.displayName,
        subjectUserId: r.log.subjectUserId,
        action: r.log.action,
        createdAt: r.log.createdAt.toISOString()
      }));
    });
  }

  /** Shared by listSessions/getAdherence/getBaseline — all three walk the full event history. */
  private async fetchAllSessions(tenantId: string, userId: string): Promise<StoredSession[]> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          sessionId: schema.sessionEvents.sessionId,
          seq: schema.sessionEvents.seq,
          payload: schema.sessionEvents.payload
        })
        .from(schema.sessionEvents)
        .where(and(eq(schema.sessionEvents.tenantId, tenantId), eq(schema.sessionEvents.userId, userId)));

      const bySession = new Map<string, StoredSession>();
      for (const row of rows) {
        let session = bySession.get(row.sessionId);
        if (!session) {
          session = { sessionId: row.sessionId, events: [] };
          bySession.set(row.sessionId, session);
        }
        session.events.push({ seq: row.seq, event: row.payload as SessionEvent });
      }
      return [...bySession.values()];
    });
  }
}
