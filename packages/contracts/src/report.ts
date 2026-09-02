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
  severity: z.number(),
  /**
   * What they were doing when they said it. Null when pain was reported
   * outside an exercise. "Knee pain" is a symptom; "knee pain on rep 6 of
   * sit-to-stand" is something a clinician can change the prescription over.
   */
  exerciseId: z.string().nullable(),
  repIndex: z.number().int().nonnegative().nullable()
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
  basis: z.string(),
  /**
   * The exercise this is about, carried as an id rather than spelled into
   * `text`. `apps/api` may only depend on `@ai-rehab/contracts`
   * (docs/ARCHITECTURE.md §3), so it cannot resolve a display name — and
   * "seated-knee-extension: ..." is not what a clinician should be reading.
   * The UI joins the two.
   */
  exerciseId: z.string().nullable()
});
export type ReportObservation = z.infer<typeof ReportObservationSchema>;

/**
 * How one scoring criterion behaved across a period — the part of the report
 * a clinician can actually act on.
 *
 * "Average form 62" says something is wrong. "Peak knee angle averaged 118°
 * against a 135° target, short on 14 of 18 reps" says *what* is wrong, by how
 * much, and how consistently — which is the difference between a number and a
 * finding. All of it already existed per rep in `FormScore.breakdown`; the
 * report used to average it away.
 *
 * Units differ per criterion (degrees, milliseconds, ratios), so this reports
 * `avgValue` against `target` rather than inventing a unit-bearing phrase.
 */
export const ReportCriterionSummarySchema = z.object({
  criterionId: z.string(),
  /** Human label as scored, carried from the event rather than re-derived. */
  label: z.string(),
  /** Scored reps in which this criterion was evaluated. */
  reps: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  warned: z.number().int().nonnegative(),
  avgValue: z.number(),
  target: z.object({ min: z.number(), max: z.number() }),
  /**
   * Mean distance outside the target band, over the reps that missed it.
   * Zero when nothing missed. Same units as `avgValue`.
   */
  avgMissBy: z.number()
});
export type ReportCriterionSummary = z.infer<typeof ReportCriterionSummarySchema>;

/** An observed compensation pattern (e.g. using the back instead of the leg). */
export const ReportCompensationSummarySchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  occurrences: z.number().int().nonnegative(),
  avgSeverity: z.number()
});
export type ReportCompensationSummary = z.infer<typeof ReportCompensationSummarySchema>;

/**
 * Range of motion at the start and end of the period, per joint.
 *
 * The single most requested thing in rehab review — "is the range coming
 * back?" — and derivable from `RepEvent.peakAngles`, which has been recorded
 * since G1. Compares the best rep of the first session to the best rep of the
 * last, because a patient's peak is what the exercise is training.
 */
export const ReportRomChangeSchema = z.object({
  joint: z.string(),
  firstPeak: z.number(),
  lastPeak: z.number(),
  changeDeg: z.number(),
  /** Sessions the comparison spans. One session means no comparison is possible. */
  sessions: z.number().int().nonnegative()
});
export type ReportRomChange = z.infer<typeof ReportRomChangeSchema>;

export const ReportExerciseSummarySchema = z.object({
  exerciseId: z.string(),
  sessions: z.number().int().nonnegative(),
  totalReps: z.number().int().nonnegative(),
  scoredReps: z.number().int().nonnegative(),
  avgFormScore: z.number().nullable(),
  /**
   * Reps completed against reps prescribed for the sets actually started.
   * Null when nothing was prescribed. Below 1 means sets are being abandoned
   * part-way, which is a different problem from doing them badly.
   */
  completionRate: z.number().nullable(),
  /** Worst first: highest failure rate, then largest miss. */
  criteria: z.array(ReportCriterionSummarySchema),
  compensations: z.array(ReportCompensationSummarySchema),
  romChange: z.array(ReportRomChangeSchema)
});
export type ReportExerciseSummary = z.infer<typeof ReportExerciseSummarySchema>;

/** Average form score per session, oldest first — the "is it improving" line. */
export const ReportTrendPointSchema = z.object({
  at: z.string(),
  avgFormScore: z.number(),
  scoredReps: z.number().int().nonnegative()
});
export type ReportTrendPoint = z.infer<typeof ReportTrendPointSchema>;

/**
 * How far to trust everything above.
 *
 * A report that presents scores without saying how much of the movement was
 * actually visible invites a clinician to read confidence into it that the
 * data does not support (G7).
 */
export const ReportDataQualitySchema = z.object({
  scoredRatio: z.number(),
  unscoredReps: z.number().int().nonnegative(),
  meanConfidence: z.number().nullable()
});
export type ReportDataQuality = z.infer<typeof ReportDataQualitySchema>;

export const ProgressReportSchema = z.object({
  patientId: z.string(),
  patientDisplayName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  /**
   * The calendar day this report covers, `YYYY-MM-DD`, for a daily report;
   * null for a multi-day window.
   *
   * Carried explicitly rather than derived from `periodStart`, because for a
   * patient east of UTC a local day *begins* on the previous UTC date —
   * slicing the instant would label 2 September as 1 September.
   */
  periodDate: z.string().nullable(),
  /**
   * The IANA zone the period was bucketed in. Days are the patient's local
   * days, not UTC days; this says whose. Present so a reader can tell which
   * clock the report is speaking in, and so the UI renders times in the same
   * one the days were counted in.
   */
  timeZone: z.string(),
  /**
   * The most recent session in the period, or null when there were none.
   *
   * A daily report is recomputed from the event log on every read, so it
   * always already includes whatever the patient did most recently — there is
   * no "regenerate" step. This is what lets the UI say *when* the day's report
   * last changed, which is the only part of that a reader can't infer.
   */
  lastActivityAt: z.string().nullable(),

  sessionCount: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  totalReps: z.number().int().nonnegative(),
  /** Reps that cleared the confidence floor. The rest are excluded from scoring, not counted as failures. */
  scoredReps: z.number().int().nonnegative(),
  avgFormScore: z.number().nullable(),

  exercisesPerformed: z.array(z.string()),
  /** Per-exercise depth. Empty when nothing was performed. */
  perExercise: z.array(ReportExerciseSummarySchema),
  formTrend: z.array(ReportTrendPointSchema),
  dataQuality: ReportDataQualitySchema,
  adherence: z.array(AdherenceDaySchema),
  pain: z.array(ReportPainEntrySchema),
  safetyEvents: z.array(ReportSafetyEventSchema),
  observations: z.array(ReportObservationSchema)
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;
