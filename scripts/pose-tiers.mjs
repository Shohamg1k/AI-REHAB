/**
 * The MediaPipe pose model tiers, in one place.
 *
 * Previously the chosen tier was hardcoded in three places that had to be
 * kept in sync by hand (this script's filename, its download URL, and the
 * worker's `MODEL_URL`). Comparing two tiers on a real device — which is
 * exactly what docs/adr/0007-pose-model-tier.md is waiting on — meant
 * editing all three correctly. Now it is one env var.
 *
 * `fetch-pose-assets.mjs` stages whichever tier is selected to a single
 * stable path, so the worker never needs to know which one it got. The
 * manifest it writes alongside carries the tier name for the UI to display,
 * so a perf reading is never ambiguous about what produced it.
 */

export const POSE_TIERS = {
  lite: {
    file: "pose_landmarker_lite.task",
    approxMB: 5.5,
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
  },
  full: {
    file: "pose_landmarker_full.task",
    approxMB: 9,
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
  },
  heavy: {
    file: "pose_landmarker_heavy.task",
    approxMB: 30,
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task"
  }
};

export const DEFAULT_TIER = "heavy";

/** The one path the app loads, whichever tier was staged there. */
export const STAGED_MODEL_FILE = "pose_landmarker.task";
export const MANIFEST_FILE = "manifest.json";

export function resolveTier(raw) {
  const tier = (raw ?? DEFAULT_TIER).trim().toLowerCase();
  if (!(tier in POSE_TIERS)) {
    throw new Error(
      `Unknown POSE_TIER "${raw}". Expected one of: ${Object.keys(POSE_TIERS).join(", ")}.`
    );
  }
  return tier;
}
