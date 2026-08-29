import { z } from "zod";
import { BodyRegionSchema } from "./exercise.js";

/**
 * Rule (B6). When `inferred` is present and `selfReported` is absent,
 * `recordedSeverity` must NOT be presented to the patient or clinician as a
 * pain value. Its only permitted use is selecting which check-in question to
 * ask. B1 (inference) is out of the MVP scope entirely — this type exists so
 * B2/B5 (self-report + bookmarking, both in scope) already speak the shape
 * B1 will fill in later, without a breaking change.
 */
export const PainSignalSchema = z.object({
  t: z.number(),
  region: BodyRegionSchema,
  inferred: z
    .object({
      severity: z.number().min(0).max(1),
      confidence: z.number().min(0).max(1),
      basis: z.array(z.string())
    })
    .nullable(),
  selfReported: z
    .object({
      severity: z.number().min(1).max(5),
      repIndex: z.number().int().nonnegative().nullable()
    })
    .nullable(),
  fusion: z.enum(["self_report_only", "inferred_only", "weighted"]),
  recordedSeverity: z.number(),
  reason: z.string()
});
export type PainSignal = z.infer<typeof PainSignalSchema>;
