import { DEFAULT_LOCALE, LocaleSchema, localeInfo, type Locale } from "@ai-rehab/contracts";

/**
 * Browser SpeechSynthesis wrapper for A3 (live corrective coaching), E3
 * (escalation) and H9 (voice and language choice). MVP scope per
 * docs/ARCHITECTURE.md — browser speech only, no hosted TTS. Cue *text*
 * always comes from the exercise spec and its shipped translations
 * (ADR-0001); this module only speaks it aloud. Speech is never the only
 * channel — every call site also renders the caption text visually
 * (CLAUDE.md §4 "cue text has a caption; spoken output is never the only
 * channel").
 */

const STORAGE_KEY = "ai-rehab:speech";

/** Slow speech helps more than it costs in rehab; the range is asymmetric on purpose. */
export const MIN_RATE = 0.7;
export const MAX_RATE = 1.2;

export type SpeechPrefs = {
  locale: Locale;
  /** `SpeechSynthesisVoice.voiceURI`, or null to let the browser pick for the locale. */
  voiceURI: string | null;
  rate: number;
  /**
   * C7 — whether the app listens for spoken session commands.
   *
   * Off by default and never turned on implicitly. In every shipping browser
   * `SpeechRecognition` streams microphone audio to the vendor's servers
   * (Google, for Chrome), so this is a microphone *and* a network decision,
   * and it is the patient's to make. See ADR-0010.
   */
  commandsEnabled: boolean;
};

export const DEFAULT_PREFS: SpeechPrefs = {
  locale: DEFAULT_LOCALE,
  voiceURI: null,
  rate: 1.0,
  commandsEnabled: false
};

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let enabled = true;
let prefs: SpeechPrefs = DEFAULT_PREFS;
let loaded = false;

function clampRate(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_PREFS.rate;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, n));
}

/**
 * Parse stored prefs defensively. Anything unrecognised falls back to the
 * default rather than throwing: a corrupt preference blob must not be able to
 * stop the coach from speaking.
 */
export function parsePrefs(raw: string | null): SpeechPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const locale = LocaleSchema.safeParse(parsed.locale);
    return {
      locale: locale.success ? locale.data : DEFAULT_PREFS.locale,
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      rate: clampRate(parsed.rate),
      // Anything other than an explicit stored `true` means off. A corrupt
      // blob must not be able to switch the microphone on.
      commandsEnabled: parsed.commandsEnabled === true
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function loadSpeechPrefs(): SpeechPrefs {
  if (loaded) return prefs;
  loaded = true;
  try {
    prefs = parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    prefs = DEFAULT_PREFS; // private-mode Safari and friends
  }
  return prefs;
}

const listeners = new Set<() => void>();

/** Lets `useSpeechPrefs` re-render captions the moment the language changes. */
export function subscribeSpeechPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveSpeechPrefs(patch: Partial<SpeechPrefs>): SpeechPrefs {
  const next: SpeechPrefs = { ...loadSpeechPrefs(), ...patch };
  next.rate = clampRate(next.rate);
  prefs = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preference is still applied for this session; persistence is a bonus.
  }
  for (const listener of listeners) listener();
  return next;
}

