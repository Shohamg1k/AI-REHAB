import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SessionEventSchema } from "@ai-rehab/contracts";

/**
 * ADR-0002 — "video never leaves the device" — enforced by inspection
 * rather than by promise.
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

  it("contains no network-transmission calls at all", () => {
    // The MVP is local-only: there is no backend. Any of these appearing is
    // a new egress path that must be reviewed against ADR-0002 before it
    // ships — including that it carries no frame-derived pixel data.
    const forbidden = [
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /navigator\.sendBeacon/,
      /new\s+WebSocket/,
      /axios/
    ];
    const offenders = FILES.filter((f) => forbidden.some((re) => re.test(f.code))).map(
      (f) => f.path
    );
    expect(offenders).toEqual([]);
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
