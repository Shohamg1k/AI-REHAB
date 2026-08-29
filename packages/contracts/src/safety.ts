import { z } from "zod";

/**
 * The most important type here. Deterministic in, deterministic out.
 *
 * Rules:
 * - core/safety must be a pure function: no I/O, no clock reads beyond the
 *   passed `t`, no randomness, no model calls.
 * - Nothing downstream may transform `block` or `escalate` into a lesser
 *   verdict.
 * - Every `ruleId` has at least one fixture in packages/eval demonstrating
 *   it firing. A new rule without a fixture does not merge (CLAUDE.md §4).
 */
export const SafetyVerdictSchema = z.object({
  t: z.number(),
  verdict: z.enum(["allow", "downgrade", "block", "escalate"]),
  ruleId: z.string(),
  reason: z.string().min(1),
  threshold: z
    .object({
      name: z.string(),
      limit: z.number(),
      observed: z.number()
    })
    .nullable(),
  downgradeTo: z.string().nullable(),
  source: z.enum(["realtime_gate", "session_supervisor"])
});
export type SafetyVerdict = z.infer<typeof SafetyVerdictSchema>;

/** Ordering used to enforce "nothing may soften a block/escalate verdict". */
export const VERDICT_SEVERITY: Record<SafetyVerdict["verdict"], number> = {
  allow: 0,
  downgrade: 1,
  block: 2,
  escalate: 3
};

/**
 * Combine two verdicts for the same frame, keeping the more severe one.
 * This is the enforcement mechanism for CLAUDE.md invariant 3 — used
 * anywhere multiple safety-relevant checks could disagree in one frame.
 */
export function mostSevere(a: SafetyVerdict, b: SafetyVerdict): SafetyVerdict {
  return VERDICT_SEVERITY[b.verdict] > VERDICT_SEVERITY[a.verdict] ? b : a;
}
