import type {
  CoachingCue,
  CueTemplate,
  FormCriterion,
  FormScoreBreakdownItem
} from "@ai-rehab/contracts";

/**
 * A3 — live corrective coaching. Selects at most one cue per closed rep from
 * the exercise spec's cue table: only for criteria that scored warn/fail, in
 * the matching over/under direction, respecting each cue's `cooldownMs` so
 * the coach doesn't nag, and preferring the highest `priority` when several
 * qualify. Cue *text* always comes from the spec (ADR-0001 — no model call
 * in the per-frame path); this function only picks which template fires.
 *
 * Higher `priority` fires first — documented here since CONTRACTS.md leaves
 * the sort order unstated.
 */
export type CueCooldownState = Record<string, number>; // cueId -> last-fired t

export function selectCue(
  breakdown: readonly FormScoreBreakdownItem[],
  criteria: readonly FormCriterion[],
  cues: readonly CueTemplate[],
  cooldownState: CueCooldownState,
  t: number
): { cue: CoachingCue | null; cooldownState: CueCooldownState } {
  const criterionById = new Map(criteria.map((c) => [c.id, c]));

  type Candidate = { template: CueTemplate; joint: FormCriterion["joint"] };
  const candidates: Candidate[] = [];

  for (const item of breakdown) {
    if (item.status === "ok" || Number.isNaN(item.value)) continue;
    const criterion = criterionById.get(item.criterionId);
    if (!criterion) continue;

    const direction: CueTemplate["direction"] =
      item.value > item.target.max ? "over" : item.value < item.target.min ? "under" : "over";
    if (item.value >= item.target.min && item.value <= item.target.max) continue;

    for (const template of cues) {
      if (template.triggerCriterion !== item.criterionId) continue;
      if (template.direction !== direction) continue;

      const lastFired = cooldownState[template.id];
      if (lastFired !== undefined && t - lastFired < template.cooldownMs) continue;

      candidates.push({ template, joint: criterion.joint });
    }
  }

  if (candidates.length === 0) {
    return { cue: null, cooldownState };
  }

  candidates.sort((a, b) => b.template.priority - a.template.priority);
  const winner = candidates[0]!;

  const cue: CoachingCue = {
    t,
    cueId: winner.template.id,
    text: winner.template.text,
    targetJoint: winner.joint,
    urgency: "correct",
    source: "form"
  };

  return { cue, cooldownState: { ...cooldownState, [winner.template.id]: t } };
}
