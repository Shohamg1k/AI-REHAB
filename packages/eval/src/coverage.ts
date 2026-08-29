import type { ExerciseSpec, JointName } from "@ai-rehab/contracts";

/**
 * The block/escalate-tier safety ruleIds a spec's thresholds imply, derived
 * the same way packages/core/src/safety/gate.ts constructs them. Used to
 * mechanically enforce CLAUDE.md §4: "a new [safety] rule without a fixture
 * does not merge" — see `checkSafetyRuleCoverage` below and bin/replay.ts.
 * Downgrade-tier "approaching_*" caution rules are intentionally excluded:
 * those already have direct unit coverage in
 * packages/core/test/safety.test.ts, and the veto-tier (block/escalate)
 * rules are the ones the invariant is actually about.
 */
export function expectedVetoRuleIds(spec: ExerciseSpec): string[] {
  const ids: string[] = [];
  for (const joint of Object.keys(spec.safety.maxAngle ?? {}) as JointName[]) {
    ids.push(`max_angle_${joint}`);
  }
  for (const joint of Object.keys(spec.safety.minAngle ?? {}) as JointName[]) {
    ids.push(`min_angle_${joint}`);
  }
  if (spec.safety.maxTrunkLean !== undefined) ids.push("max_trunk_lean");
  if (spec.safety.instabilityVelocity !== undefined) ids.push("instability_velocity");
  ids.push("consecutive_failed_reps"); // required field — always configured
  return ids;
}

/**
 * Coverage is checked on the ruleId as a rule *identity*, not per-exercise:
 * `evaluateSafety` is one shared pure function, so a fixture proving
 * "max_trunk_lean" fires for one exercise proves the same code path for
 * every exercise that configures `maxTrunkLean` — a per-exercise duplicate
 * would just re-test the same branch with a different threshold number.
 */
export function checkSafetyRuleCoverage(
  specs: readonly ExerciseSpec[],
  firedRuleIds: ReadonlySet<string>
): { covered: string[]; missing: string[] } {
  const expected = new Set(specs.flatMap((spec) => expectedVetoRuleIds(spec)));
  const covered = [...expected].filter((id) => firedRuleIds.has(id));
  const missing = [...expected].filter((id) => !firedRuleIds.has(id));
  return { covered, missing };
}
