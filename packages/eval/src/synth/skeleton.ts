import type { Landmark } from "@ai-rehab/contracts";
import { MP } from "@ai-rehab/core";
import { add, placeAtAngle, type Vec3 } from "./vec3.js";

function lm(v: Vec3, visibility = 1): Landmark {
  return { x: v.x, y: v.y, z: v.z, visibility };
}

const THIGH = 0.45;
const SHIN = 0.45;
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const FOOT = 0.15;

/** Fills every one of the 33 MediaPipe slots so a fixture is a valid PoseFrame.world array. */
function fullSkeleton(points: Partial<Record<number, Vec3>>, visibility = 1): Landmark[] {
  const frame: Landmark[] = Array.from({ length: 33 }, () => lm({ x: 0, y: -0.6, z: 0 }, visibility));
  for (const [idx, v] of Object.entries(points)) {
    if (!v) continue;
    frame[Number(idx)] = lm(v, visibility);
  }
  return frame;
}

/**
 * Exact midpoint-shoulder placement for a given trunk lean angle, via
 * `placeAtAngle` against the same (0,-1,0) "up" reference
 * `computeJointAngles` uses — so the value read back by the real pipeline
 * matches the requested `trunkLeanDeg` exactly, not approximately.
 *
 * An earlier version of this file offset the shoulder z-coordinate by
 * `sin(trunkLeanDeg) * torsoLength` directly, which does NOT reproduce the
 * same angle once read back through `computeJointAngles` (verified by a
 * fixture — packages/eval/test/synth.test.ts — that caught it landing ~5°
 * short at trunkLeanDeg=35, enough to miss a safety threshold in
 * packages/eval/src/synth/fixtures.ts "knee-extension-safety-trunk-lean").
 */
function midShoulderAtLean(midHip: Vec3, trunkLeanDeg: number, torsoLength: number): Vec3 {
  const upReference = add(midHip, { x: 0, y: -1, z: 0 });
  return placeAtAngle(midHip, upReference, { x: 0, y: 0, z: 1 }, trunkLeanDeg, torsoLength);
}

/**
 * Seated base pose (for seated-knee-extension). Hip fixed; the exercised
 * (right) leg's knee angle is driven by `rightKneeAngleDeg` via exact
 * construction (see vec3.ts `placeAtAngle`) — 90° is a relaxed seated bend,
 * ~175-180° is fully extended out in front of the chair.
 */
export function seatedKneeExtensionPose(
  rightKneeAngleDeg: number,
  trunkLeanDeg = 2,
  visibility = 1
): Landmark[] {
  const leftHip: Vec3 = { x: -0.15, y: 0, z: 0 };
  const rightHip: Vec3 = { x: 0.15, y: 0, z: 0 };
  const midHip: Vec3 = { x: 0, y: 0, z: 0 };
  const midShoulder = midShoulderAtLean(midHip, trunkLeanDeg, 0.5);
  const leftShoulder: Vec3 = add(midShoulder, { x: -0.2, y: 0, z: 0 });
  const rightShoulder: Vec3 = add(midShoulder, { x: 0.2, y: 0, z: 0 });

  // Left leg stays at a relaxed 90° seated bend throughout (not exercised).
  const leftKnee = add(leftHip, { x: 0, y: 0, z: THIGH });
  const leftAnkle = placeAtAngle(leftKnee, leftHip, { x: 0, y: 1, z: 0 }, 90, SHIN);

  const rightKnee = add(rightHip, { x: 0, y: 0, z: THIGH });
  const rightAnkle = placeAtAngle(rightKnee, rightHip, { x: 0, y: 1, z: 0 }, rightKneeAngleDeg, SHIN);

  return fullSkeleton({
    [MP.LEFT_SHOULDER]: leftShoulder,
    [MP.RIGHT_SHOULDER]: rightShoulder,
    [MP.LEFT_HIP]: leftHip,
    [MP.RIGHT_HIP]: rightHip,
    [MP.LEFT_KNEE]: leftKnee,
    [MP.RIGHT_KNEE]: rightKnee,
    [MP.LEFT_ANKLE]: leftAnkle,
    [MP.RIGHT_ANKLE]: rightAnkle,
    [MP.LEFT_FOOT_INDEX]: add(leftAnkle, { x: 0, y: 0, z: FOOT }),
    [MP.RIGHT_FOOT_INDEX]: add(rightAnkle, { x: 0, y: 0, z: FOOT }),
    [MP.LEFT_ELBOW]: add(leftShoulder, { x: -0.05, y: UPPER_ARM, z: 0 }),
    [MP.RIGHT_ELBOW]: add(rightShoulder, { x: 0.05, y: UPPER_ARM, z: 0 }),
    [MP.LEFT_WRIST]: add(leftShoulder, { x: -0.1, y: UPPER_ARM + FOREARM, z: 0 }),
    [MP.RIGHT_WRIST]: add(rightShoulder, { x: 0.1, y: UPPER_ARM + FOREARM, z: 0 })
  }, visibility);
}

/**
 * Standing base pose (for standing-shoulder-abduction). The right arm's
 * shoulder angle is driven exactly by `rightShoulderAngleDeg` — ~0-20° is
 * the arm hanging at the side, ~90° is raised to shoulder height, per the
 * abduction-angle convention documented in
 * packages/core/src/pose/landmarkAdapter.ts.
 */
