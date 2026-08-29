import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Standing shoulder abduction — one of the three UI-PRMD-covered exercises
 * suggested in docs/ROADMAP.md M1. MVP scope note: tracks the right arm
 * only, same rationale as seated-knee-extension.
 *
 * Angle convention (see packages/core/src/pose/landmarkAdapter.ts): the
 * shoulder angle is measured between the hip→shoulder and shoulder→elbow
 * rays, so it reads ~0° with the arm hanging at the side and rises toward
 * ~180° fully overhead — the standard clinical abduction-angle convention.
 */
export const standingShoulderAbduction: ExerciseSpec = {
  id: "standing-shoulder-abduction",
  displayName: "Standing Shoulder Abduction",
  rationale:
    "Rebuilds the strength and range to lift your arm out to the side — often the first target after a shoulder injury, and a range people quietly lose without noticing.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["shoulder"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 1,
  movementType: "mobility",
  progression: null,
  regression: null,

  setup: {
    view: "front",
    posture: "standing",
    requiredJoints: ["right_shoulder", "right_elbow", "right_hip"]
  },

  // See the comment on seated-knee-extension's phases: the enter angle
  // (35°) sits well below the peak-abduction target (80-110°) on purpose.
  phases: [
    {
      name: "concentric",
      joint: "right_shoulder",
      enter: { angle: 35, direction: "above" },
      minDurationMs: 200
    },
    {
      name: "eccentric",
      joint: "right_shoulder",
      enter: { angle: 30, direction: "below" },
      minDurationMs: 150
    }
  ],

  criteria: [
    {
      id: "peak-abduction",
      label: "Arm raised to shoulder height",
      joint: "right_shoulder",
      measure: "peak_angle",
      target: { min: 80, max: 110 },
      tolerance: { warn: 10, fail: 25 },
      weight: 2
    },
    {
      id: "tempo",
      label: "Controlled tempo",
      joint: "right_shoulder",
      measure: "tempo_ms",
      target: { min: 1500, max: 5000 },
      tolerance: { warn: 400, fail: 1000 },
      weight: 1
    },
    {
      id: "trunk-stability",
      label: "Staying upright",
      joint: "trunk",
      measure: "trunk_lean",
      target: { min: 0, max: 15 },
      tolerance: { warn: 8, fail: 20 },
      weight: 1
    }
  ],

  compensations: [],

  cues: [
    {
      id: "raise-higher",
      triggerCriterion: "peak-abduction",
      direction: "under",
      text: "Raise your arm a little higher, out to the side.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "dont-overshoot",
      triggerCriterion: "peak-abduction",
      direction: "over",
      text: "No need to raise past shoulder height — bring it back down a touch.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "slow-controlled",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Slow down — lift with control instead of swinging your arm.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "avoid-lean",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Keep your trunk upright — avoid leaning away as you lift.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  safety: {
    maxAngle: { right_shoulder: 170 },
    maxTrunkLean: 25,
    consecutiveFailedRepsToBlock: 4
  }
};
