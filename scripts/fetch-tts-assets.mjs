#!/usr/bin/env node
/**
 * Stages the bundled neural TTS assets into apps/patient/public/tts so the
 * app loads them from its own origin (ADR-0011, and the same reasoning as
 * `fetch-pose-assets.mjs`: corporate proxies block CDNs, and an app whose
 * pitch is "works offline" should not need jsDelivr to speak).
 *
 * **Deliberately not run on `pnpm install`.** The pose model is 30MB and is
 * needed for the product to function at all; this is another ~83MB and is
 * needed only where a device has no Hindi voice of its own. Making every
 * install and every CI run pay for it would be rude. Run it once on the
 * machine that serves the app:
 *
 *   pnpm setup:tts
 *
 * If the assets are absent the app degrades to the device's own voices and
 * says so in Settings — it does not break.
 */
import { createRequire } from "node:module";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUNDLED_VOICES,
  PHONEMIZER_BASE,
  PHONEMIZER_FILES,
  VOICE_BASE,
  voiceFiles
} from "./tts-voices.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PUBLIC_DIR = join(__dirname, "..", "apps", "patient", "public");
const TTS_DIR = join(PUBLIC_DIR, "tts");
const VOICES_DIR = join(TTS_DIR, "voices");
const ORT_DIR = join(TTS_DIR, "ort");
const MANIFEST = join(TTS_DIR, "manifest.json");

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function exists(path, minBytes = 1) {
  try {
    return (await stat(path)).size >= minBytes;
  } catch {
    return false;
  }
}

async function download(url, dest, label) {
  if (await exists(dest, 1024)) {
    console.log(`  ✓ ${label} already staged`);
    return;
  }
  process.stdout.write(`  downloading ${label}…`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label}: ${response.status} ${response.statusText} from ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, bytes);
  console.log(` ${mb(bytes.byteLength)}`);
}

/**
 * onnxruntime-web ships its wasm on npm, so it is copied rather than
 * downloaded — the runtime and the JS bindings then cannot drift apart,
 * which is the version-mismatch class of bug the pose script also avoids.
 */
async function stageOnnxRuntime() {
  const entry = require.resolve("onnxruntime-web", {
    paths: [join(__dirname, "..", "apps", "patient")]
  });
  const distDir = join(dirname(entry), "..", "dist");
  await cp(distDir, ORT_DIR, {
    recursive: true,
    filter: (src) => !src.endsWith(".map")
  });
  console.log("  ✓ onnxruntime-web wasm copied from node_modules");
}

/**
 * Re-emits the phonemizer's UMD bundle as an ES module.
 *
 * The worker that uses it is a module worker, where `importScripts` does not
 * exist. The alternatives were a classic worker (which would mean changing
 * Vite's global worker format and disturbing the pose worker) or evaluating
 * the source with `new Function` (which would oblige every deployment to
 * allow `unsafe-eval` for one file). Appending an export is the boring
 * option: the UMD's own CommonJS/AMD branches are guarded by `typeof` checks
 * that are simply false in an ES module, so they no-op.
 */
async function wrapPhonemizerAsModule() {
  const source = await readFile(join(TTS_DIR, "piper_phonemize.js"), "utf-8");
  await writeFile(
    join(TTS_DIR, "piper_phonemize.mjs"),
    `${source}
export default createPiperPhonemize;
`
  );
  console.log("  ✓ re-emitted as an ES module for the TTS worker");
}

async function main() {
  await mkdir(VOICES_DIR, { recursive: true });
  await mkdir(ORT_DIR, { recursive: true });

  console.log("Staging bundled TTS assets (ADR-0011)…");

  console.log("\nespeak-ng phonemizer (113 languages, Hindi included):");
  for (const file of PHONEMIZER_FILES) {
    await download(`${PHONEMIZER_BASE}/${file}`, join(TTS_DIR, file), file);
  }
  await wrapPhonemizerAsModule();

  console.log("\nonnxruntime-web:");
  await stageOnnxRuntime();

  const staged = [];
  for (const [locale, voice] of Object.entries(BUNDLED_VOICES)) {
    console.log(`\nvoice for "${locale}" — ${voice.id} (${voice.licence}):`);
    for (const file of voiceFiles(voice)) {
      await download(`${VOICE_BASE}/${voice.path}/${file}`, join(VOICES_DIR, file), file);
    }
    staged.push({ locale, ...voice });
    if (voice.nonCommercial) {
      console.log(`  ! ${voice.licence} — non-commercial use only. ${voice.attribution}`);
    }
  }

  // The app reads this to know what is actually available without probing for
  // 63MB files. Absent manifest means "no bundled voices", which is a
  // supported state, not an error.
  await writeFile(
    MANIFEST,
    `${JSON.stringify({ stagedAt: new Date().toISOString(), voices: staged }, null, 2)}\n`
  );

  console.log("\nBundled TTS ready — served from this app's own origin, no CDN at runtime.");
}

main().catch((error) => {
  console.error("\nFailed to stage TTS assets:", error.message);
  console.error("The app still works; it will use the device's own voices instead.");
  process.exit(1);
});