export function standingShoulderAbductionPose(
  rightShoulderAngleDeg: number,
  trunkLeanDeg = 2
): Landmark[] {
  const leftHip: Vec3 = { x: -0.15, y: 0, z: 0 };
  const rightHip: Vec3 = { x: 0.15, y: 0, z: 0 };
  const midHip: Vec3 = { x: 0, y: 0, z: 0 };
  const midShoulder = midShoulderAtLean(midHip, trunkLeanDeg, 0.5);
  const leftShoulder: Vec3 = add(midShoulder, { x: -0.2, y: 0, z: 0 });
  const rightShoulder: Vec3 = add(midShoulder, { x: 0.2, y: 0, z: 0 });

  const leftKnee = add(leftHip, { x: 0, y: THIGH, z: 0 });
  const rightKnee = add(rightHip, { x: 0, y: THIGH, z: 0 });
  const leftAnkle = add(leftKnee, { x: 0, y: SHIN, z: 0 });
  const rightAnkle = add(rightKnee, { x: 0, y: SHIN, z: 0 });

  const leftElbow = placeAtAngle(leftShoulder, leftHip, { x: -1, y: 0, z: 0 }, 10, UPPER_ARM);
  const leftWrist = add(leftElbow, { x: 0, y: FOREARM, z: 0 });

  const rightElbow = placeAtAngle(
    rightShoulder,
    rightHip,
    { x: 1, y: 0, z: 0 },
    rightShoulderAngleDeg,
    UPPER_ARM
  );
  const rightWrist = add(rightElbow, { x: 0, y: FOREARM, z: 0 });

  return fullSkeleton({
    [MP.LEFT_SHOULDER]: leftShoulder,
    [MP.RIGHT_SHOULDER]: rightShoulder,
    [MP.LEFT_HIP]: leftHip,
    [MP.RIGHT_HIP]: rightHip,
    [MP.LEFT_KNEE]: leftKnee,
    [MP.RIGHT_KNEE]: rightKnee,
    [MP.LEFT_ANKLE]: leftAnkle,
    [MP.RIGHT_ANKLE]: rightAnkle,
    [MP.LEFT_ELBOW]: leftElbow,
    [MP.RIGHT_ELBOW]: rightElbow,
    [MP.LEFT_WRIST]: leftWrist,
    [MP.RIGHT_WRIST]: rightWrist,
    [MP.LEFT_INDEX]: add(leftWrist, { x: 0, y: 0.05, z: 0 }),
    [MP.RIGHT_INDEX]: add(rightWrist, { x: 0, y: 0.05, z: 0 })
  });
}

/**
 * Sit-to-stand pose. Side view — hip and knee angles both driven by the
 * same normalised progress (0 = seated, 1 = standing) so they open up
 * together, plus a forward trunk lean that peaks mid-transition (the
 * natural momentum-generating hinge) and returns upright at both ends.
 */
export function sitToStandPose(
  progress: number,
  rightHipAngleDeg: number,
  rightKneeAngleDeg: number,
  leanAmplitudeDeg = 35
): Landmark[] {
  const rightHip: Vec3 = { x: 0, y: 0, z: 0 };
  const leftHip: Vec3 = { x: -0.05, y: 0, z: 0.02 };

  // Trunk lean peaks at progress 0.5 (mid-stand) and is ~upright at both ends.
  const midTransitionLean = Math.sin(progress * Math.PI) * leanAmplitudeDeg; // degrees, peak at progress=0.5

  const rightShoulder = placeAtAngle(
    rightHip,
    { x: rightHip.x, y: rightHip.y - 1, z: rightHip.z }, // "straight up" reference
    { x: 0, y: 0, z: -1 },
    midTransitionLean,
    0.55
  );
  const leftShoulder = add(rightShoulder, { x: -0.05, y: 0, z: 0.02 });

  const rightKnee = placeAtAngle(rightHip, rightShoulder, { x: 0, y: 0, z: 1 }, rightHipAngleDeg, THIGH);
  const leftKnee = add(rightKnee, { x: -0.05, y: 0, z: 0.02 });

  const rightAnkle = placeAtAngle(rightKnee, rightHip, { x: 0, y: 1, z: 0.3 }, rightKneeAngleDeg, SHIN);
  const leftAnkle = add(rightAnkle, { x: -0.05, y: 0, z: 0.02 });

  return fullSkeleton({
    [MP.LEFT_SHOULDER]: leftShoulder,
    [MP.RIGHT_SHOULDER]: rightShoulder,
    [MP.LEFT_HIP]: leftHip,
    [MP.RIGHT_HIP]: rightHip,
    [MP.LEFT_KNEE]: leftKnee,
    [MP.RIGHT_KNEE]: rightKnee,
    [MP.LEFT_ANKLE]: leftAnkle,
    [MP.RIGHT_ANKLE]: rightAnkle,
    [MP.LEFT_FOOT_INDEX]: add(leftAnkle, { x: 0, y: 0, z: FOOT }),
    [MP.RIGHT_FOOT_INDEX]: add(rightAnkle, { x: 0, y: 0, z: FOOT }),
    [MP.LEFT_ELBOW]: add(leftShoulder, { x: -0.05, y: UPPER_ARM, z: 0 }),
    [MP.RIGHT_ELBOW]: add(rightShoulder, { x: 0.05, y: UPPER_ARM, z: 0 }),
    [MP.LEFT_WRIST]: add(leftShoulder, { x: -0.1, y: UPPER_ARM + FOREARM, z: 0 }),
    [MP.RIGHT_WRIST]: add(rightShoulder, { x: 0.1, y: UPPER_ARM + FOREARM, z: 0 })
  });
}
