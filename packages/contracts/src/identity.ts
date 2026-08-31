import { z } from "zod";
import { BodyRegionSchema } from "./exercise.js";

/**
 * M2 — the data spine (G3/G4). A tenant is a clinic (or, for a
 * self-service patient with no clinician, a tenant of one — see
 * apps/api's signup flow). Every tenant-scoped table carries `tenantId`
 * and is additionally protected by Postgres RLS in the real store — see
 * apps/api/src/db/rls.sql. Application code scoping every query by
 * `tenantId` too is deliberate defense in depth, not redundancy: a bug in
 * one layer should not silently become a cross-tenant data leak.
 */
export const RoleSchema = z.enum(["patient", "clinician"]);
export type Role = z.infer<typeof RoleSchema>;

export const UserSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: RoleSchema,
  createdAt: z.string(),
  /**
   * Patient-only, self- or clinician-declared. Feeds E5's session
   * supervisor (`services/rehab-engine`) — see
   * `POST /programs`, which refuses to assign an exercise targeting one of
   * these. Always `[]` for a clinician account.
   */
  contraindicatedRegions: z.array(BodyRegionSchema),
  /**
   * Patient-only consent flag (G5's other half — the audit log tells a
   * patient who looked at their data; this controls whether a clinician
   * can look at all). Turning it off does not remove the patient from
   * their clinician's roster — joining a tenant via invite is a separate,
   * deliberate act — it blocks `GET /patients/:id/sessions` for that
   * patient until turned back on. Always `true` for a clinician account.
   */
  dataSharingEnabled: z.boolean(),
  /**
   * The exercises this patient chose for themselves, so the choice follows
   * them between devices.
   *
   * A routine is a *preference*, not a prescription: it is what a patient
   * follows when no clinician has assigned them a program, and it never
   * overrides one. Empty means "not chosen yet", which is deliberately
   * distinct from "chose nothing" — the latter is impossible, since the
   * editor requires at least one.
   *
   * Always `[]` for a clinician account.
   */
  routine: z.array(z.string())
});
export type User = z.infer<typeof UserSchema>;

export const UpdateContraindicationsRequestSchema = z.object({
  contraindicatedRegions: z.array(BodyRegionSchema)
});
export type UpdateContraindicationsRequest = z.infer<typeof UpdateContraindicationsRequestSchema>;

export const UpdateDataSharingRequestSchema = z.object({
  dataSharingEnabled: z.boolean()
});
export type UpdateDataSharingRequest = z.infer<typeof UpdateDataSharingRequestSchema>;

export const UpdateRoutineRequestSchema = z.object({
  exerciseIds: z.array(z.string().min(1))
});
export type UpdateRoutineRequest = z.infer<typeof UpdateRoutineRequestSchema>;

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string()
});
export type Tenant = z.infer<typeof TenantSchema>;

/**
 * A clinician-issued code a patient redeems at signup to join that
 * clinician's tenant instead of getting a standalone tenant-of-one.
 * Single-use, expiring — see apps/api/src/routes/invites.ts.
 */
export const InviteCodeSchema = z.object({
  code: z.string().min(1),
  tenantId: z.string(),
  createdBy: z.string(),
  expiresAt: z.string()
});
export type InviteCode = z.infer<typeof InviteCodeSchema>;

export const SignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters."),
  displayName: z.string().min(1),
  role: RoleSchema,
  /** Patients only. Omit for a standalone account; provide to join a clinician's tenant. */
  inviteCode: z.string().optional()
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Every clinician read of a patient's data writes one of these (G5/F5) —
 * the patient-visible access log. `action` is a short machine-readable tag
 * ("view_sessions", "view_program"), not free text, so the log stays
 * queryable and the UI can render it without guessing at phrasing.
 */
export const AuditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorDisplayName: z.string(),
  subjectUserId: z.string(),
  action: z.string(),
  createdAt: z.string()
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
