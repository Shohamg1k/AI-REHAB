import { beforeEach, describe, expect, it } from "vitest";
import { readRestoredScreen, writeRestoredScreen } from "./restoreScreen.js";

/**
 * Refreshing should put the patient back where they were. The bug this
 * covers was subtler than "nothing was saved": the screen *was* recorded,
 * but any screen outside the four nav tabs fell through to `welcome`, so
 * refreshing mid-workout dropped the patient at the front door — the one
 * moment they are least likely to forgive it.
 */
beforeEach(() => {
  sessionStorage.clear();
});

describe("readRestoredScreen", () => {
  it("returns nothing on a first visit, so a new patient starts at welcome", () => {
    expect(readRestoredScreen()).toBeNull();
  });

  it.each(["today", "program", "history", "sharing", "welcome", "auth"] as const)(
    "restores %s exactly",
    (screen) => {
      writeRestoredScreen({ screen, exerciseId: null });
      expect(readRestoredScreen()).toEqual({ screen, exerciseId: null });
    }
  );

  it("restores a live session to the same exercise, not to the home page", () => {
    writeRestoredScreen({ screen: "session", exerciseId: "seated-neck-side-tilt" });
    expect(readRestoredScreen()).toEqual({
      screen: "session",
      exerciseId: "seated-neck-side-tilt"
    });
  });

  it("falls back to Today — never welcome — when the saved exercise no longer exists", () => {
    writeRestoredScreen({ screen: "session", exerciseId: "removed-in-a-later-release" });
    expect(readRestoredScreen()).toEqual({ screen: "today", exerciseId: null });
  });

  it("falls back to Today when a session was saved without an exercise", () => {
    writeRestoredScreen({ screen: "session", exerciseId: null });
    expect(readRestoredScreen()?.screen).toBe("today");
  });

  it.each(["pain-check-in", "summary"] as const)(
    "sends %s to Today, because the rep data behind it died with the reload",
    (screen) => {
      writeRestoredScreen({ screen, exerciseId: "sit-to-stand" });
      // Rendering these from a cold start would show a summary of a set that
      // no longer exists, or a pain question about no particular rep.
      expect(readRestoredScreen()).toEqual({ screen: "today", exerciseId: null });
    }
  );

  it("ignores a screen name it does not recognise rather than crashing on it", () => {
    sessionStorage.setItem("ai-rehab:screen", JSON.stringify({ screen: "nonsense" }));
    expect(readRestoredScreen()).toBeNull();
  });

  it("survives malformed storage", () => {
    sessionStorage.setItem("ai-rehab:screen", "not json {{{");
    expect(readRestoredScreen()).toBeNull();
  });
});