/** The locale the patient chose — what captions and cue text are rendered in. */
export function getSpeechLocale(): Locale {
  return loadSpeechPrefs().locale;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

/**
 * Voices arrive asynchronously in Chrome — `getVoices()` returns [] on the
 * first call and fills in later. Any UI listing voices has to subscribe or it
 * will render an empty picker on a machine that has plenty.
 */
export function onVoicesChanged(callback: () => void): () => void {
  if (!isSpeechSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener("voiceschanged", callback);
  return () => synth.removeEventListener("voiceschanged", callback);
}

const langMatches = (voiceLang: string, locale: Locale): boolean =>
  voiceLang.toLowerCase().replace("_", "-").split("-")[0] === locale;

export function voicesForLocale(locale: Locale, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => langMatches(v.lang, locale));
}

/**
 * Which voice to actually use. An explicitly chosen voice wins only if it is
 * still installed *and* still matches the chosen locale — otherwise switching
 * language while a voice from the old language is saved would keep speaking
 * in the old one.
 */
export function resolveVoice(
  p: SpeechPrefs,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const candidates = voicesForLocale(p.locale, voices);
  if (p.voiceURI) {
    const chosen = candidates.find((v) => v.voiceURI === p.voiceURI);
    if (chosen) return chosen;
  }
  return candidates.find((v) => v.default) ?? candidates[0] ?? null;
}

/**
 * The locale to speak *text* in, which is not always the locale the patient
 * chose.
 *
 * Which voices exist is the operating system's business. If someone selects
 * Hindi on a machine with no Hindi voice, pushing Hindi text through an
 * English engine produces noise, not coaching — so the spoken channel falls
 * back to English while captions stay in Hindi. Text and voice must agree;
 * that is the whole rule. `voiceCoverage` lets the settings UI say so plainly
 * instead of leaving the patient to wonder why the app is talking to them in
 * the wrong language.
 */
export function spokenLocale(p: SpeechPrefs, voices: SpeechSynthesisVoice[]): Locale {
  if (p.locale === DEFAULT_LOCALE) return DEFAULT_LOCALE;
  // No voice list yet (Chrome, first paint) — honour the choice rather than
  // wrongly reporting the language as unavailable.
  if (voices.length === 0) return p.locale;
  return voicesForLocale(p.locale, voices).length > 0 ? p.locale : DEFAULT_LOCALE;
}

/** Whether the device can actually speak the chosen language. */
export function voiceCoverage(
  p: SpeechPrefs,
  voices: SpeechSynthesisVoice[]
): "ok" | "unknown" | "missing" {
  if (p.locale === DEFAULT_LOCALE) return "ok";
  if (voices.length === 0) return "unknown";
  return voicesForLocale(p.locale, voices).length > 0 ? "ok" : "missing";
}

export function setSpeechEnabled(value: boolean): void {
  enabled = value;
  if (!value && isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeechEnabled(): boolean {
  return enabled;
}

function utter(text: string, locale: Locale, p: SpeechPrefs, voices: SpeechSynthesisVoice[]): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = clampRate(p.rate);
  utterance.pitch = 1.0;
  utterance.lang = localeInfo(locale).speechLang;
  // Resolved against the locale actually being spoken, not the one the patient
  // picked. When they differ we have already fallen back to English text, and
  // the voice has to follow it rather than being left to the browser's guess.
  const voice = resolveVoice({ ...p, locale }, voices);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

/**
 * Speak a line, letting *this module* decide which language the words are in.
 *
 * The callback shape is the point. An earlier version took a finished string
 * and localised it at the call site with the patient's chosen locale — which
 * silently defeated `spokenLocale`: on a device with no Hindi voice it fed
 * Hindi words to an English engine, the precise failure `spokenLocale` exists
 * to prevent. Handing the localiser *in* means the text and the voice are
 * resolved from one value and cannot disagree.
 *
 * Callers pass `(locale) => localiseCue(cue.text, locale)` or the safety
 * equivalent, because only they know which catalogue applies. Captions are a
 * separate decision and stay in the patient's chosen language.
 */
export function speakLocalised(
  localise: (locale: Locale) => string,
  opts: { urgent?: boolean } = {}
): void {
  if (!enabled || !isSpeechSupported()) return;

  if (opts.urgent) {
    window.speechSynthesis.cancel(); // a safety message pre-empts whatever was being said
  }

  const p = loadSpeechPrefs();
  const voices = listVoices();
  const locale = spokenLocale(p, voices);
  utter(localise(locale), locale, p, voices);
}

/** Speaks a sample so the patient can hear a voice before committing to it. */
export function previewVoice(p: SpeechPrefs, sampleFor: (locale: Locale) => string): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  const voices = listVoices();
  const locale = spokenLocale(p, voices);
  utter(sampleFor(locale), locale, p, voices);
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
