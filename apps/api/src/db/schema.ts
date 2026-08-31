import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for the data spine (M2). Every tenant-scoped table carries
 * `tenantId` and has a matching RLS policy in `db/rls.sql`, applied by
 * migration `0001_rls.sql` — see that file for why both layers exist.
 *
 * No table stores a landmark array or a video frame, on-device or off
 * (ADR-0002). `sessionEvents.payload` holds exactly the `SessionEvent`
 * union from `@ai-rehab/contracts` — the same derived-data-only shape the
 * fast loop already produces for IndexedDB.
 */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["patient", "clinician"] }).notNull(),
    // Patient-only; always [] for a clinician. Feeds E5 — see identity.ts's
    // doc comment on the contracts side.
    contraindicatedRegions: text("contraindicated_regions").array().notNull().default([]),
    // Patient-only consent flag; always true for a clinician. See
    // identity.ts's doc comment on the contracts side.
    dataSharingEnabled: boolean("data_sharing_enabled").notNull().default(true),
    // Patient-only; always [] for a clinician. A preference, not a
    // prescription — see identity.ts on why the two are separate.
    routine: text("routine").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    tenantIdx: index("users_tenant_idx").on(t.tenantId)
  })
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    code: text("code").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usedBy: uuid("used_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ tenantIdx: index("invite_codes_tenant_idx").on(t.tenantId) })
);

export const clinicianPatientLinks = pgTable(
  "clinician_patient_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pairUnique: uniqueIndex("clinician_patient_unique").on(t.clinicianId, t.patientId),
    tenantIdx: index("links_tenant_idx").on(t.tenantId)
  })
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    tenantIdx: index("programs_tenant_idx").on(t.tenantId),
    patientIdx: index("programs_patient_idx").on(t.patientId)
  })
);

export const programExercises = pgTable(
  "program_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id").notNull(), // references packages/exercises' catalogue id, not FK — no DB dependency on app data
    // Snapshotted from the client at creation time (see contracts'
    // program.ts doc comment) — apps/api never imports @ai-rehab/exercises.
    targetRegions: text("target_regions").array().notNull().default([]),
    intensity: text("intensity", { enum: ["none", "low", "medium", "high"] }).notNull().default("low"),
    sets: integer("sets").notNull(),
    reps: integer("reps").notNull(),
    sortOrder: integer("sort_order").notNull()
  },
  (t) => ({ programIdx: index("program_exercises_program_idx").on(t.programId) })
);

/**
 * Append-only (G1). `(user_id, session_id, seq)` is unique so a retried
 * sync batch upserts rather than duplicates — see `store/types.ts`
 * `appendEvents`. `payload` is the full `SessionEvent` as JSON; `eventType`
 * and `t` are duplicated out of it into real columns purely so common
 * queries (list by type, order by time) don't need a JSON path expression.
 */
export const sessionEvents = pgTable(
  "session_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    seq: integer("seq").notNull(),
    eventType: text("event_type").notNull(),
    t: integer("t").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    idempotencyUnique: uniqueIndex("session_events_idempotency").on(t.userId, t.sessionId, t.seq),
    tenantIdx: index("session_events_tenant_idx").on(t.tenantId),
    userSessionIdx: index("session_events_user_session_idx").on(t.userId, t.sessionId)
  })
);

/** G5 / F5 — every clinician read of a patient's data, patient-visible. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    subjectIdx: index("audit_log_subject_idx").on(t.subjectUserId),
    tenantIdx: index("audit_log_tenant_idx").on(t.tenantId)
  })
);

// Re-exported so a migration or a health check can assert RLS is actually
// enabled on every one of these without hand-maintaining a second list.
export const TENANT_SCOPED_TABLES = [
  "users",
  "invite_codes",
  "clinician_patient_links",
  "programs",
  "program_exercises",
  "session_events",
  "audit_log"
] as const;

export type TenantScopedTable = (typeof TENANT_SCOPED_TABLES)[number];

/**
 * F9 — patient/clinician messages. A thread belongs to one patient; a
 * clinician posts into it. Tenant-scoped like everything else, with its own
 * RLS policy in the migration.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    threadIdx: index("messages_thread_idx").on(t.tenantId, t.patientId, t.createdAt)
  })
);
