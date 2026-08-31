import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Standing shoulder flexion — raising the arm forward, rather than out to
 * the side as in `standing-shoulder-abduction`.
 *
 * **A limitation to be honest about.** The shoulder angle is computed from
 * hip → shoulder → elbow, which grows the same whether the arm travels
 * forward or sideways. This spec and the abduction spec therefore read the
 * *same number* for two clinically different movements. What separates them
 * here is the camera view: abduction is coached from the front, flexion from
 * the side, so the patient framing themselves correctly is doing most of the
 * work of telling the two apart. The angle is not policing the plane.
 *
 * Distinguishing them properly needs a plane-aware measurement (projecting
 * the arm vector onto the body's sagittal and frontal planes), which is a
 * change to the angle model rather than to a spec. Recorded in
 * docs/STATUS.md as the next real accuracy improvement for the upper body.
 */
export const standingShoulderFlexion: ExerciseSpec = {
  id: "standing-shoulder-flexion",
  displayName: "Standing Shoulder Flexion",
  rationale:
    "Rebuilds the range to lift your arm forward and overhead — reaching a shelf, putting on a coat, or lifting something onto a table.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["shoulder"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 2,
  movementType: "mobility",
  progression: null,
  regression: null,

  referenceMedia: {
    type: "image",
    url: "/reference/standing-shoulder-flexion.svg",
    instructions:
      "Stand side-on to the camera with your arm hanging at your side. Raise it straight forward and up to about shoulder height, keeping the elbow straight, then lower it slowly.",
    keyPoints: [
      "Stand side-on so the camera sees the arm travel forward",
      "Raise forward, not out to the side",
      "Keep the elbow straight throughout",
      "Lower slowly — about three seconds"
    ]
  },

  setup: {
    view: "side",
    posture: "standing",
    requiredJoints: ["right_shoulder", "right_elbow", "trunk"],
    // `right_elbow` is measured here, unlike in abduction: a bent elbow is
    // the usual way people cheat a forward raise, so it is scored rather
    // than left to a cue nobody can verify.
    requiredLandmarks: [
      "LEFT_SHOULDER",
      "RIGHT_SHOULDER",
      "RIGHT_ELBOW",
      "RIGHT_WRIST",
      "LEFT_HIP",
      "RIGHT_HIP"
    ],
    framingHint:
      "Stand side-on with your shoulder, arm and hip in view. Your legs don't need to be in frame."
  },

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
      id: "smoothness",
      label: "Controlled, steady movement",
      joint: "right_shoulder",
      measure: "smoothness",
      target: { min: 0.5, max: 1 },
      tolerance: { warn: 0.15, fail: 0.3 },
      weight: 1
    },
    {
      id: "phase-balance",
      label: "Lowering as slowly as lifting",
      joint: "right_shoulder",
      measure: "phase_balance",
      target: { min: 0.6, max: 1 },
      tolerance: { warn: 0.2, fail: 0.35 },
      weight: 1
    },
    {
      id: "peak-flexion",
      label: "Arm raised to shoulder height",
      joint: "right_shoulder",
      measure: "peak_angle",
      target: { min: 85, max: 115 },
      tolerance: { warn: 10, fail: 25 },
      weight: 4
    },
    {
      // The compensation this exercise actually invites: bending the elbow
      // to shorten the lever and make the raise easier.
      id: "straight-elbow",
      label: "Keeping the elbow straight",
      joint: "right_elbow",
      measure: "peak_angle",
      target: { min: 155, max: 185 },
      tolerance: { warn: 15, fail: 35 },
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
      label: "Not leaning back",
      joint: "trunk",
      measure: "trunk_lean",
      // Tighter than abduction: leaning back to swing the arm up is the
      // classic way to fake a forward raise.
      target: { min: 0, max: 12 },
      tolerance: { warn: 6, fail: 15 },
      weight: 2
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
      text: "Lower your arm as slowly as you raised it — don't let it drop.",
      cooldownMs: 10000,
      priority: 2
    },
    {
      id: "raise-higher",
      triggerCriterion: "peak-flexion",
      direction: "under",
      text: "Raise your arm a little higher, straight out in front of you.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "dont-overshoot",
      triggerCriterion: "peak-flexion",
      direction: "over",
      text: "No need to go past shoulder height — bring it back down a touch.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "straighten-elbow",
      triggerCriterion: "straight-elbow",
      direction: "under",
      text: "Keep your elbow straight as you lift — don't let the arm fold.",
      cooldownMs: 9000,
      priority: 3
    },
    {
      id: "slow-controlled",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Slow down — lift with control instead of swinging your arm up.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "dont-lean-back",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Stay upright — don't lean back to help the arm up.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  safety: {
    maxAngle: { right_shoulder: 170 },
    maxTrunkLean: 22,
    consecutiveFailedRepsToBlock: 4
  }
};
