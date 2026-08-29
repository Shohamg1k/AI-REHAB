import type { JointAngles, JointName, Landmark } from "@ai-rehab/contracts";

/**
 * MediaPipe Pose landmark indices, standard 33-point topology.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const MP = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32
} as const;

/**
 * The MediaPipe → upstream `JOINT_INDEX` adapter called out in
 * docs/UPSTREAM.md §1.4 as "a discrete, testable first task". Each entry
 * names the vertex landmark and its two neighbours for a 3-point interior
 * angle — the same 12 joints upstream OpenRehabAgent's `PoseAgent` expects,
 * plus `trunk`, which is computed separately (see `trunkAngle` below) since
 * it isn't a 3-point joint angle.
 */
export const JOINT_INDEX: Record<
  Exclude<JointName, "trunk">,
  { vertex: number; a: number; b: number }
> = {
  left_shoulder: { vertex: MP.LEFT_SHOULDER, a: MP.LEFT_HIP, b: MP.LEFT_ELBOW },
  right_shoulder: { vertex: MP.RIGHT_SHOULDER, a: MP.RIGHT_HIP, b: MP.RIGHT_ELBOW },
  left_elbow: { vertex: MP.LEFT_ELBOW, a: MP.LEFT_SHOULDER, b: MP.LEFT_WRIST },
  right_elbow: { vertex: MP.RIGHT_ELBOW, a: MP.RIGHT_SHOULDER, b: MP.RIGHT_WRIST },
  left_hip: { vertex: MP.LEFT_HIP, a: MP.LEFT_SHOULDER, b: MP.LEFT_KNEE },
  right_hip: { vertex: MP.RIGHT_HIP, a: MP.RIGHT_SHOULDER, b: MP.RIGHT_KNEE },
  left_knee: { vertex: MP.LEFT_KNEE, a: MP.LEFT_HIP, b: MP.LEFT_ANKLE },
  right_knee: { vertex: MP.RIGHT_KNEE, a: MP.RIGHT_HIP, b: MP.RIGHT_ANKLE },
  left_ankle: { vertex: MP.LEFT_ANKLE, a: MP.LEFT_KNEE, b: MP.LEFT_FOOT_INDEX },
  right_ankle: { vertex: MP.RIGHT_ANKLE, a: MP.RIGHT_KNEE, b: MP.RIGHT_FOOT_INDEX },
  left_wrist: { vertex: MP.LEFT_WRIST, a: MP.LEFT_ELBOW, b: MP.LEFT_INDEX },
  right_wrist: { vertex: MP.RIGHT_WRIST, a: MP.RIGHT_ELBOW, b: MP.RIGHT_INDEX }
};

type Vec3 = { x: number; y: number; z: number };

function sub(p: Vec3, q: Vec3): Vec3 {
  return { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z };
}
function dot(p: Vec3, q: Vec3): number {
  return p.x * q.x + p.y * q.y + p.z * q.z;
}
function mag(p: Vec3): number {
  return Math.sqrt(dot(p, p));
}

/** Interior angle at `vertex` between rays to `a` and `b`, in degrees, 0..180. */
function angleAtVertex(a: Vec3, vertex: Vec3, b: Vec3): number {
  const v1 = sub(a, vertex);
  const v2 = sub(b, vertex);
  const m1 = mag(v1);
  const m2 = mag(v2);
  if (m1 === 0 || m2 === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot(v1, v2) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

const SYMMETRY_PAIRS: Array<{
  group: "shoulder" | "elbow" | "hip" | "knee";
  left: JointName;
  right: JointName;
}> = [
  { group: "shoulder", left: "left_shoulder", right: "right_shoulder" },
  { group: "elbow", left: "left_elbow", right: "right_elbow" },
  { group: "hip", left: "left_hip", right: "right_hip" },
  { group: "knee", left: "left_knee", right: "right_knee" }
];

/**
 * Derives `JointAngles` from a (smoothed) world-coordinate landmark array.
 *
 * Convention: MediaPipe world landmarks are metric, origin near the hip
 * midpoint, y increasing downward (same axis sense as image space). Trunk
 * lean is the angle between the hip→shoulder vector and straight-up
 * (0, -1, 0); 0° is upright. This convention is documented rather than
 * asserted from a live capture — validate against a real device in the M0
 * spike (see docs/adr/0007-pose-model-tier.md) before trusting the sign on
 * an unfamiliar rig.
 */
export function computeJointAngles(world: readonly Landmark[], t: number): JointAngles {
  const angles: Partial<Record<JointName, number>> = {};
  const confidence: Partial<Record<JointName, number>> = {};

  for (const [joint, idx] of Object.entries(JOINT_INDEX) as Array<
    [Exclude<JointName, "trunk">, (typeof JOINT_INDEX)[Exclude<JointName, "trunk">]]
  >) {
    const vertex = world[idx.vertex];
    const a = world[idx.a];
    const b = world[idx.b];
    if (!vertex || !a || !b) continue;

    const angle = angleAtVertex(a, vertex, b);
    if (Number.isNaN(angle)) continue;

    angles[joint] = angle;
    confidence[joint] = Math.min(vertex.visibility, a.visibility, b.visibility);
  }

  const leftShoulder = world[MP.LEFT_SHOULDER];
  const rightShoulder = world[MP.RIGHT_SHOULDER];
  const leftHip = world[MP.LEFT_HIP];
  const rightHip = world[MP.RIGHT_HIP];

  let trunkLean = 0;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const midShoulder: Vec3 = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: (leftShoulder.z + rightShoulder.z) / 2
    };
    const midHip: Vec3 = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: (leftHip.z + rightHip.z) / 2
    };
    const torso = sub(midShoulder, midHip);
    const up: Vec3 = { x: 0, y: -1, z: 0 };
    const m = mag(torso);
    if (m > 0) {
      const cos = Math.min(1, Math.max(-1, dot(torso, up) / m));
      trunkLean = (Math.acos(cos) * 180) / Math.PI;
    }
    angles.trunk = trunkLean;
    confidence.trunk = Math.min(
      leftShoulder.visibility,
      rightShoulder.visibility,
      leftHip.visibility,
      rightHip.visibility
    );
  }

  const symmetry: Partial<Record<"shoulder" | "elbow" | "hip" | "knee", number>> = {};
  for (const pair of SYMMETRY_PAIRS) {
    const l = angles[pair.left];
    const r = angles[pair.right];
    if (l !== undefined && r !== undefined) {
      symmetry[pair.group] = Math.abs(l - r);
    }
  }

  return { t, angles, confidence, symmetry, trunkLean };
}
