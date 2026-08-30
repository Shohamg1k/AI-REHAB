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

  referenceMedia: {
    type: "image",
    url: "/reference/seated-knee-extension.svg",
    instructions:
      "Sit tall in a chair with both feet flat on the floor. Straighten one knee until your leg is level, hold briefly, then lower it slowly.",
    keyPoints: [
      "Sit upright, back supported",
      "Straighten the knee fully at the top",
      "Hold for a moment at the top",
      "Lower slowly — don't let the leg drop"
    ]
  },

  setup: {
    view: "front",
    posture: "seated",
    // Joints actually scored by `criteria` — the knee angle and trunk lean.
    requiredJoints: ["right_knee", "trunk"],
    // Lower body plus torso. The trunk-stability criterion needs both
    // shoulders and hips; the knee angle needs hip -> knee -> ankle. Wrists,
    // elbows, feet and face are never measured, so they may be out of frame.
    requiredLandmarks: [
      "LEFT_SHOULDER",
      "RIGHT_SHOULDER",
      "LEFT_HIP",
      "RIGHT_HIP",
      "RIGHT_KNEE",
      "RIGHT_ANKLE"
    ],
    framingHint: "Sit side-on to the camera with your torso, right hip, knee and ankle in view. Your arms don't need to be in frame."
  },

  // The concentric phase's enter angle (120°) is deliberately well below the
  // peak-extension criterion's target (165-180°): rep *counting* should stay
  // permissive so a poorly-performed rep still gets segmented and scored
  // (and then flagged by the criterion below), rather than silently not
  // counted at all. See packages/eval/src/synth/fixtures.ts
  // "knee-extension-insufficient-rom" for the fixture that exercises this.
  phases: [
    {
      name: "concentric",
      joint: "right_knee",
      enter: { angle: 120, direction: "above" },
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
      id: "smoothness",
      label: "Controlled, steady movement",
      joint: "right_knee",
      measure: "smoothness",
      target: { min: 0.5, max: 1 },
      tolerance: { warn: 0.15, fail: 0.3 },
      weight: 1
    },
    {
      id: "phase-balance",
      label: "Lowering as slowly as lifting",
      joint: "right_knee",
      measure: "phase_balance",
      target: { min: 0.6, max: 1 },
      tolerance: { warn: 0.2, fail: 0.35 },
      weight: 1
    },
    {
      id: "peak-extension",
      label: "Peak knee extension",
      joint: "right_knee",
      measure: "peak_angle",
      target: { min: 165, max: 180 },
      tolerance: { warn: 5, fail: 15 },
      // Weighted well above the secondary criteria on purpose. Adding
      // smoothness/tempo criteria diluted this one enough that a rep with
      // badly insufficient range still scored ~68 — "pretty good" for a rep
      // that missed the point of the exercise. Liao/Vakanski hit the same
      // compression (their deliberately-incorrect reps scored 0.7-0.9); the
      // fix is to let the criterion that IS the exercise dominate.
      weight: 4
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
      id: "smoother",
      triggerCriterion: "smoothness",
      direction: "under",
      text: "Try to move at one steady speed rather than in bursts.",
      cooldownMs: 10000,
      priority: 2
    },
    {
      id: "control-the-return",
      triggerCriterion: "phase-balance",
      direction: "under",
      text: "Lower back down as slowly as you lifted — don't let it drop.",
      cooldownMs: 10000,
      priority: 2
    },
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

  // No maxAngle guard on right_knee: the joint-angle convention in
  // packages/core/src/pose/landmarkAdapter.ts measures the *interior* angle
  // between two rays, which is mathematically bounded to 0-180° (full
  // extension saturates at 180 and cannot go higher) — a maxAngle threshold
  // above 180 is unreachable, dead configuration. True hyperextension
  // (bending backward past straight) needs a signed-angle or velocity-based
  // detector this MVP doesn't build; see docs/STATUS.md.
  safety: {
    maxTrunkLean: 30,
    consecutiveFailedRepsToBlock: 5
  }
};
