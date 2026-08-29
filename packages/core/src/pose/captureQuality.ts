import type { CaptureQuality, JointName, Landmark } from "@ai-rehab/contracts";

/**
 * Drives A7 (camera setup coach) and G7 (confidence gating). Pure function
 * over a landmark frame plus an optional pre-computed mean luminance — this
 * package stays DOM-free, so reading actual pixels happens in the worker
 * (apps/patient/src/worker), which passes the single number in.
 *
 * Visibility floor and framing bounds are heuristics, not measured against
 * real capture data (this environment cannot run a camera) — tune against
 * the M0 spike's real recordings before trusting the thresholds.
 */

const VISIBILITY_FLOOR = 0.5;
const TOO_CLOSE_BBOX_HEIGHT = 0.95;
const TOO_FAR_BBOX_HEIGHT = 0.35;
const DIM_LUMINANCE = 60; // 0..255
const BLOWN_OUT_LUMINANCE = 230;

export type CaptureQualityInput = {
  landmarks: readonly Landmark[];
  requiredJoints: readonly JointName[];
  /** Mean pixel luminance 0..255 of the current frame, if available. */
  meanLuminance?: number;
};

const JOINT_TO_LANDMARK_INDEX: Partial<Record<JointName, number>> = {
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28
};

export function computeCaptureQuality(input: CaptureQualityInput): CaptureQuality {
  const { landmarks, requiredJoints, meanLuminance } = input;

  const visible = landmarks.filter((l) => l.visibility >= VISIBILITY_FLOOR);
  let framing: CaptureQuality["framing"] = "ok";

  if (visible.length === 0) {
    framing = "partially_out_of_frame";
  } else {
    const xs = visible.map((l) => l.x);
    const ys = visible.map((l) => l.y);
    const bboxHeight = Math.max(...ys) - Math.min(...ys);
    const outOfBounds = visible.some((l) => l.x < 0 || l.x > 1 || l.y < 0 || l.y > 1);

    if (outOfBounds || visible.length < landmarks.length * 0.7) {
      framing = "partially_out_of_frame";
    } else if (bboxHeight > TOO_CLOSE_BBOX_HEIGHT) {
      framing = "too_close";
    } else if (bboxHeight < TOO_FAR_BBOX_HEIGHT) {
      framing = "too_far";
    }
    void xs; // bbox width unused today; kept for a future left/right framing check
  }

  let lighting: CaptureQuality["lighting"] = "ok";
  if (meanLuminance !== undefined) {
    if (meanLuminance < DIM_LUMINANCE) lighting = "dim";
    else if (meanLuminance > BLOWN_OUT_LUMINANCE) lighting = "blown_out";
  }

  const missingJoints: JointName[] = requiredJoints.filter((joint) => {
    const idx = JOINT_TO_LANDMARK_INDEX[joint];
    if (idx === undefined) return false; // 'trunk' has no single landmark; never "missing"
    const lm = landmarks[idx];
    return !lm || lm.visibility < VISIBILITY_FLOOR;
  });

  let score = 1;
  if (framing !== "ok") score -= 0.3;
  if (lighting !== "ok") score -= 0.2;
  score -= Math.min(0.5, missingJoints.length * 0.15);
  score = Math.max(0, Math.min(1, score));

  return { score, framing, lighting, missingJoints };
}
