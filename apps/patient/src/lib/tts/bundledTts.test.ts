import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bundledVoiceFor, loadManifest } from "./bundledTts.js";

/**
 * ADR-0011. The manifest is how the app knows whether `pnpm setup:tts` was
 * ever run. Getting this wrong in the "not run" direction means a 60MB 404 in
 * the middle of a session, so absence has to be a first-class answer rather
 * than an error path.
 */
describe("bundled voice manifest", () => {
  const manifest = {
    stagedAt: "2026-09-02T00:00:00.000Z",
    voices: [
      {
        locale: "hi",
        id: "hi_IN-pratham-medium",
        licence: "CC BY-NC-SA 4.0",
        nonCommercial: true,
        attribution: "Piper voice, CC BY-NC-SA 4.0.",
        approxBytes: 63_516_050
      }
    ]
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const withFetch = async (impl: () => Promise<Response>) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    return import("./bundledTts.js");
  };

  it("finds a staged voice for its locale", async () => {
    const mod = await withFetch(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    await expect(mod.bundledVoiceFor("hi")).resolves.toMatchObject({
      id: "hi_IN-pratham-medium",
      nonCommercial: true
    });
  });

  it("returns null for a locale with no staged voice", async () => {
    const mod = await withFetch(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    await expect(mod.bundledVoiceFor("en")).resolves.toBeNull();
  });

  /** `pnpm setup:tts` never run. Supported, not an error. */
  it("treats a missing manifest as 'no bundled voices'", async () => {
    const mod = await withFetch(async () => new Response("", { status: 404 }));
    await expect(mod.loadManifest()).resolves.toBeNull();
    await expect(mod.bundledVoiceFor("hi")).resolves.toBeNull();
  });

  it("survives the fetch failing outright", async () => {
    const mod = await withFetch(async () => {
      throw new Error("offline");
    });
    await expect(mod.bundledVoiceFor("hi")).resolves.toBeNull();
  });

  it("fetches the manifest once however many locales ask", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(manifest), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./bundledTts.js");

    await Promise.all([mod.bundledVoiceFor("hi"), mod.bundledVoiceFor("en")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Re-exported for the type-level assertion below; the runtime versions are
// imported dynamically above so each case gets a fresh module cache.
void bundledVoiceFor;
void loadManifest;
