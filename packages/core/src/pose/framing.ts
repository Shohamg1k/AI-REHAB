import {
  POSE_LANDMARK_INDEX,
  describeLandmarks,
  joinPhrases,
  landmarksForJoints,
  JOINT_TO_LANDMARKS,
  type CaptureQuality,
  type FramingGuidance,
  type JointName,
  type Landmark,
  type LandmarkCheck,
  type LandmarkStatus,
  type PoseLandmarkName
} from "@ai-rehab/contracts";

/**
 * A7 (camera setup coach) + G7 (confidence gating), exercise-configuration
 * driven.
 *
 * The rule that matters: framing is judged **only against the landmarks the
 * current exercise declares**. A seated knee exercise is not "badly framed"
 * because the patient's wrists are out of shot, and an arm exercise is not
 * badly framed because their feet are. Previously this function scored a
 * whole-body bounding box over all 33 landmarks and demanded 70% of them be
 * visible, which failed correct upper-body-only and lower-body-only framing —
 * that is the bug this module exists to fix.
 *
 * Pure: no DOM, no I/O. The one pixel-level input (mean luminance) is
 * computed by the worker and passed in as a number, so packages/core stays
 * DOM-free (ARCHITECTURE.md §3).
 */

/**
 * Tunables in one place rather than scattered magic numbers. These are
 * heuristics, not measurements — the real device spike (ADR-0007) has not
 * run, so treat them as a starting point and retune against real captures.
 */
export type FramingThresholds = {
  /** Below this visibility a landmark is treated as not usable at all. */
  minVisibility: number;
  /** Between `minVisibility` and this, a landmark is usable but flagged low-confidence. */
  confidentVisibility: number;
  /** How far inside the frame edge (normalised 0..1) a landmark must sit. */
  frameMargin: number;
  /** Required-landmark bbox height below which the subject is too far away. */
  minSubjectExtent: number;
  /** Required-landmark bbox height above which the subject is too close. */
  maxSubjectExtent: number;
  dimLuminance: number;
  blownOutLuminance: number;
};

export const DEFAULT_FRAMING_THRESHOLDS: FramingThresholds = {
  minVisibility: 0.5,
  confidentVisibility: 0.65,
  frameMargin: 0.02,
  minSubjectExtent: 0.15,
  maxSubjectExtent: 0.98,
  dimLuminance: 60,
  blownOutLuminance: 230
};

export type FramingInput = {
  landmarks: readonly Landmark[];
  /**
   * The framing contract. When omitted, falls back to the landmarks implied
   * by `requiredJoints` — which is what a spec authored before landmark-level
   * framing existed effectively meant.
   */
  requiredLandmarks?: readonly PoseLandmarkName[];
  /** Still used to report `missingJoints` for backward compatibility. */
  requiredJoints?: readonly JointName[];
  meanLuminance?: number;
  thresholds?: Partial<FramingThresholds>;
};

/** Resolves the effective framing contract, applying the requiredJoints fallback. */
export function resolveRequiredLandmarks(input: {
  requiredLandmarks?: readonly PoseLandmarkName[];
  requiredJoints?: readonly JointName[];
}): PoseLandmarkName[] {
  if (input.requiredLandmarks && input.requiredLandmarks.length > 0) {
    return [...input.requiredLandmarks];
  }
  return landmarksForJoints(input.requiredJoints ?? []);
}

function checkLandmark(
  landmark: PoseLandmarkName,
  landmarks: readonly Landmark[],
  t: FramingThresholds
): LandmarkCheck {
  const lm = landmarks[POSE_LANDMARK_INDEX[landmark]];
  if (!lm) return { landmark, status: "not_detected", visibility: 0 };

  if (lm.visibility < t.minVisibility) {
    // MediaPipe still emits a coordinate for an unseen point, so visibility
    // is the honest signal here, not position.
    return { landmark, status: "not_detected", visibility: lm.visibility };
  }

  const outOfFrame =
    lm.x < t.frameMargin ||
    lm.x > 1 - t.frameMargin ||
    lm.y < t.frameMargin ||
    lm.y > 1 - t.frameMargin;
  if (outOfFrame) return { landmark, status: "out_of_frame", visibility: lm.visibility };

  if (lm.visibility < t.confidentVisibility) {
    return { landmark, status: "low_confidence", visibility: lm.visibility };
  }

  return { landmark, status: "ok", visibility: lm.visibility };
}

/** "is" for one singular phrase, "are" for a plural or multiple phrases. */
function agreementVerb(phrases: readonly string[]): string {
  if (phrases.length !== 1) return "are";
  return phrases[0]!.startsWith("both") ? "are" : "is";
}

