import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Sit-to-stand — the third UI-PRMD-covered exercise from docs/ROADMAP.md M1,
 * and the only weight-bearing / whole-body one of the three. Side view is
 * required (not front) so hip and knee flexion angles aren't foreshortened.
 *
 * `trunk_lean` here is read at its peak across the whole rep, which for
 * sit-to-stand lands mid-transition (the natural forward hinge used to
 * generate momentum) — the target band is deliberately generous so this
 * criterion flags an excessive lean, not the expected one. See
 * packages/core/src/reps/segmentation.ts (`RepAuxMetrics.peakTrunkLean`).
 */
export const sitToStand: ExerciseSpec = {
  id: "sit-to-stand",
  displayName: "Sit to Stand",
  rationale:
    "The single most functional movement in daily life — getting out of a chair safely and under control. Builds the leg strength most home routines miss.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["knee", "hip"],
  contraindicatedRegions: [],
  intensity: "medium",
  difficulty: 2,
  movementType: "strength",
  progression: null,
  regression: "seated-knee-extension",

  referenceMedia: {
    type: "image",
    url: "/reference/sit-to-stand.svg",
    instructions:
      "Sit toward the front of a sturdy chair, feet flat and shoulder-width apart. Lean forward slightly, push through your feet to stand fully upright, then sit back down under control.",
    keyPoints: [
      "Feet flat, roughly shoulder-width apart",
      "Lean forward slightly to start the movement",
      "Stand all the way up — hips and knees straight",
      "Sit down slowly rather than dropping"
    ]
  },

  setup: {
    view: "side",
    posture: "seated",
    // Joints actually scored by `criteria`: hip and knee extension, plus trunk lean.
    requiredJoints: ["right_hip", "right_knee", "trunk"],
    // Genuinely full-body: the movement is scored on hip and knee extension
    // together with trunk lean, so torso and the whole working leg must all
    // stay in frame. This is the exercise that legitimately needs the wide
    // shot — the other two do not.
    requiredLandmarks: [
      "LEFT_SHOULDER",
      "RIGHT_SHOULDER",
      "LEFT_HIP",
      "RIGHT_HIP",
      "RIGHT_KNEE",
      "RIGHT_ANKLE"
    ],
    framingHint: "Place the camera side-on and step back so your head, hips, knees and ankles are all in view."
  },

  // See the comment on seated-knee-extension's phases: the enter angle
  // (115°) sits well below the stand-tall target (160-185°) on purpose.
  phases: [
    {
      name: "concentric",
      joint: "right_hip",
      enter: { angle: 115, direction: "above" },
      minDurationMs: 200
    },
    {
      name: "eccentric",
      joint: "right_hip",
      enter: { angle: 110, direction: "below" },
      minDurationMs: 200
    }
  ],

  criteria: [
    {
      id: "stand-tall",
      label: "Full hip extension when standing",
      joint: "right_hip",
      measure: "peak_angle",
      target: { min: 160, max: 185 },
      tolerance: { warn: 10, fail: 20 },
      weight: 2
    },
    {
      id: "knee-extension",
      label: "Full knee extension when standing",
      joint: "right_knee",
      measure: "peak_angle",
      target: { min: 160, max: 185 },
      tolerance: { warn: 10, fail: 20 },
      weight: 2
    },
    {
      id: "tempo",
      label: "Controlled tempo",
      joint: "right_hip",
      measure: "tempo_ms",
      target: { min: 1200, max: 4000 },
      tolerance: { warn: 400, fail: 1000 },
      weight: 1
    },
    {
      id: "trunk-stability",
      label: "Not over-relying on momentum",
      joint: "trunk",
      measure: "trunk_lean",
      target: { min: 0, max: 45 },
      tolerance: { warn: 15, fail: 30 },
      weight: 1
    }
  ],

  compensations: [],

  cues: [
    {
      id: "stand-tall-cue",
      triggerCriterion: "stand-tall",
      direction: "under",
      text: "Push all the way up to standing — straighten your hips fully.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "straighten-knees",
      triggerCriterion: "knee-extension",
      direction: "under",
      text: "Straighten your knees fully at the top.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "slow-down",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Slow down — control the stand instead of launching up.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "keep-momentum",
      triggerCriterion: "tempo",
      direction: "over",
      text: "Try not to pause too long partway up.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "less-lean",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Try leaning forward a little less — use your legs more than momentum.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  // No maxAngle guard on right_knee/right_hip — see the comment on
  // seated-knee-extension's safety block. The interior-angle convention
  // saturates at 180° (full standing extension), so a ceiling above that is
  // unreachable dead configuration; trunk lean and consecutive-fail
  // tracking are the safety signals that actually fire for this exercise.
  safety: {
    maxTrunkLean: 55,
    consecutiveFailedRepsToBlock: 4
  }
};
