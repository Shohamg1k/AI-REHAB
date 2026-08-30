import { describe, expect, it } from "vitest";
import {
  POSE_LANDMARK_INDEX,
  POSE_LANDMARK_NAMES,
  type Landmark,
  type PoseLandmarkName
} from "@ai-rehab/contracts";
import { assessFraming } from "../src/index.js";

/**
 * The behaviour these tests pin down is the point of the whole module:
 * framing is judged against *this exercise's* required landmarks, and
 * nothing else. Landmarks the exercise doesn't need must never cause a
 * failure, however missing they are.
 */

const OFF_FRAME: Landmark = { x: -0.5, y: -0.5, z: 0, visibility: 0 };

/** A frame where every landmark is absent unless explicitly placed. */
function frameWith(
  present: Partial<Record<PoseLandmarkName, Partial<Landmark>>>
): Landmark[] {
  const frame: Landmark[] = POSE_LANDMARK_NAMES.map(() => ({ ...OFF_FRAME }));
  for (const [name, override] of Object.entries(present)) {
    frame[POSE_LANDMARK_INDEX[name as PoseLandmarkName]] = {
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
      ...override
    };
  }
  return frame;
}

const UPPER_BODY: PoseLandmarkName[] = [
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
  "LEFT_ELBOW",
  "RIGHT_ELBOW",
  "LEFT_WRIST",
  "RIGHT_WRIST"
];

const LOWER_BODY: PoseLandmarkName[] = [
  "LEFT_HIP",
  "RIGHT_HIP",
  "LEFT_KNEE",
  "RIGHT_KNEE",
  "LEFT_ANKLE",
  "RIGHT_ANKLE"
];

/** Spread landmarks vertically so the subject-extent check reads a plausible body. */
function placedUpperBody(): Partial<Record<PoseLandmarkName, Partial<Landmark>>> {
  return {
    LEFT_SHOULDER: { x: 0.4, y: 0.3 },
    RIGHT_SHOULDER: { x: 0.6, y: 0.3 },
    LEFT_ELBOW: { x: 0.35, y: 0.5 },
    RIGHT_ELBOW: { x: 0.65, y: 0.5 },
    LEFT_WRIST: { x: 0.3, y: 0.7 },
    RIGHT_WRIST: { x: 0.7, y: 0.7 }
  };
}

function placedLowerBody(): Partial<Record<PoseLandmarkName, Partial<Landmark>>> {
  return {
    LEFT_HIP: { x: 0.45, y: 0.25 },
    RIGHT_HIP: { x: 0.55, y: 0.25 },
    LEFT_KNEE: { x: 0.45, y: 0.55 },
    RIGHT_KNEE: { x: 0.55, y: 0.55 },
    LEFT_ANKLE: { x: 0.45, y: 0.85 },
    RIGHT_ANKLE: { x: 0.55, y: 0.85 }
  };
}

