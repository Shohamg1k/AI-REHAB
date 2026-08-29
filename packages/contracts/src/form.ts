import { z } from "zod";

export const FormScoreBreakdownItemSchema = z.object({
  criterionId: z.string(),
  label: z.string(),
  value: z.number(),
  target: z.object({ min: z.number(), max: z.number() }),
  status: z.enum(["ok", "warn", "fail"]),
  contribution: z.number()
});

export const FormScoreCompensationSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  severity: z.number().min(0).max(1)
});

/**
 * Rule: a FormScore with `confidence` below the configured floor is never
 * shown as a number and never enters a trend. Render "not enough signal
 * this rep" instead, and mark it in reports (G7).
 */
export const FormScoreSchema = z.object({
  t: z.number(),
  repIndex: z.number().int().nonnegative(),
  score: z.number().min(0).max(100),
  breakdown: z.array(FormScoreBreakdownItemSchema),
  compensations: z.array(FormScoreCompensationSchema),
  confidence: z.number().min(0).max(1),
  reason: z.string()
});
export type FormScore = z.infer<typeof FormScoreSchema>;
export type FormScoreBreakdownItem = z.infer<typeof FormScoreBreakdownItemSchema>;
