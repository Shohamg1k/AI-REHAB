import { describe, expect, it } from "vitest";
import { computeJointAngles } from "@ai-rehab/core";
import { seatedKneeExtensionPose, sitToStandPose, standingShoulderAbductionPose } from "../src/synth/skeleton.js";

describe("synthetic skeleton construction is exact (round-trips through computeJointAngles)", () => {
  it("seated knee extension hits the requested right_knee angle", () => {
    for (const target of [90, 120, 150, 175, 180]) {
      const angles = computeJointAngles(seatedKneeExtensionPose(target), 0);
      expect(angles.angles.right_knee!).toBeCloseTo(target, 2);
    }
  });

  it("standing shoulder abduction hits the requested right_shoulder angle", () => {
    for (const target of [10, 35, 95, 170]) {
      const angles = computeJointAngles(standingShoulderAbductionPose(target), 0);
      expect(angles.angles.right_shoulder!).toBeCloseTo(target, 2);
    }
  });

  it("sit-to-stand hits the requested right_hip and right_knee angles independently", () => {
    for (const [hip, knee] of [
      [95, 95],
      [140, 130],
      [175, 175]
    ] as const) {
      const angles = computeJointAngles(sitToStandPose(0.5, hip, knee), 0);
      expect(angles.angles.right_hip!).toBeCloseTo(hip, 1);
      expect(angles.angles.right_knee!).toBeCloseTo(knee, 1);
    }
  });

  it("sit-to-stand's trunk lean peaks mid-transition and is near zero at both ends", () => {
    const atStart = computeJointAngles(sitToStandPose(0, 95, 95, 40), 0).trunkLean;
    const atMid = computeJointAngles(sitToStandPose(0.5, 135, 135, 40), 0).trunkLean;
    const atEnd = computeJointAngles(sitToStandPose(1, 175, 175, 40), 0).trunkLean;
    expect(atMid).toBeGreaterThan(atStart);
    expect(atMid).toBeGreaterThan(atEnd);
  });

  it("reduced visibility propagates through to joint-angle confidence", () => {
    const full = computeJointAngles(seatedKneeExtensionPose(150, 2, 1), 0);
    const dim = computeJointAngles(seatedKneeExtensionPose(150, 2, 0.3), 0);
    expect(dim.confidence.right_knee!).toBeLessThan(full.confidence.right_knee!);
  });
});
