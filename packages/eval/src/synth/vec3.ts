export type Vec3 = { x: number; y: number; z: number };

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const mag = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => {
  const m = mag(a);
  return m === 0 ? a : scale(a, 1 / m);
};

/**
 * Places a point at exact `targetAngleDeg` from `vertex`, measured against
 * the ray toward `fixedNeighbor`, rotating within the plane spanned by that
 * ray and `planeHint` (Gram-Schmidt orthogonalised against it, so the hint
 * only needs to be roughly in the right plane).
 *
 * This is exact construction, not inverse kinematics — it exists so eval
 * fixtures can demand a precise ground-truth angle (e.g. "this frame's knee
 * angle is exactly 172°") without hand-tuning landmark coordinates by trial
 * and error. Verified algebraically in packages/eval/test/synth.test.ts
 * against `computeJointAngles` from packages/core.
 */
export function placeAtAngle(
  vertex: Vec3,
  fixedNeighbor: Vec3,
  planeHint: Vec3,
  targetAngleDeg: number,
  length: number
): Vec3 {
  const u = normalize(sub(fixedNeighbor, vertex));
  const hintRaw = sub(planeHint, vertex);
  const wUnnormalised = sub(hintRaw, scale(u, dot(hintRaw, u))); // project out the u component
  const w = normalize(wUnnormalised);

  const rad = (targetAngleDeg * Math.PI) / 180;
  const dir = normalize(add(scale(u, Math.cos(rad)), scale(w, Math.sin(rad))));
  return add(vertex, scale(dir, length));
}

/** Deterministic PRNG (mulberry32) so fixtures are reproducible across CI runs. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep — an easing curve so synthetic reps accelerate/decelerate like a real movement. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
