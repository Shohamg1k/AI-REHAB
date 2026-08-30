import { z } from "zod";

/**
 * The 33 MediaPipe Pose landmarks, by name.
 *
 * Framing requirements are expressed in *landmarks*, not joints, because
 * they are different questions. A joint (`left_knee`) is a thing we measure
 * an angle at; a landmark (`LEFT_KNEE`) is a point the camera either sees or
 * doesn't. An exercise can need the hip landmark in frame for framing
 * without scoring a hip angle, and vice versa — so `ExerciseSpec.setup`
 * carries both, and neither is derived from the other by force.
 *
 * Order matches MediaPipe's own index order, so `POSE_LANDMARK_INDEX` is a
 * lookup into the raw detection array rather than a translation layer.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const POSE_LANDMARK_NAMES = [
  "NOSE",
  "LEFT_EYE_INNER",
  "LEFT_EYE",
  "LEFT_EYE_OUTER",
  "RIGHT_EYE_INNER",
  "RIGHT_EYE",
  "RIGHT_EYE_OUTER",
  "LEFT_EAR",
  "RIGHT_EAR",
  "MOUTH_LEFT",
  "MOUTH_RIGHT",
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
  "LEFT_ELBOW",
  "RIGHT_ELBOW",
  "LEFT_WRIST",
  "RIGHT_WRIST",
  "LEFT_PINKY",
  "RIGHT_PINKY",
  "LEFT_INDEX",
  "RIGHT_INDEX",
  "LEFT_THUMB",
  "RIGHT_THUMB",
  "LEFT_HIP",
  "RIGHT_HIP",
  "LEFT_KNEE",
  "RIGHT_KNEE",
  "LEFT_ANKLE",
  "RIGHT_ANKLE",
  "LEFT_HEEL",
  "RIGHT_HEEL",
  "LEFT_FOOT_INDEX",
  "RIGHT_FOOT_INDEX"
] as const;

export const PoseLandmarkNameSchema = z.enum(POSE_LANDMARK_NAMES);
export type PoseLandmarkName = z.infer<typeof PoseLandmarkNameSchema>;

/** Name -> index into the 33-element MediaPipe landmark array. */
export const POSE_LANDMARK_INDEX = Object.fromEntries(
  POSE_LANDMARK_NAMES.map((name, index) => [name, index])
) as Record<PoseLandmarkName, number>;

/**
 * Human-readable phrase for a landmark, for user-facing framing guidance.
 * Deliberately plain-language ("your left wrist"), never the enum name —
 * patients read these, not developers (docs/UX-SPEC.md §5).
 */
export const LANDMARK_PHRASE: Record<PoseLandmarkName, string> = {
  NOSE: "your face",
  LEFT_EYE_INNER: "your face",
  LEFT_EYE: "your face",
  LEFT_EYE_OUTER: "your face",
  RIGHT_EYE_INNER: "your face",
  RIGHT_EYE: "your face",
  RIGHT_EYE_OUTER: "your face",
  LEFT_EAR: "your head",
  RIGHT_EAR: "your head",
  MOUTH_LEFT: "your face",
  MOUTH_RIGHT: "your face",
  LEFT_SHOULDER: "your left shoulder",
  RIGHT_SHOULDER: "your right shoulder",
  LEFT_ELBOW: "your left elbow",
  RIGHT_ELBOW: "your right elbow",
  LEFT_WRIST: "your left wrist",
  RIGHT_WRIST: "your right wrist",
  LEFT_PINKY: "your left hand",
  RIGHT_PINKY: "your right hand",
  LEFT_INDEX: "your left hand",
  RIGHT_INDEX: "your right hand",
  LEFT_THUMB: "your left hand",
  RIGHT_THUMB: "your right hand",
  LEFT_HIP: "your left hip",
  RIGHT_HIP: "your right hip",
  LEFT_KNEE: "your left knee",
  RIGHT_KNEE: "your right knee",
  LEFT_ANKLE: "your left ankle",
  RIGHT_ANKLE: "your right ankle",
  LEFT_HEEL: "your left heel",
  RIGHT_HEEL: "your right heel",
  LEFT_FOOT_INDEX: "your left foot",
  RIGHT_FOOT_INDEX: "your right foot"
};

/**
 * Collapses a left/right pair into one phrase ("both wrists") so guidance
 * reads like a person wrote it instead of listing every landmark.
 * Returns phrases in a stable order for deterministic, snapshot-able copy.
 */
export function describeLandmarks(landmarks: readonly PoseLandmarkName[]): string[] {
  const remaining = new Set(landmarks);
  const phrases: string[] = [];

  const PAIRS: Array<[PoseLandmarkName, PoseLandmarkName, string]> = [
    ["LEFT_SHOULDER", "RIGHT_SHOULDER", "both shoulders"],
    ["LEFT_ELBOW", "RIGHT_ELBOW", "both elbows"],
    ["LEFT_WRIST", "RIGHT_WRIST", "both wrists"],
    ["LEFT_HIP", "RIGHT_HIP", "both hips"],
    ["LEFT_KNEE", "RIGHT_KNEE", "both knees"],
    ["LEFT_ANKLE", "RIGHT_ANKLE", "both ankles"],
    ["LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX", "both feet"]
  ];

  for (const [left, right, phrase] of PAIRS) {
    if (remaining.has(left) && remaining.has(right)) {
      phrases.push(phrase);
      remaining.delete(left);
      remaining.delete(right);
    }
  }

  for (const name of POSE_LANDMARK_NAMES) {
    if (!remaining.has(name)) continue;
    const phrase = LANDMARK_PHRASE[name];
    if (!phrases.includes(phrase)) phrases.push(phrase);
    remaining.delete(name);
  }

  return phrases;
}

/** Joins phrases into a natural list: "a", "a and b", "a, b and c". */
export function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0]!;
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}
