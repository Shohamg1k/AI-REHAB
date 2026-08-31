import type { ExerciseSpec } from "@ai-rehab/contracts";
import { PROVISIONAL_NOTE } from "../provisional.js";

/**
 * Seated elbow flexion — the arm exercise the current joint set measures
 * most cleanly.
 *
 * The elbow is a true three-point joint (shoulder → elbow → wrist), so
 * unlike the shoulder it needs no assumption about which plane the movement
 * happens in: the angle means the same thing whichever way the patient is
 * facing. That is why this is the arm exercise here rather than, say,
 * shoulder external rotation, which rotates about the humerus and barely
 * moves any three-point angle we can compute.
 *
 * Angle convention: ~170-180° with the arm hanging straight, falling toward
 * ~40° with the hand at the shoulder. The movement is therefore measured
 * *downward*, which is why the phase directions below are inverted relative
 * to the knee and shoulder exercises.
 */
export const seatedElbowFlexion: ExerciseSpec = {
  id: "seated-elbow-flexion",
  displayName: "Seated Elbow Flexion",
  rationale:
    "Rebuilds the strength to bend your elbow against load — the movement behind lifting a kettle, a bag, or a cup, and usually the first thing to fade after an arm injury or a spell in a sling.",
  provisional: true,
  provisionalNote: PROVISIONAL_NOTE,

  targetRegions: ["elbow"],
  contraindicatedRegions: [],
  intensity: "low",
  difficulty: 1,
  movementType: "strength",
  progression: null,
  regression: null,

  referenceMedia: {
    type: "image",
    url: "/reference/seated-elbow-flexion.svg",
    instructions:
      "Sit tall with your upper arm resting against your side and your arm hanging straight down. Bend your elbow to bring your hand up toward your shoulder, then lower it slowly until the arm is straight again.",
    keyPoints: [
      "Keep your upper arm still against your side",
      "Bend until your hand is near your shoulder",
      "Lower all the way until the arm is straight",
      "Take about three seconds to lower"
    ]
  },

  setup: {
    view: "side",
    posture: "seated",
    requiredJoints: ["right_elbow", "trunk"],
    // The elbow angle needs shoulder, elbow and wrist. Hips are here only
    // because trunk lean is a scored criterion and a safety threshold —
    // without them the trunk is unmeasurable, and an unmeasurable trunk is
    // no longer silently treated as upright (see landmarkAdapter).
    requiredLandmarks: [
      "LEFT_SHOULDER",
      "RIGHT_SHOULDER",
      "RIGHT_ELBOW",
      "RIGHT_WRIST",
      "LEFT_HIP",
      "RIGHT_HIP"
    ],
    framingHint:
      "Sit side-on with your shoulder, elbow, wrist and hip in view. Your legs don't need to be in frame."
  },

  // Inverted relative to the other exercises: this angle *decreases* as the
  // rep progresses, so the concentric phase is entered by falling below a
  // threshold rather than rising above one.
  phases: [
    {
      name: "concentric",
      joint: "right_elbow",
      enter: { angle: 140, direction: "below" },
      minDurationMs: 200
    },
    {
      name: "eccentric",
      joint: "right_elbow",
      enter: { angle: 150, direction: "above" },
      minDurationMs: 150
    }
  ],

  criteria: [
    {
      id: "smoothness",
      label: "Controlled, steady movement",
      joint: "right_elbow",
      measure: "smoothness",
      target: { min: 0.5, max: 1 },
      tolerance: { warn: 0.15, fail: 0.3 },
      weight: 1
    },
    {
      id: "phase-balance",
      label: "Lowering as slowly as lifting",
      joint: "right_elbow",
      measure: "phase_balance",
      target: { min: 0.6, max: 1 },
      tolerance: { warn: 0.2, fail: 0.35 },
      weight: 1
    },
    {
      // Range travelled, not peak angle. This joint's "full" position is its
      // *smallest* angle, so a peak-angle target would be backwards, and
      // there is no min-angle measure. How far the elbow moved across the rep
      // says what we actually want to know: did it bend and straighten fully.
      id: "flexion-range",
      label: "Bending and straightening fully",
      joint: "right_elbow",
      measure: "range_of_motion",
      target: { min: 110, max: 150 },
      tolerance: { warn: 20, fail: 45 },
      weight: 4
    },
    {
      id: "tempo",
      label: "Controlled tempo",
      joint: "right_elbow",
      measure: "tempo_ms",
      target: { min: 1500, max: 5000 },
      tolerance: { warn: 400, fail: 1000 },
      weight: 1
    },
    {
      id: "trunk-stability",
      label: "Not swinging the body",
      joint: "trunk",
      measure: "trunk_lean",
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
      text: "Lower your hand as slowly as you raised it — don't let it drop.",
      cooldownMs: 10000,
      priority: 2
    },
    {
      id: "bend-further",
      triggerCriterion: "flexion-range",
      direction: "under",
      text: "Bend a little further — bring your hand closer to your shoulder, and straighten fully on the way down.",
      cooldownMs: 8000,
      priority: 2
    },
    {
      id: "slow-controlled",
      triggerCriterion: "tempo",
      direction: "under",
      text: "Slow down — bend with control instead of swinging the weight up.",
      cooldownMs: 8000,
      priority: 1
    },
    {
      id: "stop-swinging",
      triggerCriterion: "trunk-stability",
      direction: "over",
      text: "Keep your body still — let the arm do the work, not your back.",
      cooldownMs: 8000,
      priority: 3
    }
  ],

  safety: {
    // No `maxAngle` here, deliberately.
    //
    // A cap above 180° would be a rule that can never fire: joint angles are
    // three-point *interior* angles, mathematically bounded at 180°, so
    // hyperextension is not representable in this model at all (the known
    // limitation recorded in docs/STATUS.md). An unreachable threshold is
    // worse than an absent one — it implies a protection that does not
    // exist. The eval harness caught this by refusing to let a configured
    // rule go without a fixture proving it fires, and no fixture could.
    //
    // Guarding elbow hyperextension properly needs a signed or plane-aware
    // angle, which is a change to the angle model, not to this spec.
    minAngle: { right_elbow: 25 },
    maxTrunkLean: 20,
    consecutiveFailedRepsToBlock: 4
  }
};
