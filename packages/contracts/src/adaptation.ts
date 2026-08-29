import { z } from "zod";

/**
 * Logged for every decision from day one, whether or not a learned policy
 * exists yet (ADR-0004) — this is the (state, action, outcome) dataset D2
 * will eventually need. Out of MVP scope to *produce* (D1/D2 are fast-follow),
 * but SessionEvent's `adaptation_decided` variant references this shape, so
 * it is specified now.
 */
export const AdaptationDecisionSchema = z.object({
  t: z.number(),
  policy: z.enum(["rules_v1", "learned_v1"]),
  state: z.string(),
  action: z.string(),
  alternatives: z.array(
    z.object({
      action: z.string(),
      blocked: z.boolean(),
      reason: z.string()
    })
  ),
  direction: z.enum(["progress", "hold", "regress"]),
  reason: z.string()
});
export type AdaptationDecision = z.infer<typeof AdaptationDecisionSchema>;