describe("assessFraming — upper-body exercise", () => {
  it("passes when the required upper-body landmarks are visible", () => {
    const q = assessFraming({
      landmarks: frameWith(placedUpperBody()),
      requiredLandmarks: UPPER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.missingLandmarks).toEqual([]);
    expect(q.framing).toBe("ok");
  });

  it("still passes when the legs are completely out of frame", () => {
    // Only upper-body landmarks exist at all; every leg landmark is absent.
    const q = assessFraming({
      landmarks: frameWith(placedUpperBody()),
      requiredLandmarks: UPPER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.score).toBeGreaterThan(0.8);
    expect(q.guidance.every((g) => g.severity === "ok")).toBe(true);
  });

  it("fails when a required wrist is missing", () => {
    const placed = placedUpperBody();
    delete placed.RIGHT_WRIST;
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    expect(q.requiredLandmarksOk).toBe(false);
    expect(q.missingLandmarks).toContain("RIGHT_WRIST");
  });

  it("names the missing part in plain language, not enum names", () => {
    const placed = placedUpperBody();
    delete placed.RIGHT_WRIST;
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    const text = q.guidance.map((g) => g.message).join(" ");
    expect(text).toContain("your right wrist");
    expect(text).not.toContain("RIGHT_WRIST");
  });

  it("collapses a missing left/right pair into one phrase", () => {
    const placed = placedUpperBody();
    delete placed.LEFT_WRIST;
    delete placed.RIGHT_WRIST;
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    expect(q.guidance.map((g) => g.message).join(" ")).toContain("both wrists");
  });
});

describe("assessFraming — lower-body exercise", () => {
  it("passes when the required lower-body landmarks are visible", () => {
    const q = assessFraming({
      landmarks: frameWith(placedLowerBody()),
      requiredLandmarks: LOWER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.framing).toBe("ok");
  });

  it("still passes when the whole upper body is out of frame", () => {
    const q = assessFraming({
      landmarks: frameWith(placedLowerBody()),
      requiredLandmarks: LOWER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.missingLandmarks).toEqual([]);
  });

  it("fails when a required knee is missing", () => {
    const placed = placedLowerBody();
    delete placed.LEFT_KNEE;
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: LOWER_BODY });
    expect(q.requiredLandmarksOk).toBe(false);
    expect(q.missingLandmarks).toContain("LEFT_KNEE");
  });
});

describe("assessFraming — irrelevant landmarks never fail framing", () => {
  it("ignores missing feet, knees and ankles for an upper-body exercise", () => {
    const q = assessFraming({
      landmarks: frameWith(placedUpperBody()),
      requiredLandmarks: UPPER_BODY
    });
    for (const irrelevant of ["LEFT_KNEE", "RIGHT_ANKLE", "LEFT_FOOT_INDEX"] as const) {
      expect(q.missingLandmarks).not.toContain(irrelevant);
      expect(q.landmarkChecks.some((c) => c.landmark === irrelevant)).toBe(false);
    }
    expect(q.requiredLandmarksOk).toBe(true);
  });

  it("ignores a missing face and wrists for a lower-body exercise", () => {
    const q = assessFraming({
      landmarks: frameWith(placedLowerBody()),
      requiredLandmarks: LOWER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.landmarkChecks.some((c) => c.landmark === "NOSE")).toBe(false);
  });
});

describe("assessFraming — confidence and position", () => {
  it("flags a required landmark below the confidence floor as insufficient signal", () => {
    const placed = placedUpperBody();
    placed.RIGHT_WRIST = { x: 0.7, y: 0.7, visibility: 0.2 };
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    expect(q.requiredLandmarksOk).toBe(false);
    expect(q.landmarkChecks.find((c) => c.landmark === "RIGHT_WRIST")?.status).toBe("not_detected");
  });

  it("marks a borderline-confidence landmark as low_confidence but still usable", () => {
    const placed = placedUpperBody();
    placed.RIGHT_WRIST = { x: 0.7, y: 0.7, visibility: 0.55 };
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    expect(q.landmarkChecks.find((c) => c.landmark === "RIGHT_WRIST")?.status).toBe(
      "low_confidence"
    );
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.guidance.some((g) => g.severity === "warn")).toBe(true);
  });

  it("detects a required landmark that has drifted outside the frame", () => {
    const placed = placedUpperBody();
    placed.RIGHT_WRIST = { x: 1.05, y: 0.7, visibility: 0.9 };
    const q = assessFraming({ landmarks: frameWith(placed), requiredLandmarks: UPPER_BODY });
    expect(q.landmarkChecks.find((c) => c.landmark === "RIGHT_WRIST")?.status).toBe("out_of_frame");
    expect(q.framing).toBe("partially_out_of_frame");
    expect(q.guidance.some((g) => g.severity === "fail")).toBe(true);
  });

  it("judges too-far against required landmarks only, not the whole body", () => {
    // A small but complete upper body — correct framing for an arm exercise,
    // which the old whole-body bounding-box check read as "too far".
    const q = assessFraming({
      landmarks: frameWith({
        LEFT_SHOULDER: { x: 0.46, y: 0.44 },
        RIGHT_SHOULDER: { x: 0.54, y: 0.44 },
        LEFT_ELBOW: { x: 0.44, y: 0.52 },
        RIGHT_ELBOW: { x: 0.56, y: 0.52 },
        LEFT_WRIST: { x: 0.43, y: 0.6 },
        RIGHT_WRIST: { x: 0.57, y: 0.6 }
      }),
      requiredLandmarks: UPPER_BODY
    });
    expect(q.requiredLandmarksOk).toBe(true);
    expect(q.framing).toBe("ok");
  });

  it("reports every required landmark as missing when nobody is detected", () => {
    const q = assessFraming({ landmarks: [], requiredLandmarks: UPPER_BODY });
    expect(q.requiredLandmarksOk).toBe(false);
    expect(q.missingLandmarks).toHaveLength(UPPER_BODY.length);
    expect(q.score).toBeLessThan(0.4);
  });
});

describe("assessFraming — lighting and backward compatibility", () => {
  it("flags dim and blown-out lighting without failing required landmarks", () => {
    const dim = assessFraming({
      landmarks: frameWith(placedUpperBody()),
      requiredLandmarks: UPPER_BODY,
      meanLuminance: 10
    });
    expect(dim.lighting).toBe("dim");
    expect(dim.requiredLandmarksOk).toBe(true);

    const bright = assessFraming({
      landmarks: frameWith(placedUpperBody()),
      requiredLandmarks: UPPER_BODY,
      meanLuminance: 250
    });
    expect(bright.lighting).toBe("blown_out");
  });

  it("falls back to landmarks derived from requiredJoints when none are declared", () => {
    const q = assessFraming({
      landmarks: frameWith(placedLowerBody()),
      requiredJoints: ["left_knee"]
    });
    // left_knee is measured from hip -> knee -> ankle.
    expect(q.landmarkChecks.map((c) => c.landmark).sort()).toEqual([
      "LEFT_ANKLE",
      "LEFT_HIP",
      "LEFT_KNEE"
    ]);
    expect(q.requiredLandmarksOk).toBe(true);
  });

  it("still reports missingJoints for callers reading the legacy field", () => {
    const placed = placedLowerBody();
    delete placed.LEFT_ANKLE;
    const q = assessFraming({
      landmarks: frameWith(placed),
      requiredJoints: ["left_knee", "right_knee"]
    });
    expect(q.missingJoints).toContain("left_knee");
    expect(q.missingJoints).not.toContain("right_knee");
  });
});
