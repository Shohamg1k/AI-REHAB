import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@ai-rehab/contracts";
import { detectRegion, isCommandAllowed, matchCommand, normalise } from "./commands.js";

const ALL: Locale[] = LOCALES.map((l) => l.code);

describe("matchCommand", () => {
  it("hears the user's own example phrasings", () => {
    expect(matchCommand("start the exercise", "en")).toEqual({ kind: "start" });
    expect(matchCommand("pause", "en")).toEqual({ kind: "pause" });
    expect(matchCommand("I felt a little pain in my shoulder", "en")).toEqual({
      kind: "pain",
      region: "shoulder"
    });
  });

  it("returns null for speech that is not addressed to it", () => {
    // This listens continuously; most of what it hears is a patient talking to
    // someone else, and the only correct response is to do nothing.
    expect(matchCommand("what time is dinner", "en")).toBeNull();
    expect(matchCommand("", "en")).toBeNull();
    expect(matchCommand("   ", "en")).toBeNull();
  });

  it("does not fire on a word merely containing a command", () => {
    expect(matchCommand("restarting the car", "en")).toBeNull();
    expect(matchCommand("I went to the pauseless meeting", "en")).toBeNull();
  });

  /**
   * The safety bias, stated as tests. Mishearing something as "pause" costs a
   * tap. Mishearing something as "start" or "resume" restarts a set the
   * patient wanted stopped, possibly while they are hurt.
   */
  describe("stop-like meanings win over go-like ones in the same utterance", () => {
    it("treats 'stop the exercise' as an end, not a start", () => {
      expect(matchCommand("stop the exercise", "en")).toEqual({ kind: "end" });
    });

    it("keeps a pain report even when the sentence also says to keep going", () => {
      expect(matchCommand("my knee hurts but let's go", "en")).toEqual({
        kind: "pain",
        region: "knee"
      });
    });

    it("treats 'wait, I'm ready' as a pause rather than a resume", () => {
      expect(matchCommand("wait I'm ready", "en")).toEqual({ kind: "pause" });
    });
  });

  it("recognises a command in every supported locale", () => {
    const samples: Record<Locale, { text: string; kind: string }[]> = {
      en: [
        { text: "begin", kind: "start" },
        { text: "hold on", kind: "pause" },
        { text: "keep going", kind: "resume" },
        { text: "I'm done", kind: "end" }
      ],
      hi: [
        { text: "शुरू करें", kind: "start" },
        { text: "रुको", kind: "pause" },
        { text: "जारी रखो", kind: "resume" },
        { text: "हो गया", kind: "end" }
      ]
    };

    for (const locale of ALL) {
      for (const { text, kind } of samples[locale]) {
        expect(matchCommand(text, locale), `${locale}: "${text}"`).toEqual({ kind });
      }
    }
  });

  it("hears a pain report in every locale", () => {
    const samples: Record<Locale, string> = {
      en: "my shoulder hurts",
      hi: "मेरे कंधे में दर्द है"
    };
    for (const locale of ALL) {
      expect(matchCommand(samples[locale], locale), locale).toEqual({
        kind: "pain",
        region: "shoulder"
      });
    }
  });

  it("reports pain with no region rather than guessing one", () => {
    // B6: what gets recorded is what the patient said. If they did not name a
    // body part, inventing one would be putting words in their mouth.
    expect(matchCommand("that really hurts", "en")).toEqual({ kind: "pain", region: null });
  });
});

describe("detectRegion", () => {
  it("prefers the more specific region name", () => {
    expect(detectRegion(normalise("my lower back hurts"), "en")).toBe("lower_back");
    expect(detectRegion(normalise("my back hurts"), "en")).toBe("lower_back");
  });

  it("finds each region from its own word", () => {
    expect(detectRegion("knee", "en")).toBe("knee");
    expect(detectRegion("ankle", "en")).toBe("ankle");
    expect(detectRegion("neck", "en")).toBe("neck");
  });
});

/**
 * CLAUDE.md invariant 3: nothing downstream may soften a block. A voice
 * command is downstream. These are the tests that say so.
 */
describe("isCommandAllowed", () => {
  const blocked = { blocked: true, scoring: false, countingDown: false };
  const running = { blocked: false, scoring: true, countingDown: false };
  const idle = { blocked: false, scoring: false, countingDown: false };

  it("never lets speech restart a set the safety gate has blocked", () => {
    expect(isCommandAllowed("start", blocked)).toBe(false);
    expect(isCommandAllowed("resume", blocked)).toBe(false);
  });

  it("still lets a blocked patient report pain and leave", () => {
    expect(isCommandAllowed("pain", blocked)).toBe(true);
    expect(isCommandAllowed("end", blocked)).toBe(true);
  });

  it("only pauses something that is running", () => {
    expect(isCommandAllowed("pause", running)).toBe(true);
    expect(isCommandAllowed("pause", idle)).toBe(false);
  });

  it("does not start something already running or already counting down", () => {
    expect(isCommandAllowed("start", running)).toBe(false);
    expect(isCommandAllowed("start", { blocked: false, scoring: false, countingDown: true })).toBe(
      false
    );
    expect(isCommandAllowed("start", idle)).toBe(true);
  });
});
