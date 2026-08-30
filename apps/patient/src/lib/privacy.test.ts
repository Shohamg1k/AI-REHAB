import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionEventSchema } from "@ai-rehab/contracts";

/**
 * ADR-0002 — "video never leaves the device" — enforced by inspection
 * rather than by promise.
 *
 * M2 added a real backend and an optional sync layer (lib/api.ts,
 * lib/sync.ts, G6) — "no network calls at all" is no longer the invariant.
 * "Only derived SessionEvents leave, only from one reviewed file, and the
 * entire pose/camera/worker pipeline stays exactly as fetch-free as it was
 * in M1" is. See NETWORK_ALLOWED_FILES below.
 *
 * These tests are deliberately crude source-level greps. A subtle
 * exfiltration path could evade them, but the realistic failure mode is
 * someone innocently adding an upload, a recorder, or a frame grab while
 * extending the app — and that is exactly what these catch, in review,
 * before it ships.
 */

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Comments are stripped before scanning: prose *about* the privacy boundary
 * (including this file's own explanations, and the "no toDataURL here"
 * comments in the camera components) is not a violation of it. Scanning raw
 * text made documenting the rule trip the rule.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = sourceFiles(SRC).map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
  code: stripComments(readFileSync(path, "utf8"))
}));

describe("privacy: no raw camera data can leave the device (ADR-0002)", () => {
  it("has source files to inspect", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  // M2 added an optional sync layer (G6) to a real backend — the MVP's
  // "no network calls at all" is no longer true, on purpose. What must
  // stay true: only these two files may touch the network at all, and
  // everything else — the entire pose/camera/worker pipeline — remains as
  // fetch-free as it was in M1. Widening this allowlist is exactly the
  // kind of change that should fail review, not sail through silently.
  const NETWORK_ALLOWED_FILES = ["lib/api.ts"];

  function isAllowedNetworkFile(path: string): boolean {
    const relative = path.replace(/\\/g, "/").split("/src/")[1];
    return NETWORK_ALLOWED_FILES.includes(relative ?? "");
  }

  it("makes network calls from nowhere except the explicitly reviewed sync client", () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /navigator\.sendBeacon/,
      /new\s+WebSocket/,
      /axios/
    ];
    const offenders = FILES.filter(
      (f) => !isAllowedNetworkFile(f.path) && forbidden.some((re) => re.test(f.code))
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the sync client only ever sends already-validated SessionEvents, never a landmark or frame", () => {
    const api = FILES.find((f) => f.path.endsWith(join("lib", "api.ts")))!.code;
    // No raw pixel/landmark-shaped identifier anywhere near the fetch calls
    // — the request bodies are built from `events`/`SyncRequest` values
    // that are typed against SessionEvent, not assembled ad hoc from
    // anything camera-shaped.
    expect(api).not.toMatch(/landmark|bitmap|pixel|imagedata|canvas/i);
    // Every exported network call is one of the known, reviewed endpoints —
    // adding a new one here is a deliberate, visible diff, not a surprise.
    expect(api).toMatch(/\/auth\/signup/);
    expect(api).toMatch(/\/auth\/login/);
    expect(api).toMatch(/\/events/);
  });

  it("never encodes or extracts pixels from a canvas or video element", () => {
    // toDataURL / toBlob / getImageData on a *visible* canvas would turn the
    // live preview into an exportable still. The one legitimate pixel read
    // (mean luminance for the lighting check) lives in the worker on an
    // OffscreenCanvas and is asserted separately below.
    const forbidden = [/toDataURL/, /\.toBlob\s*\(/, /captureStream\s*\(/, /MediaRecorder/];
    const offenders = FILES.filter((f) => forbidden.some((re) => re.test(f.code))).map(
      (f) => f.path
    );
    expect(offenders).toEqual([]);
  });

  it("reads pixels in exactly one place, and only to derive a single number", () => {
    const readers = FILES.filter((f) => /getImageData/.test(f.code));
    expect(readers.map((f) => f.path.replace(/\\/g, "/").split("/src/")[1])).toEqual([
      "worker/poseWorker.ts"
    ]);
    // That read must feed the luminance average and nothing else — the
    // ImageData never escapes the function it is created in.
    const worker = readers[0]!.code;
    expect(worker).toContain("computeMeanLuminance");
    expect(worker).toMatch(/return sum \/ \(data\.length \/ 4\)/);
  });

  it("closes every camera frame it receives instead of retaining it", () => {
    const worker = FILES.find((f) => f.path.endsWith("poseWorker.ts"))!.code;
    expect(worker).toContain("bitmap.close()");
    // No module-level variable holds a bitmap between frames.
    expect(worker).not.toMatch(/^let\s+\w*[Bb]itmap\w*\s*(:|=)/m);
  });

  it("persists only schema-valid SessionEvents, which have no media fields", () => {
    // The event log is the only persistence path (IndexedDB, apps/.../db.ts).
    // Every variant of the union is derived data; none carries a frame,
    // blob, or image. Enumerated here so adding one that does breaks a test.
    const mediaKeyPattern = /(video|frame|image|bitmap|blob|screenshot|thumbnail|dataurl)/i;
    const optionKeys = SessionEventSchema.options.flatMap((option) =>
      Object.keys(option.shape)
    );
    expect(optionKeys.length).toBeGreaterThan(10);
    expect(optionKeys.filter((key) => mediaKeyPattern.test(key))).toEqual([]);
  });

  it("stores landmark coordinates only in memory, never in the event log", () => {
    const db = FILES.find((f) => f.path.endsWith("db.ts"))!.code;
    expect(db).not.toMatch(/landmark/i);
    expect(db).toContain("SessionEvent");
  });
});
