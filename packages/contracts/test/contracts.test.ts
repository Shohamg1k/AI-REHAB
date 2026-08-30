import { describe, expect, it } from "vitest";
import {
  CaptureQualitySchema,
  ExerciseSpecSchema,
  JOINT_NAMES,
  JointAnglesSchema,
  PoseFrameSchema,
  SafetyVerdictSchema,
  SessionEventSchema,
  mostSevere,
  type SafetyVerdict
} from "../src/index.js";

const landmark = { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 };
const captureQuality = {
  score: 0.9,
  framing: "ok" as const,
  lighting: "ok" as const,
  missingJoints: [],
  missingLandmarks: [],
  landmarkChecks: [
    { landmark: "LEFT_SHOULDER" as const, status: "ok" as const, visibility: 0.9 }
  ],
  guidance: [{ severity: "ok" as const, message: "Great positioning." }],
  requiredLandmarksOk: true
};

describe("PoseFrame", () => {
  it("requires exactly 33 landmarks (MediaPipe ordering)", () => {
    const frame = {
      t: 0,
      landmarks: Array(33).fill(landmark),
      world: Array(33).fill(landmark),
      captureQuality
    };
    expect(PoseFrameSchema.safeParse(frame).success).toBe(true);
    expect(PoseFrameSchema.safeParse({ ...frame, landmarks: [landmark] }).success).toBe(false);
  });
});

describe("CaptureQuality", () => {
  it("rejects an out-of-range score", () => {
    expect(CaptureQualitySchema.safeParse({ ...captureQuality, score: 1.5 }).success).toBe(false);
  });
});

describe("JointAngles", () => {
  it("allows a partial angle map — not every joint visible every frame", () => {
    const parsed = JointAnglesSchema.safeParse({
      t: 0,
      angles: { left_knee: 172.5 },
      confidence: { left_knee: 0.8 },
      symmetry: {},
      trunkLean: 2.1
    });
    expect(parsed.success).toBe(true);
  });

  it("covers all 13 upstream-compatible joints plus trunk", () => {
    expect(JOINT_NAMES).toHaveLength(13);
    expect(JOINT_NAMES).toContain("trunk");
  });
});

describe("SafetyVerdict", () => {
  const base: SafetyVerdict = {
    t: 0,
    verdict: "allow",
    ruleId: "none",
    reason: "within thresholds",
    threshold: null,
    downgradeTo: null,
    source: "realtime_gate"
  };

  it("parses a well-formed verdict", () => {
    expect(SafetyVerdictSchema.safeParse(base).success).toBe(true);
  });

  it("mostSevere never softens a block or escalate (invariant 3)", () => {
    const block: SafetyVerdict = { ...base, verdict: "block", ruleId: "max_angle" };
    const allow: SafetyVerdict = { ...base, verdict: "allow" };
    expect(mostSevere(block, allow).verdict).toBe("block");
    expect(mostSevere(allow, block).verdict).toBe("block");

    const escalate: SafetyVerdict = { ...base, verdict: "escalate", ruleId: "fall_risk" };
    expect(mostSevere(block, escalate).verdict).toBe("escalate");
  });
});

describe("SessionEvent", () => {
  it("discriminates on `type` and rejects an unknown variant", () => {
    const started = { type: "session_started", t: 0, sessionId: "s1", programId: null, wallClock: new Date().toISOString() };
    expect(SessionEventSchema.safeParse(started).success).toBe(true);
    expect(SessionEventSchema.safeParse({ type: "not_a_real_event", t: 0 }).success).toBe(false);
  });
});

describe("ExerciseSpec", () => {
  it("requires provisional specs to say so (MVP-BUILD-PROMPT.md §7)", () => {
    const minimal = {
      id: "test-ex",
      displayName: "Test exercise",
      rationale: "because tests need one",
      provisional: true,
      provisionalNote: "placeholder ranges, no clinician sign-off yet",
      targetRegions: ["knee"],
      contraindicatedRegions: [],
      intensity: "low",
      difficulty: 1,
      movementType: "strength",
      progression: null,
      regression: null,
      setup: { view: "front", posture: "seated", requiredJoints: ["left_knee"] },
      phases: [
        { name: "concentric", joint: "left_knee", enter: { angle: 90, direction: "above" } }
      ],
      criteria: [
        {
          id: "peak-extension",
          label: "Peak knee extension",
          joint: "left_knee",
          measure: "peak_angle",
          target: { min: 160, max: 180 },
          tolerance: { warn: 10, fail: 20 },
          weight: 1
        }
      ],
      compensations: [],
      cues: [],
      safety: { consecutiveFailedRepsToBlock: 3 }
    };
    expect(ExerciseSpecSchema.safeParse(minimal).success).toBe(true);
  });
});