function guidanceForStatus(
  status: Exclude<LandmarkStatus, "ok">,
  landmarks: readonly PoseLandmarkName[]
): FramingGuidance {
  const phrases = describeLandmarks(landmarks);
  const subject = joinPhrases(phrases);
  const verb = agreementVerb(phrases);

  switch (status) {
    case "out_of_frame":
      return {
        severity: "fail",
        message: `Move back a little — ${subject} ${verb} outside the frame.`
      };
    case "not_detected":
      return {
        severity: "fail",
        message: `Reposition the camera so ${subject} ${verb} visible.`
      };
    case "low_confidence":
      return {
        severity: "warn",
        message: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb} hard to see — try more light or a clearer background.`
      };
  }
}

export function assessFraming(input: FramingInput): CaptureQuality {
  const t = { ...DEFAULT_FRAMING_THRESHOLDS, ...input.thresholds };
  const { landmarks, meanLuminance } = input;

  const required = resolveRequiredLandmarks(input);
  const landmarkChecks = required.map((name) => checkLandmark(name, landmarks, t));

  const byStatus = (status: LandmarkStatus): PoseLandmarkName[] =>
    landmarkChecks.filter((c) => c.status === status).map((c) => c.landmark);

  const notDetected = byStatus("not_detected");
  const outOfFrame = byStatus("out_of_frame");
  const lowConfidence = byStatus("low_confidence");
  const missingLandmarks = [...notDetected, ...outOfFrame];

  // Subject extent is measured over the REQUIRED landmarks only. Measuring
  // it over all 33 is what made upper-body framing read as "too far".
  const usable = landmarkChecks
    .filter((c) => c.status !== "not_detected")
    .map((c) => landmarks[POSE_LANDMARK_INDEX[c.landmark]])
    .filter((l): l is Landmark => !!l);

  let framing: CaptureQuality["framing"] = "ok";
  if (outOfFrame.length > 0 || notDetected.length > 0) {
    framing = "partially_out_of_frame";
  } else if (usable.length >= 2) {
    const ys = usable.map((l) => l.y);
    const xs = usable.map((l) => l.x);
    // Diagonal extent, so a wide-but-short region (two shoulders) isn't
    // mistaken for a distant subject the way a pure height check would.
    const height = Math.max(...ys) - Math.min(...ys);
    const width = Math.max(...xs) - Math.min(...xs);
    const extent = Math.max(height, Math.hypot(width, height));
    if (extent > t.maxSubjectExtent) framing = "too_close";
    else if (extent < t.minSubjectExtent) framing = "too_far";
  }

  let lighting: CaptureQuality["lighting"] = "ok";
  if (meanLuminance !== undefined) {
    if (meanLuminance < t.dimLuminance) lighting = "dim";
    else if (meanLuminance > t.blownOutLuminance) lighting = "blown_out";
  }

  const guidance: FramingGuidance[] = [];
  if (outOfFrame.length > 0) guidance.push(guidanceForStatus("out_of_frame", outOfFrame));
  if (notDetected.length > 0) guidance.push(guidanceForStatus("not_detected", notDetected));
  if (framing === "too_close") {
    guidance.push({ severity: "warn", message: "Move back a little — you're very close to the camera." });
  }
  if (framing === "too_far") {
    guidance.push({ severity: "warn", message: "Step a little closer so your movement can be tracked." });
  }
  if (lowConfidence.length > 0) guidance.push(guidanceForStatus("low_confidence", lowConfidence));
  if (lighting === "dim") {
    guidance.push({ severity: "warn", message: "The room is quite dark — more light will improve tracking." });
  }
  if (lighting === "blown_out") {
    guidance.push({ severity: "warn", message: "The camera is looking into bright light — try facing away from the window." });
  }

  const requiredLandmarksOk = missingLandmarks.length === 0;

  if (guidance.length === 0) {
    const phrases = describeLandmarks(required);
    guidance.push({
      severity: "ok",
      message:
        phrases.length > 0
          ? `Great positioning — ${joinPhrases(phrases)} ${agreementVerb(phrases)} clearly visible.`
          : "Great positioning."
    });
  }

  // Backward-compatible joint view: a joint is "missing" when any landmark
  // its angle depends on is missing.
  const missingSet = new Set(missingLandmarks);
  const missingJoints: JointName[] = (input.requiredJoints ?? []).filter((joint) =>
    (JOINT_TO_LANDMARKS[joint] ?? []).some((l) => missingSet.has(l))
  );

  let score = 1;
  if (required.length > 0) {
    score -= Math.min(0.7, (missingLandmarks.length / required.length) * 0.7);
    score -= Math.min(0.15, (lowConfidence.length / required.length) * 0.15);
  }
  if (framing === "too_close" || framing === "too_far") score -= 0.15;
  if (lighting !== "ok") score -= 0.15;
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    framing,
    lighting,
    missingJoints,
    missingLandmarks,
    landmarkChecks,
    guidance,
    requiredLandmarksOk
  };
}

/**
 * Backward-compatible alias. Existing callers (the pose worker, older tests)
 * keep working; new code should prefer `assessFraming`, whose name says what
 * it actually does.
 */
export const computeCaptureQuality = assessFraming;
export type CaptureQualityInput = FramingInput;
