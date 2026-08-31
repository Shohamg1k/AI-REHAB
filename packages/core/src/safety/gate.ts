import {
  mostSevere,
  type JointAngles,
  type JointName,
  type SafetyThresholds,
  type SafetyVerdict
} from "@ai-rehab/contracts";

/**
 * E1 — the real-time safety gate. A pure function with veto (CLAUDE.md
 * invariant 3): no I/O, no clock reads beyond `t`, no randomness, no model
 * calls. `packages/core/safety` may depend on nothing outside
 * `packages/contracts` — enforced by scripts/lint-boundaries.mjs.
 *
 * Nothing downstream may soften a `block` or `escalate` verdict. This
 * module is the only place those verdicts originate for the fast loop;
 * combining multiple simultaneous rule firings always keeps the more
 * severe one via `mostSevere`.
 */

export type SafetyGateInput = {
  angles: JointAngles;
  /** Consecutive reps this session that scored below a caller-defined pass bar. */
  consecutiveFailedReps: number;
  /** Optional — E2 (fall/instability detection) is fast-follow; supported here if supplied. */
  instabilityVelocity?: number;
};

/** Verdict tiers below the hard `block` line get a graduated warning first. */
const CAUTION_RATIO = 0.9;

const ALLOW: Omit<SafetyVerdict, "t"> = {
  verdict: "allow",
  ruleId: "none",
  reason: "Within safe thresholds.",
  threshold: null,
  downgradeTo: null,
  source: "realtime_gate"
};

function angleLimitVerdicts(
  t: number,
  angles: JointAngles,
  thresholds: SafetyThresholds,
  downgradeTo: string | null
): SafetyVerdict[] {
  const verdicts: SafetyVerdict[] = [];

  const checkOne = (
    joint: JointName,
    observed: number,
    limit: number,
    kind: "max" | "min"
  ) => {
    const exceeded = kind === "max" ? observed > limit : observed < limit;
    const caution =
      kind === "max" ? observed > limit * CAUTION_RATIO : observed < limit * (2 - CAUTION_RATIO);

    if (exceeded) {
      verdicts.push({
        t,
        verdict: "block",
        ruleId: `${kind}_angle_${joint}`,
        reason: `${joint.replace(/_/g, " ")} angle (${observed.toFixed(1)}°) crossed the safe ${kind} of ${limit}°.`,
        threshold: { name: `${kind}Angle.${joint}`, limit, observed },
        downgradeTo,
        source: "realtime_gate"
      });
    } else if (caution) {
      verdicts.push({
        t,
        verdict: "downgrade",
        ruleId: `approaching_${kind}_angle_${joint}`,
        reason: `${joint.replace(/_/g, " ")} angle (${observed.toFixed(1)}°) is approaching the safe ${kind} of ${limit}°.`,
        threshold: { name: `${kind}Angle.${joint}`, limit, observed },
        downgradeTo,
        source: "realtime_gate"
      });
    }
  };

  if (thresholds.maxAngle) {
    for (const [joint, limit] of Object.entries(thresholds.maxAngle) as Array<[JointName, number]>) {
      const observed = angles.angles[joint];
      if (observed !== undefined) checkOne(joint, observed, limit, "max");
    }
  }
  if (thresholds.minAngle) {
    for (const [joint, limit] of Object.entries(thresholds.minAngle) as Array<[JointName, number]>) {
      const observed = angles.angles[joint];
      if (observed !== undefined) checkOne(joint, observed, limit, "min");
    }
  }

  return verdicts;
}

function trunkLeanVerdict(
  t: number,
  angles: JointAngles,
  thresholds: SafetyThresholds,
  downgradeTo: string | null
): SafetyVerdict | null {
  if (thresholds.maxTrunkLean === undefined) return null;
  const limit = thresholds.maxTrunkLean;
  const observed = angles.trunkLean;

  // Unmeasurable this frame. The gate cannot invent a verdict from evidence
  // it does not have, so it stays silent — but this is *not* the same as
  // "safe", and it must not be read that way. What keeps an unmeasurable
  // trunk from being scored at all is the framing contract (A7): an exercise
  // with a `maxTrunkLean` threshold declares the torso landmarks required,
  // so losing them pauses scoring upstream of here. `trunkLean` used to
  // default to 0 instead of null, which silently satisfied this comparison
  // and disabled the rule outright.
  if (observed === null) return null;

  if (observed > limit) {
    return {
      t,
      verdict: "block",
      ruleId: "max_trunk_lean",
      reason: `Trunk lean (${observed.toFixed(1)}°) crossed the safe limit of ${limit}° — likely compensating with the back.`,
      threshold: { name: "maxTrunkLean", limit, observed },
      downgradeTo,
      source: "realtime_gate"
    };
  }
  if (observed > limit * CAUTION_RATIO) {
    return {
      t,
      verdict: "downgrade",
      ruleId: "approaching_max_trunk_lean",
      reason: `Trunk lean (${observed.toFixed(1)}°) is approaching the safe limit of ${limit}°.`,
      threshold: { name: "maxTrunkLean", limit, observed },
      downgradeTo,
      source: "realtime_gate"
    };
  }
  return null;
}

function instabilityVerdict(t: number, input: SafetyGateInput, thresholds: SafetyThresholds): SafetyVerdict | null {
  if (thresholds.instabilityVelocity === undefined || input.instabilityVelocity === undefined) return null;
  if (input.instabilityVelocity <= thresholds.instabilityVelocity) return null;

  return {
    t,
    verdict: "escalate",
    ruleId: "instability_velocity",
    reason: `Movement instability (${input.instabilityVelocity.toFixed(2)}) crossed the safe limit of ${thresholds.instabilityVelocity.toFixed(2)} — possible fall risk.`,
    threshold: {
      name: "instabilityVelocity",
      limit: thresholds.instabilityVelocity,
      observed: input.instabilityVelocity
    },
    downgradeTo: null,
    source: "realtime_gate"
  };
}

function consecutiveFailedRepsVerdict(
  t: number,
  input: SafetyGateInput,
  thresholds: SafetyThresholds
): SafetyVerdict | null {
  if (input.consecutiveFailedReps < thresholds.consecutiveFailedRepsToBlock) return null;

  return {
    t,
    verdict: "escalate",
    ruleId: "consecutive_failed_reps",
    reason: `${input.consecutiveFailedReps} reps in a row missed target form — stop and check in with your clinician before continuing.`,
    threshold: {
      name: "consecutiveFailedRepsToBlock",
      limit: thresholds.consecutiveFailedRepsToBlock,
      observed: input.consecutiveFailedReps
    },
    downgradeTo: null,
    source: "realtime_gate"
  };
}

export function evaluateSafety(
  input: SafetyGateInput,
  thresholds: SafetyThresholds,
  downgradeTo: string | null,
  t: number
): SafetyVerdict {
  const candidates: SafetyVerdict[] = [
    { ...ALLOW, t },
    ...angleLimitVerdicts(t, input.angles, thresholds, downgradeTo)
  ];

  const trunk = trunkLeanVerdict(t, input.angles, thresholds, downgradeTo);
  if (trunk) candidates.push(trunk);

  const instability = instabilityVerdict(t, input, thresholds);
  if (instability) candidates.push(instability);

  const failedReps = consecutiveFailedRepsVerdict(t, input, thresholds);
  if (failedReps) candidates.push(failedReps);

  return candidates.reduce((worst, v) => mostSevere(worst, v));
}
