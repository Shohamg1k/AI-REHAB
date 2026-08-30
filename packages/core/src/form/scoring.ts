import type { FormCriterion, FormScore, FormScoreBreakdownItem, RepEvent } from "@ai-rehab/contracts";
import type { RepAuxMetrics } from "../reps/segmentation.js";
import { MIN_TEMPORAL_SAMPLES } from "../reps/temporal.js";

/**
 * Form scoring (A2). Weighted `FormCriterion` evaluation over one closed
 * rep, producing a 0..100 score with a per-criterion breakdown.
 *
 * Rule (docs/CONTRACTS.md): a FormScore with `confidence` below this floor
 * must never be shown as a number by the UI and must never enter a trend —
 * render "not enough signal this rep" instead (G7). This module does not
 * enforce that itself (it has no UI to enforce it in); it computes the
 * confidence honestly and the caller gates on the exported floor.
 */
export const FORM_SCORE_CONFIDENCE_FLOOR = 0.5;

function measureValue(
  criterion: FormCriterion,
  rep: RepEvent,
  aux: RepAuxMetrics
): number | undefined {
  // Temporal metrics computed from too few samples are not merely imprecise,
  // they are meaningless — returning undefined excludes the criterion from
  // the score rather than penalising the patient for a short observation.
  const unreliable = aux.temporal.sampleCount < MIN_TEMPORAL_SAMPLES;

  switch (criterion.measure) {
    case "peak_angle":
      return rep.peakAngles[criterion.joint];
    case "end_angle":
      return rep.endAngles[criterion.joint];
    case "tempo_ms":
      return rep.tempoMs;
    case "trunk_lean":
      return aux.peakTrunkLean;
    case "range_of_motion":
      return unreliable ? undefined : aux.temporal.rangeOfMotion;
    case "smoothness":
      return unreliable ? undefined : aux.temporal.smoothness;
    case "phase_balance":
      return unreliable ? undefined : aux.temporal.phaseBalance;
    case "stability":
      return unreliable ? undefined : aux.temporal.stability;
    case "symmetry": {
      // criterion.joint names a side (e.g. 'left_knee'); the symmetry map is
      // keyed by the joint *group* — strip the side prefix to look it up.
      const group = criterion.joint.replace(/^(left_|right_)/, "") as keyof RepAuxMetrics["peakSymmetry"];
      return aux.peakSymmetry[group];
    }
    default:
      return undefined;
  }
}

function statusFor(value: number, criterion: FormCriterion): "ok" | "warn" | "fail" {
  const { target, tolerance } = criterion;
  const deviation = value < target.min ? target.min - value : value > target.max ? value - target.max : 0;
  if (deviation <= tolerance.warn) return "ok";
  if (deviation <= tolerance.fail) return "warn";
  return "fail";
}

const STATUS_CREDIT: Record<"ok" | "warn" | "fail", number> = { ok: 1, warn: 0.5, fail: 0 };

export function scoreRep(
  rep: RepEvent,
  aux: RepAuxMetrics,
  criteria: readonly FormCriterion[],
  captureQualityScore: number = 1
): FormScore {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0) || 1;
  const breakdown: FormScoreBreakdownItem[] = [];
  const failedLabels: string[] = [];
  const warnLabels: string[] = [];
  let scoredCriteria = 0;

  let score = 0;
  for (const criterion of criteria) {
    const value = measureValue(criterion, rep, aux);
    const maxPoints = (criterion.weight / totalWeight) * 100;

    if (value === undefined) {
      // Joint not visible / measure unavailable this rep — excluded from
      // the score rather than penalised, and does not count toward
      // `scoredCriteria` below so confidence reflects what we could see.
      breakdown.push({
        criterionId: criterion.id,
        label: criterion.label,
        value: NaN,
        target: criterion.target,
        status: "warn",
        contribution: 0
      });
      continue;
    }

    scoredCriteria += 1;
    const status = statusFor(value, criterion);
    const contribution = Math.round(maxPoints * STATUS_CREDIT[status]);
    score += contribution;

    breakdown.push({
      criterionId: criterion.id,
      label: criterion.label,
      value,
      target: criterion.target,
      status,
      contribution
    });

    if (status === "fail") failedLabels.push(criterion.label);
    else if (status === "warn") warnLabels.push(criterion.label);
  }

  const coverage = criteria.length > 0 ? scoredCriteria / criteria.length : 0;
  const confidence = Math.max(0, Math.min(1, rep.meanConfidence * captureQualityScore * (0.5 + 0.5 * coverage)));

  let reason: string;
  if (scoredCriteria === 0) {
    reason = "No criteria could be measured this rep — required joints were not visible.";
  } else if (failedLabels.length > 0) {
    reason = `Missed target on: ${failedLabels.join(", ")}.`;
  } else if (warnLabels.length > 0) {
    reason = `Close, but check: ${warnLabels.join(", ")}.`;
  } else {
    reason = "All measured criteria within target range.";
  }

  return {
    t: rep.t,
    repIndex: rep.repIndex,
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    compensations: [], // A5 is fast-follow — no compensation detector runs in the MVP
    confidence,
    reason
  };
}

/**
 * Whether a rep counts toward the safety gate's `consecutiveFailedReps`.
 *
 * Deliberately not a score cutoff. A weighted average can sit above any
 * threshold you pick while the criterion that *is* the exercise failed
 * outright — a knee extension reaching 140° of a 165–180° target scored 52,
 * which no score-based cutoff classifies honestly. Asking "did any criterion
 * actually fail" is both truer and explainable: the reason string already
 * names which one.
 */
export function isFailedRep(score: FormScore): boolean {
  return score.breakdown.some((item) => item.status === "fail");
}
