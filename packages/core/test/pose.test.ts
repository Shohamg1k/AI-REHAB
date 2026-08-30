import { describe, expect, it } from "vitest";
import type { Landmark } from "@ai-rehab/contracts";
import {
  OneEuroFilter,
  LandmarkSmoother,
  computeJointAngles,
  MP
} from "../src/index.js";

function lm(x: number, y: number, z = 0, visibility = 1): Landmark {
  return { x, y, z, visibility };
}

/** A rough standing-upright pose: shoulders above hips above knees above ankles. */
function standingWorld(kneeBend = 0): Landmark[] {
  // Fill every slot as visible-and-in-frame first (a real MediaPipe frame
  // reports all 33 points, including face/hand landmarks this product
  // doesn't use for angles but that still count toward "is the person in
  // frame"), then overwrite the dozen this test actually cares about.
  const world: Landmark[] = Array.from({ length: 33 }, () => lm(0, -0.2, 0, 1));
  world[MP.LEFT_SHOULDER] = lm(-0.2, -0.5, 0);
  world[MP.RIGHT_SHOULDER] = lm(0.2, -0.5, 0);
  world[MP.LEFT_HIP] = lm(-0.15, 0, 0);
  world[MP.RIGHT_HIP] = lm(0.15, 0, 0);
  // knee offset forward (z) to bend the knee angle away from 180°
  world[MP.LEFT_KNEE] = lm(-0.15, 0.45, kneeBend);
  world[MP.RIGHT_KNEE] = lm(0.15, 0.45, kneeBend);
  world[MP.LEFT_ANKLE] = lm(-0.15, 0.9, 0);
  world[MP.RIGHT_ANKLE] = lm(0.15, 0.9, 0);
  world[MP.LEFT_ELBOW] = lm(-0.35, -0.3, 0);
  world[MP.RIGHT_ELBOW] = lm(0.35, -0.3, 0);
  world[MP.LEFT_WRIST] = lm(-0.4, -0.1, 0);
  world[MP.RIGHT_WRIST] = lm(0.4, -0.1, 0);
  return world;
}

describe("OneEuroFilter", () => {
  it("passes the first sample through unchanged", () => {
    const f = new OneEuroFilter();
    expect(f.filter(5, 0)).toBe(5);
  });

  it("smooths a noisy step toward the new value rather than jumping instantly", () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    const smoothed = f.filter(10, 16);
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(10);
  });
});

describe("LandmarkSmoother", () => {
  it("smooths every landmark and preserves visibility unsmoothed", () => {
    const smoother = new LandmarkSmoother();
    const frame1 = Array.from({ length: 33 }, () => lm(0, 0, 0, 0.8));
    const frame2 = Array.from({ length: 33 }, () => lm(1, 1, 1, 0.9));
    smoother.smooth(frame1, 0);
    const out = smoother.smooth(frame2, 16);
    expect(out).toHaveLength(33);
    expect(out[0]!.x).toBeGreaterThan(0);
    expect(out[0]!.x).toBeLessThan(1);
    expect(out[0]!.visibility).toBe(0.9);
  });
});

describe("computeJointAngles", () => {
  it("reads ~180° knees when standing straight", () => {
    const angles = computeJointAngles(standingWorld(0), 0);
    expect(angles.angles.left_knee).toBeGreaterThan(170);
    expect(angles.angles.right_knee).toBeGreaterThan(170);
  });

  it("reads a smaller knee angle once bent", () => {
    const straight = computeJointAngles(standingWorld(0), 0);
    const bent = computeJointAngles(standingWorld(0.3), 0);
    expect(bent.angles.left_knee!).toBeLessThan(straight.angles.left_knee!);
  });

  it("reports ~0° trunk lean when upright", () => {
    const angles = computeJointAngles(standingWorld(0), 0);
    expect(angles.trunkLean).toBeLessThan(5);
  });

  it("computes symmetry as 0 for a mirrored pose", () => {
    const angles = computeJointAngles(standingWorld(0), 0);
    expect(angles.symmetry.knee).toBeCloseTo(0, 1);
  });

  it("omits a joint whose landmarks are missing rather than throwing", () => {
    const world = standingWorld(0);
    // @ts-expect-error — simulate a dropped landmark
    world[MP.LEFT_KNEE] = undefined;
    const angles = computeJointAngles(world, 0);
    expect(angles.angles.left_knee).toBeUndefined();
    expect(angles.angles.right_knee).toBeDefined();
  });
});
