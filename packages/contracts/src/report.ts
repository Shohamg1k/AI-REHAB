import { z } from "zod";
import { BodyRegionSchema } from "./exercise.js";
import { AdherenceDaySchema } from "./sync.js";

/**
 * F1 — the periodic report a clinician reads about one patient.
 *
 * Computed from the event log on read, never stored. A stored report would
 * be a second source of truth that could disagree with the events it came
 * from, and there is no reason to carry that risk for something this cheap
 * to derive.
 *
 * **The patient can read the same report.** That is deliberate and matches
 * G5's posture: a patient can already see who opened their data, so they
 * should be able to see what those people actually read. A report a patient
 * is not allowed to see is a report that can say things about them they
 * cannot check.
 *
 * Framing (CLAUDE.md §6): this describes what the camera could see. It is
 * not an assessment, and every observation carries the `basis` it was drawn
 * from so no number appears as a bare claim (invariant 4).
 */

export const ReportPainEntrySchema = z.object({
  at: z.string(),
  region: BodyRegionSchema.nullable(),
  /** What the patient said, on the 1–5 scale they were shown. Never inferred. */
  severity: z.number()
});
export type ReportPainEntry = z.infer<typeof ReportPainEntrySchema>;

export const ReportSafetyEventSchema = z.object({
  at: z.string(),
  verdict: z.enum(["block", "escalate"]),
  reason: z.string()
});
export type ReportSafetyEvent = z.infer<typeof ReportSafetyEventSchema>;

export const ReportObservationSchema = z.object({
  text: z.string(),
  /** Where the statement came from, so nothing reads as an unsourced judgement. */
  basis: z.string()
});
export type ReportObservation = z.infer<typeof ReportObservationSchema>;

export const ProgressReportSchema = z.object({
  patientId: z.string(),
  patientDisplayName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),

  sessionCount: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  totalReps: z.number().int().nonnegative(),
  /** Reps that cleared the confidence floor. The rest are excluded from scoring, not counted as failures. */
  scoredReps: z.number().int().nonnegative(),
  avgFormScore: z.number().nullable(),

  exercisesPerformed: z.array(z.string()),
  adherence: z.array(AdherenceDaySchema),
  pain: z.array(ReportPainEntrySchema),
  safetyEvents: z.array(ReportSafetyEventSchema),
  observations: z.array(ReportObservationSchema)
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;
