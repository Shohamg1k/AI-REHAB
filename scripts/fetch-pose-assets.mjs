#!/usr/bin/env node
/**
 * Stages the MediaPipe pose assets into apps/patient/public so the app
 * loads them from its own origin instead of a third-party CDN at runtime.
 *
 * Why this exists:
 * - **It has to work.** Fetching the wasm runtime from jsDelivr and the model
 *   from storage.googleapis.com fails on any network that blocks or
 *   TLS-intercepts those hosts — corporate proxies and VPNs routinely do.
 *   That is a hard failure with nothing but "Failed to fetch" to show for it.
 * - **Privacy.** Every session start would otherwise announce itself to two
 *   third parties. A product whose pitch is "your video never leaves the
 *   device" should not phone home to load the thing that looks at the video.
 * - **Reproducibility.** The wasm is copied from the exact installed
 *   @mediapipe/tasks-vision, so the runtime and the JS bindings cannot drift
 *   apart — the version-mismatch bug that produced "ModuleFactory not set".
 *
 * The wasm comes from node_modules (offline-safe). The model is not shipped
 * on npm, so it is downloaded once and cached; both land in gitignored
 * directories rather than being committed.
 *
 * Run automatically on `pnpm install`, or by hand: `pnpm setup:pose`
 */
import { createRequire } from "node:module";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANIFEST_FILE,
  POSE_TIERS,
  STAGED_MODEL_FILE,
  resolveTier
} from "./pose-tiers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "apps", "patient", "public");
const WASM_DEST = join(PUBLIC_DIR, "mediapipe", "wasm");
const MODEL_DEST_DIR = join(PUBLIC_DIR, "mediapipe", "models");

// Which tier to stage. Defaults to `heavy` per
// docs/adr/0007-pose-model-tier.md — the highest-accuracy tier, chosen for a
// controlled demo environment. Override to compare on real hardware:
//   POSE_TIER=full pnpm setup:pose
//
// Resolved lazily so an unknown tier surfaces through the same friendly
// error path as everything else here, rather than as a bare stack trace
// thrown during module evaluation.
let TIER;
let TIER_INFO;

// Staged under one stable name regardless of tier, so the worker never has
// to know which one it got.
const MODEL_DEST = join(MODEL_DEST_DIR, STAGED_MODEL_FILE);
const MANIFEST_DEST = join(MODEL_DEST_DIR, MANIFEST_FILE);

const MIN_PLAUSIBLE_MODEL_BYTES = 4_000_000; // lite, the smallest tier, is ~5.5MB

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  const require = createRequire(import.meta.url);
  // Resolve the package's main entry rather than its package.json: the
  // package restricts `exports`, so the manifest itself is not importable.
  // Walking up from the entry file finds the package root under pnpm's
  // nested store layout without hardcoding it.
  const entry = require.resolve("@mediapipe/tasks-vision", {
    paths: [join(__dirname, "..", "apps", "patient")]
  });

  let pkgRoot = dirname(entry);
  let wasmSrc = null;
  for (let i = 0; i < 4; i++) {
    if (await exists(join(pkgRoot, "wasm", "vision_wasm_internal.js"))) {
      wasmSrc = join(pkgRoot, "wasm");
      break;
    }
    pkgRoot = dirname(pkgRoot);
  }

  if (!wasmSrc) {
    throw new Error(
      `MediaPipe wasm not found near ${entry} — run pnpm install first.`
    );
  }

  await mkdir(WASM_DEST, { recursive: true });
  await cp(wasmSrc, WASM_DEST, { recursive: true });
  console.log(`✓ wasm runtime copied from ${wasmSrc}`);
}

/** The tier already staged, or null if nothing is staged yet. */
async function stagedTier() {
  try {
    return JSON.parse(await readFile(MANIFEST_DEST, "utf8")).tier ?? null;
  } catch {
    return null;
  }
}

async function fetchModel() {
  if ((await exists(MODEL_DEST)) && (await stagedTier()) === TIER) {
    console.log(`✓ pose model already present (${TIER} tier), skipping download`);
    return;
  }

  console.log(`  downloading pose model (~${TIER_INFO.approxMB} MB, ${TIER} tier)…`);
  const response = await fetch(TIER_INFO.url);
  if (!response.ok) {
    throw new Error(`model download failed: HTTP ${response.status} from ${TIER_INFO.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_PLAUSIBLE_MODEL_BYTES) {
    // A proxy that intercepts the request usually returns an HTML error page
    // with a 200. Writing that as a .task file produces a baffling failure
    // much later, so reject anything too small to be the real model.
    throw new Error(
      `model download returned ${bytes.length} bytes, far below the expected ` +
        `~${TIER_INFO.approxMB} MB — a proxy or captive portal probably intercepted it.`
    );
  }

  await mkdir(MODEL_DEST_DIR, { recursive: true });
  await writeFile(MODEL_DEST, bytes);
  await writeFile(
    MANIFEST_DEST,
    `${JSON.stringify({ tier: TIER, sourceFile: TIER_INFO.file, bytes: bytes.length }, null, 2)}\n`
  );
  console.log(`✓ pose model saved (${(bytes.length / 1e6).toFixed(1)} MB, ${TIER} tier)`);
}

try {
  TIER = resolveTier(process.env.POSE_TIER);
  TIER_INFO = POSE_TIERS[TIER];
  await copyWasm();
  await fetchModel();
  console.log("Pose assets ready — served locally, no CDN at runtime.");
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  if (TIER_INFO) {
    console.error(
      "\nThe app cannot start pose tracking without these. If you are behind a proxy that\n" +
        "blocks storage.googleapis.com, download the model manually and place it at:\n" +
        `  ${MODEL_DEST}\n  (source: ${TIER_INFO.url})\n`
    );
  }
  process.exit(1);
}
