import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFS,
  MAX_RATE,
  MIN_RATE,
  parsePrefs,
  resolveVoice,
  spokenLocale,
  voiceCoverage,
  voicesForLocale,
  type SpeechPrefs
} from "./speech.js";

const voice = (lang: string, name: string, isDefault = false): SpeechSynthesisVoice =>
  ({
    lang,
    name,
    voiceURI: `${name}:${lang}`,
    default: isDefault,
    localService: true
  }) as SpeechSynthesisVoice;

const EN = voice("en-US", "Samantha", true);
const EN2 = voice("en-GB", "Daniel");
const ES = voice("es-ES", "Monica");
const HI = voice("hi-IN", "Lekha");

const prefs = (patch: Partial<SpeechPrefs> = {}): SpeechPrefs => ({ ...DEFAULT_PREFS, ...patch });

describe("parsePrefs", () => {
  it("returns defaults for absent or unparseable storage", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
  });

  // A corrupt preference blob must not be able to silence the coach.
  it("falls back per-field rather than discarding the whole blob", () => {
    const parsed = parsePrefs(JSON.stringify({ locale: "kl", voiceURI: 42, rate: "fast" }));
    expect(parsed).toEqual(DEFAULT_PREFS);
  });

  it("clamps rate into the supported range", () => {
    expect(parsePrefs(JSON.stringify({ rate: 9 })).rate).toBe(MAX_RATE);
    expect(parsePrefs(JSON.stringify({ rate: 0.1 })).rate).toBe(MIN_RATE);
  });

  it("keeps a valid locale and voice", () => {
    expect(
      parsePrefs(JSON.stringify({ locale: "hi", voiceURI: "Lekha:hi-IN", rate: 0.9 }))
    ).toEqual({
      locale: "hi",
      voiceURI: "Lekha:hi-IN",
      rate: 0.9,
      commandsEnabled: false
    });
  });

  /**
   * C7 turns on a microphone whose audio leaves the device (ADR-0010), so it
   * takes an explicit stored `true` and nothing else. A truthy-but-wrong value
   * in a corrupt or hand-edited blob must not switch it on.
   */
  it("only enables voice commands for a literal stored true", () => {
    expect(parsePrefs(JSON.stringify({ commandsEnabled: true })).commandsEnabled).toBe(true);
    for (const value of ["true", 1, "yes", {}, []]) {
      expect(
        parsePrefs(JSON.stringify({ commandsEnabled: value })).commandsEnabled,
        JSON.stringify(value)
      ).toBe(false);
    }
    expect(parsePrefs(null).commandsEnabled).toBe(false);
  });
});

describe("voicesForLocale", () => {
  it("matches on the primary subtag, so en-GB counts as English", () => {
    expect(voicesForLocale("en", [EN, EN2, ES, HI])).toEqual([EN, EN2]);
  });

  it("returns nothing when the language is absent", () => {
    expect(voicesForLocale("fr", [EN, ES, HI])).toEqual([]);
  });
});

describe("resolveVoice", () => {
  it("uses the explicitly chosen voice when it is still installed", () => {
    expect(resolveVoice(prefs({ locale: "es", voiceURI: "Monica:es-ES" }), [EN, ES])).toBe(ES);
  });

  /**
   * The bug this prevents: pick a Spanish voice, later switch the language to
   * Hindi, and the saved Spanish voiceURI would keep Spanish speech running
   * under a Hindi label.
   */
  it("ignores a saved voice that belongs to a different language", () => {
    expect(resolveVoice(prefs({ locale: "hi", voiceURI: "Monica:es-ES" }), [EN, ES, HI])).toBe(HI);
  });

  it("prefers the platform default within the locale", () => {
    expect(resolveVoice(prefs({ locale: "en" }), [EN2, EN])).toBe(EN);
  });

  it("returns null when nothing matches, leaving the browser to decide", () => {
    expect(resolveVoice(prefs({ locale: "fr" }), [EN, ES])).toBeNull();
  });
});

