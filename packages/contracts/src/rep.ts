import { z } from "zod";
import { JOINT_NAMES } from "./pose.js";

function partialMapOf<V extends z.ZodTypeAny>(keys: readonly string[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value]))).partial();
}

export const PhaseTimingSchema = z.object({
  startMs: z.number(),
  endMs: z.number()
});

/** Produced by core/reps, consumed by form scoring, the UI, and the event log. */
export const RepEventSchema = z.object({
  t: z.number(),
  repIndex: z.number().int().nonnegative(),
  setIndex: z.number().int().nonnegative(),
  phaseTimings: z.record(z.string(), PhaseTimingSchema),
  peakAngles: partialMapOf(JOINT_NAMES, z.number()),
  endAngles: partialMapOf(JOINT_NAMES, z.number()),
  tempoMs: z.number().nonnegative(),
  meanConfidence: z.number().min(0).max(1)
});
export type RepEvent = z.infer<typeof RepEventSchema>;
