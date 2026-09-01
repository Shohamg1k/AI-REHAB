import { describe, expect, it } from "vitest";
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@ai-rehab/contracts";
import { EXERCISES } from "../index.js";
import { CUE_TRANSLATIONS, localiseCue } from "./cueCatalogue.js";

const NON_DEFAULT: Locale[] = LOCALES.map((l) => l.code).filter((c) => c !== DEFAULT_LOCALE);

const allCueText = (): string[] => {
  const seen = new Set<string>();
  for (const exercise of EXERCISES) for (const cue of exercise.cues) seen.add(cue.text);
  return [...seen];
};

describe("cue translation catalogue", () => {
  // The point of the whole design. The catalogue is keyed by English source
  // text so that editing an English cue *breaks the build* here rather than
  // leaving a stale translation in place. If this test fails after a copy
  // change, the fix is to retranslate the new wording, not to loosen the key.
  it("covers every cue in every shipped exercise, in every locale", () => {
    const missing: string[] = [];
    for (const text of allCueText()) {
      const entry = CUE_TRANSLATIONS[text];
      if (!entry) {
        missing.push(`[all locales] ${text}`);
        continue;
      }
      for (const locale of NON_DEFAULT) {
        if (!entry[locale as Exclude<Locale, "en">]?.trim()) missing.push(`[${locale}] ${text}`);
      }
    }
    expect(missing, `Untranslated cue text:\n${missing.join("\n")}`).toEqual([]);
  });

  it("has no catalogue entry that no exercise uses", () => {
    const live = new Set(allCueText());
    const orphans = Object.keys(CUE_TRANSLATIONS).filter((k) => !live.has(k));
    // Orphans are how a rewritten English cue shows up: the old key lingers
    // with its translations while the new text falls back to English.
    expect(orphans, `Catalogue keys matching no cue:\n${orphans.join("\n")}`).toEqual([]);
  });

  // Catches copy-paste between locale columns, which is the characteristic
  // mistake when one person fills in a table of languages by hand. It found a
  // real one: the French slot of the last entry held the Spanish string.
  it("does not repeat one locale's string in another locale", () => {
    const collisions: string[] = [];
    for (const [source, entry] of Object.entries(CUE_TRANSLATIONS)) {
      const byString = new Map<string, Locale[]>();
      for (const locale of NON_DEFAULT) {
        const value = entry[locale as Exclude<Locale, "en">];
        if (!value) continue;
        byString.set(value, [...(byString.get(value) ?? []), locale]);
      }
      for (const [value, locales] of byString) {
        if (locales.length > 1) collisions.push(`${locales.join(" = ")}: "${value}" (from "${source}")`);
      }
    }
    expect(collisions, `Same string in two locales:\n${collisions.join("\n")}`).toEqual([]);
  });

  it("never translates a cue to the English source text", () => {
    const untranslated: string[] = [];
    for (const [source, entry] of Object.entries(CUE_TRANSLATIONS)) {
      for (const locale of NON_DEFAULT) {
        if (entry[locale as Exclude<Locale, "en">] === source) untranslated.push(`[${locale}] ${source}`);
      }
    }
    expect(untranslated).toEqual([]);
  });
});

describe("localiseCue", () => {
  it("returns the source text unchanged for the default locale", () => {
    const text = "Straighten your knees fully at the top.";
    expect(localiseCue(text, "en")).toBe(text);
  });

  it("translates a known cue", () => {
    expect(localiseCue("Straighten your knees fully at the top.", "hi")).toBe(
      "ऊपर पहुँचकर घुटनों को पूरी तरह सीधा करें।"
    );
  });

  // Falling back to English is the designed behaviour, not a gap. A patient
  // mid-rep needs *a* cue; an untranslated one still coaches the movement,
  // and an empty string coaches nothing.
  it("falls back to English rather than returning nothing for an unknown cue", () => {
    const unknown = "A cue that was written after this catalogue was filled in.";
    for (const locale of NON_DEFAULT) {
      expect(localiseCue(unknown, locale)).toBe(unknown);
    }
  });
});