describe("spokenLocale", () => {
  it("speaks the chosen language when a voice for it exists", () => {
    expect(spokenLocale(prefs({ locale: "hi" }), [EN, HI])).toBe("hi");
  });

  /**
   * The core rule: text and voice must agree. Hindi words pushed through an
   * English engine are not accented Hindi, they are noise — so the spoken
   * channel drops to English while captions stay in the chosen language.
   */
  it("falls back to English speech when the device has no voice for the language", () => {
    expect(spokenLocale(prefs({ locale: "hi" }), [EN, ES])).toBe("en");
  });

  // Chrome returns [] until `voiceschanged` fires; treating that as "no Hindi
  // voice" would make the app briefly lie about what it supports.
  it("honours the choice while the voice list is still empty", () => {
    expect(spokenLocale(prefs({ locale: "hi" }), [])).toBe("hi");
  });
});

describe("voiceCoverage", () => {
  it("reports ok, unknown and missing distinctly", () => {
    expect(voiceCoverage(prefs({ locale: "hi" }), [HI])).toBe("ok");
    expect(voiceCoverage(prefs({ locale: "hi" }), [])).toBe("unknown");
    expect(voiceCoverage(prefs({ locale: "hi" }), [EN])).toBe("missing");
  });

  it("is always ok for English, which needs no translation", () => {
    expect(voiceCoverage(prefs({ locale: "en" }), [])).toBe("ok");
  });
});

/**
 * Regression test for a bug that shipped and was caught in the browser, not
 * here: the caller localised the cue with the patient's *chosen* locale and
 * then asked this module for a voice, so on a device with no Hindi voice the
 * app fed Hindi words to an English engine — the exact failure `spokenLocale`
 * exists to prevent. `speakLocalised` takes a localiser rather than a string
 * so the two cannot come from different locales; these tests hold that shape
 * in place.
 */
describe("speakLocalised", () => {
  const spoken: Array<{ text: string; lang: string; voice: string | null; rate: number }> = [];

  const installSynth = (voices: SpeechSynthesisVoice[]) => {
    spoken.length = 0;
    class Utterance {
      text: string;
      lang = "";
      pitch = 1;
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => voices,
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      speak: (u: Utterance) =>
        spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null, rate: u.rate })
    });
    // jsdom's `window` is the global here, so the stubs above are what
    // `isSpeechSupported()` sees.
  };

  const loadModule = async (prefsJson: string) => {
    window.localStorage.setItem("ai-rehab:speech", prefsJson);
    vi.resetModules();
    return import("./speech.js");
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("speaks the chosen language when a matching voice exists", async () => {
    installSynth([EN, HI]);
    const mod = await loadModule(JSON.stringify({ locale: "hi", voiceURI: null, rate: 1 }));
    mod.speakLocalised((locale) => (locale === "hi" ? "हिन्दी" : "English"));
    expect(spoken).toEqual([{ text: "हिन्दी", lang: "hi-IN", voice: "Lekha", rate: 1 }]);
  });

  it("speaks English words with an English voice when the language has none", async () => {
    installSynth([EN]);
    const mod = await loadModule(JSON.stringify({ locale: "hi", voiceURI: null, rate: 1 }));
    mod.speakLocalised((locale) => (locale === "hi" ? "हिन्दी" : "English"));
    // The bug produced { text: "हिन्दी", lang: "en-US" } — words and voice
    // from different languages, which is noise rather than coaching.
    expect(spoken).toEqual([{ text: "English", lang: "en-US", voice: "Samantha", rate: 1 }]);
  });

  it("applies the saved speaking rate", async () => {
    installSynth([EN]);
    const mod = await loadModule(JSON.stringify({ locale: "en", voiceURI: null, rate: 0.8 }));
    mod.speakLocalised(() => "hello");
    expect(spoken[0]?.rate).toBe(0.8);
  });
});
