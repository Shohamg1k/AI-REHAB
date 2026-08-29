import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Seated knee extension — one of the three exercises suggested in
 * docs/ROADMAP.md M1 and docs/STATUS.md (two of which appear in UI-PRMD).
 * MVP scope note: tracks the right leg only. A left/right toggle is a small,
 * deliberately deferred addition — see docs/STATUS.md.
 */
export const seatedKneeExtension: ExerciseSpec = {
  id: "seated-knee-extension",
  displayName: "Seated Knee Extension",
  rationale:
    "Strengthens the muscles that control your knee without putting weight through the joint — often the first exercise prescribed after a knee injury or surgery.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["knee"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 1,
  movementType: "strength",
  progression: "sit-to-stand",
  regression: null,

  setup: {
    view: "front",
    posture: "seated",
    requiredJoints: ["right_knee", "right_hip"]
  },

  phases: [
    {
      name: "concentric",
      joint: "right_knee",
      enter: { angle: 160, direction: "above" },
      minDurationMs: 200
    },
    {
      name: "eccentric",
      joint: "right_knee",
      enter: { angle: 100, direction: "below" },
      minDurationMs: 150
    }
  ],

  criteria: [
    {
      id: "peak-extension",
      label: "Peak knee extension",
      joint: "right_knee",
      measure: "peak_angle",
      target: { min: 165, max: 180 },
      tolerance: { warn: 5, fail: 15 },
      weight: 2
    },
    {
      id: "tempo",
      label: "Controlled tempo",
      joint: "right_knee",
      measure: "tempo_ms",
      target: { min: 1000, max: 4000 },
      tolerance: { warn: 300, fail: 800 },
      weight: 1
    },
    {
      id: "trunk-stability",
      label: "Sitting tall",
      joint: "trunk",
      measure: "trunk_lean",
      target: { min: 0, max: 10 },
      tolerance: { warn: 5, fail: 15 },
      weight: 1
    }
  ],

  compensations: [],

  cues: [
    {
      id: "straighten-more",
      triggerCriterion: "peak-extension",
      direction: "under",
      text: "Try to straighten your knee a bit more at the top.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "slow-down",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Slow down — control the movement instead of kicking it up.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "keep-moving",
      triggerCriterion: "tempo",
      direction: "over",
      text: "Try to keep the movement flowing without a long pause.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "sit-tall",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Sit tall — avoid leaning back to help lift your leg.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  safety: {
    maxAngle: { right_knee: 188 },
    maxTrunkLean: 30,
    consecutiveFailedRepsToBlock: 5
  }
};
