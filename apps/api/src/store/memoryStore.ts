import { randomUUID } from "node:crypto";
import type {
  AdherenceDay,
  AuditEntry,
  BaselineEntry,
  Message,
  ProgressReport,
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
  computeReport,
  computeRomTrend,
  summariseSessions,
  type StoredSession
} from "../projections.js";
import { ConflictError, NotFoundError, type Store } from "./types.js";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type StoredUser = User & { passwordHash: string };
/** Messages carry their tenant internally; `Message` itself does not expose it. */
type StoredMessage = Message & { tenantId: string };

/**
 * A complete, correct implementation of `Store` — not a stub. See the
 * doc comment on the `Store` interface for why this exists alongside the
 * Postgres implementation rather than only as a test double.
 */
export class MemoryStore implements Store {
  private tenants = new Map<string, Tenant>();
  private users = new Map<string, StoredUser>();
  private usersByEmail = new Map<string, string>(); // email -> userId
  private invites = new Map<string, { tenantId: string; createdBy: string; expiresAt: number }>();
  private links = new Set<string>(); // `${tenantId}:${clinicianId}:${patientId}`
  private programs = new Map<string, Program>();
  private programsByPatient = new Map<string, string>(); // patientId -> current programId
  /** userId -> sessionId -> StoredSession */
  private sessions = new Map<string, Map<string, StoredSession>>();
  private auditLog: AuditEntry[] = [];
  private messages: StoredMessage[] = [];

  async createTenant(name: string): Promise<Tenant> {
    const tenant: Tenant = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async createUser(input: {
    tenantId: string;
    email: string;
    passwordHash: string;
    displayName: string;
    role: User["role"];
  }): Promise<User> {
    const normalizedEmail = input.email.toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new ConflictError("An account with this email already exists.");
    }
    const user: StoredUser = {
      id: randomUUID(),
      tenantId: input.tenantId,
      email: normalizedEmail,
      displayName: input.displayName,
      role: input.role,
      contraindicatedRegions: [],
      dataSharingEnabled: true,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user.id);
    return stripPasswordHash(user);
  }

  async updateContraindications(
    tenantId: string,
    userId: string,
    regions: BodyRegion[]
  ): Promise<User> {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError(`user "${userId}" not found`);
    user.contraindicatedRegions = regions;
    return stripPasswordHash(user);
  }

  async joinTenantByInvite(userId: string, code: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user || user.role !== "patient") return null;

    const invite = await this.consumeInvite(code);
    if (!invite) return null;

    // Sessions here are keyed by userId, so they follow the patient without
    // rewriting. Programs carry an explicit tenantId and do not.
    const previousProgramId = this.programsByPatient.get(userId);
    if (previousProgramId) {
      const program = this.programs.get(previousProgramId);
      if (program) this.programs.set(previousProgramId, { ...program, tenantId: invite.tenantId });
    }

