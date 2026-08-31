import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST_FILE } from "./pose-tiers.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(
  repoRoot,
  "apps",
  "patient",
  "public",
  "mediapipe",
  "models",
  MANIFEST_FILE
);

export const VIRTUAL_TIER_ID = "virtual:pose-model-tier";
const RESOLVED_TIER_ID = `\0${VIRTUAL_TIER_ID}`;

/**
 * Which pose model tier `fetch-pose-assets.mjs` staged. Falls back to
 * "unknown" when the manifest is absent — a missing perf label is cosmetic,
 * never a reason to fail a build or a test run.
 */
function stagedPoseTier() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).tier ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Supplies the staged tier to app code as a virtual module.
 *
 * Read at build time rather than fetched at runtime because the consumer is
 * the live-session path, and the pose worker must stay network-free —
 * ADR-0002's guard (apps/patient/src/lib/privacy.test.ts) permits `fetch` in
 * exactly one reviewed file, and a perf label is not a good enough reason to
 * widen it.
 *
 * A virtual module rather than a `define` constant because Vite does not
 * apply `define` to worker modules in dev, which shipped a bare identifier
 * and threw `ReferenceError` on load — working in production, broken in
 * development.
 *
 * Lives here, shared by apps/patient/vite.config.ts and the root
 * vitest.config.ts, because a test run resolves modules through its own
 * plugin set: registered in only one of them, the import fails in the other.
 */
export function poseModelTierPlugin() {
  return {
    name: "pose-model-tier",
    resolveId(id) {
      return id === VIRTUAL_TIER_ID ? RESOLVED_TIER_ID : null;
    },
    load(id) {
      return id === RESOLVED_TIER_ID
        ? `export const POSE_MODEL_TIER = ${JSON.stringify(stagedPoseTier())};`
        : null;
    }
  };
}
