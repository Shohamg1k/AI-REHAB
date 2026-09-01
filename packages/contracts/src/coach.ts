import { z } from "zod";

/**
 * C1/C3 — the between-sets coaching assistant (ADR-0009).
 *
 * Runs in the slow loop only. ADR-0001 is unchanged: nothing here is called
 * per frame, and cue text still comes from the exercise spec's cue table,
 * never from a model.
 *
 * The request carries *derived* session facts, never landmarks and never
 * frames. That is both ADR-0002's surviving half and a practical matter —
 * the model reasons better about "peak knee angle 96° against a 90° cap"
 * than about a 33-point coordinate array.
 */

export const CoachSessionFactsSchema = z.object({
  exerciseName: z.string(),
  repCount: z.number().int().nonnegative(),
  scoredReps: z.number().int().nonnegative(),
  avgFormScore: z.number().nullable(),
  /** Named criteria the patient fell short on, most frequent first. */
  shortfalls: z.array(z.object({ label: z.string(), count: z.number().int().positive() })),
  /** What the patient said, on the scale they were shown. Never inferred (B6). */
  painSeverity: z.number().nullable(),
  painRegion: z.string().nullable(),
  /** Reasons the safety gate blocked or escalated. The assistant may only agree with these. */
  safetyEvents: z.array(z.string())
});
export type CoachSessionFacts = z.infer<typeof CoachSessionFactsSchema>;

export const MAX_COACH_QUESTION_LENGTH = 500;

export const CoachQuestionRequestSchema = z.object({
  question: z.string().trim().min(1, "Ask something first.").max(MAX_COACH_QUESTION_LENGTH),
  facts: CoachSessionFactsSchema
});
export type CoachQuestionRequest = z.infer<typeof CoachQuestionRequestSchema>;

export const CoachAnswerSchema = z.object({
  answer: z.string(),
  /**
   * Which model produced it. Shown to the patient: an answer from a language
   * model should not be indistinguishable from the app's own measurements.
   */
  model: z.string()
});
export type CoachAnswer = z.infer<typeof CoachAnswerSchema>;