    user.tenantId = invite.tenantId;
    await this.linkPatient({
      tenantId: invite.tenantId,
      clinicianId: invite.createdBy,
      patientId: userId
    });
    return stripPasswordHash(user);
  }

  async updateDataSharing(tenantId: string, userId: string, enabled: boolean): Promise<User> {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) throw new NotFoundError(`user "${userId}" not found`);
    user.dataSharingEnabled = enabled;
    return stripPasswordHash(user);
  }

  async findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const id = this.usersByEmail.get(email.toLowerCase());
    if (!id) return null;
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async findUserById(tenantId: string, userId: string): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) return null;
    return stripPasswordHash(user);
  }

  async createInvite(input: { tenantId: string; createdBy: string }) {
    const code = randomUUID().slice(0, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    this.invites.set(code, {
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      expiresAt: Date.now() + INVITE_TTL_MS
    });
    return { code, expiresAt };
  }

  async consumeInvite(code: string): Promise<{ tenantId: string; createdBy: string } | null> {
    const invite = this.invites.get(code);
    if (!invite || invite.expiresAt < Date.now()) return null;
    this.invites.delete(code); // single-use
    return { tenantId: invite.tenantId, createdBy: invite.createdBy };
  }

  async linkPatient(input: { tenantId: string; clinicianId: string; patientId: string }): Promise<void> {
    this.links.add(`${input.tenantId}:${input.clinicianId}:${input.patientId}`);
  }

  async listPatients(tenantId: string, clinicianId: string): Promise<User[]> {
    const patientIds = [...this.links]
      .filter((k) => k.startsWith(`${tenantId}:${clinicianId}:`))
      .map((k) => k.split(":")[2]!);
    return patientIds
      .map((id) => this.users.get(id))
      .filter((u): u is StoredUser => !!u)
      .map(stripPasswordHash);
  }

  async isLinked(tenantId: string, clinicianId: string, patientId: string): Promise<boolean> {
    return this.links.has(`${tenantId}:${clinicianId}:${patientId}`);
  }

  async createProgram(input: {
    tenantId: string;
    patientId: string;
    createdBy: string;
    notes: string | null;
    exercises: ProgramExercise[];
  }): Promise<Program> {
    const program: Program = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      createdBy: input.createdBy,
      notes: input.notes,
      exercises: input.exercises,
      createdAt: new Date().toISOString()
    };
    this.programs.set(program.id, program);
    this.programsByPatient.set(input.patientId, program.id); // most recent wins — "current" program
    return program;
  }

  async getCurrentProgram(tenantId: string, patientId: string): Promise<Program | null> {
    const programId = this.programsByPatient.get(patientId);
    if (!programId) return null;
    const program = this.programs.get(programId);
    return program && program.tenantId === tenantId ? program : null;
  }

  async appendEvents(input: {
    tenantId: string;
    userId: string;
    sessionId: string;
    events: Array<{ seq: number; event: SessionEvent }>;
  }): Promise<{ inserted: number; duplicates: number }> {
    let userSessions = this.sessions.get(input.userId);
    if (!userSessions) {
      userSessions = new Map();
      this.sessions.set(input.userId, userSessions);
    }
    let session = userSessions.get(input.sessionId);
    if (!session) {
      session = { sessionId: input.sessionId, events: [] };
      userSessions.set(input.sessionId, session);
    }

    const existingSeqs = new Set(session.events.map((e) => e.seq));
    let inserted = 0;
    let duplicates = 0;
    for (const item of input.events) {
      if (existingSeqs.has(item.seq)) {
        duplicates += 1;
        continue;
      }
      session.events.push(item);
      existingSeqs.add(item.seq);
      inserted += 1;
    }

    return { inserted, duplicates };
  }

  async listSessions(tenantId: string, userId: string): Promise<SessionSummary[]> {
    void tenantId; // scoping already guaranteed by userId keying in this store
    const userSessions = this.sessions.get(userId);
    if (!userSessions) return [];
    return summariseSessions([...userSessions.values()]);
  }

  async listSessionEvents(tenantId: string, userId: string, sessionId: string): Promise<SessionEvent[]> {
    void tenantId;
    const session = this.sessions.get(userId)?.get(sessionId);
    if (!session) throw new NotFoundError(`session "${sessionId}" not found`);
    return [...session.events].sort((a, b) => a.seq - b.seq).map((e) => e.event);
  }

  async getAdherence(tenantId: string, userId: string): Promise<AdherenceDay[]> {
    void tenantId;
    const userSessions = this.sessions.get(userId);
    return computeAdherence(userSessions ? [...userSessions.values()] : []);
  }

  async getBaseline(tenantId: string, userId: string): Promise<BaselineEntry[]> {
    void tenantId;
    const userSessions = this.sessions.get(userId);
    return computeBaseline(userSessions ? [...userSessions.values()] : []);
  }

  async getRomTrend(tenantId: string, userId: string): Promise<RomTrendSeries[]> {
    void tenantId;
    const userSessions = this.sessions.get(userId);
    return computeRomTrend(userSessions ? [...userSessions.values()] : []);
  }

  async getReport(
    tenantId: string,
    patientId: string,
    period: { start: string; end: string }
  ): Promise<ProgressReport> {
    const patient = await this.findUserById(tenantId, patientId);
    const userSessions = this.sessions.get(patientId);
    return computeReport(userSessions ? [...userSessions.values()] : [], {
      patientId,
      patientDisplayName: patient?.displayName ?? "Unknown patient",
      periodStart: period.start,
      periodEnd: period.end
    });
  }

  async sendMessage(input: {
    tenantId: string;
    patientId: string;
    senderId: string;
    body: string;
  }): Promise<Message> {
    const sender = this.users.get(input.senderId);
    const message: Message = {
      id: randomUUID(),
      patientId: input.patientId,
      senderId: input.senderId,
      senderDisplayName: sender?.displayName ?? "Unknown",
      senderRole: sender?.role ?? "patient",
      body: input.body,
      createdAt: new Date().toISOString()
    };
    this.messages.push({ ...message, tenantId: input.tenantId });
    return message;
  }

  async listMessages(tenantId: string, patientId: string): Promise<Message[]> {
    return this.messages
      .filter((m) => m.tenantId === tenantId && m.patientId === patientId)
      .map(({ tenantId: _tenantId, ...m }) => m)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async recordAccess(input: {
    tenantId: string;
    actorId: string;
    subjectUserId: string;
    action: string;
  }): Promise<void> {
    const actor = this.users.get(input.actorId);
    this.auditLog.push({
      id: randomUUID(),
      actorId: input.actorId,
      actorDisplayName: actor?.displayName ?? "Unknown",
      subjectUserId: input.subjectUserId,
      action: input.action,
      createdAt: new Date().toISOString()
    });
  }

  async listAccessLog(tenantId: string, subjectUserId: string): Promise<AuditEntry[]> {
    void tenantId;
    return this.auditLog
      .filter((e) => e.subjectUserId === subjectUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

function stripPasswordHash(user: StoredUser): User {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
