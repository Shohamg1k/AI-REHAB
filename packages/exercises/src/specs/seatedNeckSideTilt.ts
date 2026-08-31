import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Seated neck side tilt — ear toward shoulder, then back to centre.
 *
 * Uses the `neck` joint: the 3D angle between the head vector
 * (mid-shoulder → nose) and the torso vector (mid-hip → mid-shoulder). Two
 * consequences shape this spec, and neither is a detail:
 *
 * 1. **It is a magnitude, not a direction.** A head tilted 25° sideways and
 *    a head poked 25° forward read identically. The setup, cues and framing
 *    therefore carry the burden of keeping the movement in the right plane —
 *    the angle cannot police it. A patient who pokes their chin forward will
 *    be scored as though they tilted, which is a real limitation and the
 *    main thing a physiotherapist should look at first.
 * 2. **It is measured against the torso, not against vertical**, so a
 *    patient slumped forward is not credited with a permanent head tilt.
 *
 * Neck *rotation* (turning to look over the shoulder) is deliberately not
 * offered. It is yaw about the head's own axis, which barely moves this
 * angle at all, and inferring it from ear/nose landmark asymmetry is not
 * reliable enough to score someone's neck on.
 */
export const seatedNeckSideTilt: ExerciseSpec = {
  id: "seated-neck-side-tilt",
  displayName: "Seated Neck Side Tilt",
  rationale:
    "Restores the sideways neck movement that stiffens first after a strain or a long spell at a desk — the range you need to check a blind spot or tuck a phone against your shoulder.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["neck"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 1,
  movementType: "mobility",
  progression: null,
  regression: null,

  referenceMedia: {
    type: "image",
    url: "/reference/seated-neck-side-tilt.svg",
    instructions:
      "Sit tall facing the camera with your shoulders relaxed and level. Tilt your head slowly so your ear travels toward your shoulder — without lifting the shoulder to meet it — then return to centre.",
    keyPoints: [
      "Face the camera and sit tall",
      "Take your ear toward your shoulder, not your shoulder toward your ear",
      "Keep your chin level — don't let it poke forward",
      "Return all the way to centre between tilts"
    ]
  },

  setup: {
    view: "front",
    posture: "seated",
    requiredJoints: ["neck", "trunk"],
    // The neck angle is built from the nose and both shoulder/hip midpoints,
    // so all five are genuinely required — this is not a whole-body demand,
    // it is exactly the landmarks the measurement consumes.
    requiredLandmarks: ["NOSE", "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"],
    framingHint:
      "Sit facing the camera with your head, both shoulders and your hips in view. Your arms and legs don't need to be in frame."
  },

  // Gentle thresholds: neck range is small, and entering a phase at 12°
  // keeps an ordinary head wobble from registering as the start of a rep.
  phases: [
    {
      name: "concentric",
      joint: "neck",
      enter: { angle: 12, direction: "above" },
      minDurationMs: 250
    },
    {
      name: "eccentric",
      joint: "neck",
      enter: { angle: 8, direction: "below" },
      minDurationMs: 250
    }
  ],

  criteria: [
    {
      id: "smoothness",
      label: "Slow, steady movement",
      joint: "neck",
      measure: "smoothness",
      target: { min: 0.6, max: 1 },
      tolerance: { warn: 0.15, fail: 0.3 },
      // Weighted above the other exercises' smoothness: a jerky neck
      // movement is the one thing most likely to hurt someone here.
      weight: 3
    },
    {
      id: "peak-tilt",
      label: "Tilting far enough",
      joint: "neck",
      measure: "peak_angle",
      // Deliberately modest. Normal cervical lateral flexion runs to about
      // 45°, but this is a rehab range for a stiff or painful neck, not a
      // flexibility test, and the upper bound exists to stop people forcing it.
      target: { min: 20, max: 35 },
      tolerance: { warn: 8, fail: 15 },
      weight: 3
    },
    {
      id: "return-to-centre",
      label: "Returning to centre",
      joint: "neck",
      measure: "end_angle",
      target: { min: 0, max: 10 },
      tolerance: { warn: 5, fail: 12 },
      weight: 2
    },
    {
      id: "tempo",
      label: "Unhurried tempo",
      joint: "neck",
      measure: "tempo_ms",
      target: { min: 2500, max: 7000 },
      tolerance: { warn: 700, fail: 1500 },
      weight: 2
    },
    {
      id: "trunk-stability",
      label: "Sitting still",
      joint: "trunk",
      measure: "trunk_lean",
      target: { min: 0, max: 10 },
      tolerance: { warn: 5, fail: 12 },
      weight: 2
    }
  ],

  compensations: [],

  cues: [
    {
      id: "slower",
      triggerCriterion: "smoothness",
      direction: "under",
      text: "Slow the movement down — smooth and steady, never forced.",
      cooldownMs: 9000,
      priority: 3
    },
    {
      id: "tilt-further",
      triggerCriterion: "peak-tilt",
      direction: "under",
      text: "Take your ear a little closer to your shoulder, only as far as is comfortable.",
      cooldownMs: 9000,
      priority: 2
    },
    {
      id: "dont-force",
      triggerCriterion: "peak-tilt",
      direction: "over",
      text: "That's far enough — ease back a little. This should never be forced.",
      cooldownMs: 8000,
      priority: 4
    },
    {
      id: "back-to-centre",
      triggerCriterion: "return-to-centre",
      direction: "over",
      text: "Bring your head all the way back to centre before the next tilt.",
      cooldownMs: 9000,
      priority: 2
    },
    {
      id: "unhurried",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Take your time — there's no benefit to moving quickly here.",
      cooldownMs: 9000,
      priority: 2
    },
    {
      id: "sit-still",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Keep your body upright and still — move only your head.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  safety: {
    // Tighter than any other exercise here, deliberately. The neck is the
    // one joint in this catalogue where forcing range has consequences worth
    // stopping a set over, and 45° is at the edge of normal lateral flexion
    // for a healthy neck — well past where a rehab patient should be going.
    maxAngle: { neck: 45 },
    maxTrunkLean: 18,
    consecutiveFailedRepsToBlock: 3
  }
};
