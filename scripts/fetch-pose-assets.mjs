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
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "apps", "patient", "public");
const WASM_DEST = join(PUBLIC_DIR, "mediapipe", "wasm");
const MODEL_DEST_DIR = join(PUBLIC_DIR, "mediapipe", "models");

// `heavy` — highest-accuracy tier, per docs/adr/0007-pose-model-tier.md.
// Chosen for the hackathon demo posture: a controlled environment (known
// hardware, good lighting, short session) where accuracy matters more than
// the broad device floor `lite` was hedging for. Swapping tiers means
// changing this URL, the filename below, and the worker's MODEL_URL.
const MODEL_FILE = "pose_landmarker_heavy.task";
const MODEL_DEST = join(MODEL_DEST_DIR, MODEL_FILE);
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

const MIN_PLAUSIBLE_MODEL_BYTES = 5_000_000; // heavy is ~29MB; catches a truncated/intercepted download

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

async function fetchModel() {
  if (await exists(MODEL_DEST)) {
    console.log("✓ pose model already present, skipping download");
    return;
  }

  console.log(`  downloading pose model (~29 MB, heavy tier)…`);
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`model download failed: HTTP ${response.status} from ${MODEL_URL}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < MIN_PLAUSIBLE_MODEL_BYTES) {
    // A proxy that intercepts the request usually returns an HTML error page
    // with a 200. Writing that as a .task file produces a baffling failure
    // much later, so reject anything too small to be the real model.
    throw new Error(
      `model download returned ${bytes.length} bytes, far below the expected ~5.8 MB — ` +
        `a proxy or captive portal probably intercepted it.`
    );
  }

  await mkdir(MODEL_DEST_DIR, { recursive: true });
  await writeFile(MODEL_DEST, bytes);
  console.log(`✓ pose model saved (${(bytes.length / 1e6).toFixed(1)} MB)`);
}

try {
  await copyWasm();
  await fetchModel();
  console.log("Pose assets ready — served locally, no CDN at runtime.");
} catch (err) {
  console.error(`\n✖ ${err instanceof Error ? err.message : err}`);
  console.error(
    "\nThe app cannot start pose tracking without these. If you are behind a proxy that\n" +
      "blocks storage.googleapis.com, download the model manually and place it at:\n" +
      `  ${MODEL_DEST}\n  (source: ${MODEL_URL})\n`
  );
  process.exit(1);
}
