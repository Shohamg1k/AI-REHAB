import { z } from "zod";

/**
 * H9 (multi-language). The set of languages the patient-facing coaching can
 * be spoken and captioned in.
 *
 * Kept deliberately small. Every locale added here obliges someone to
 * translate the whole cue catalogue and the safety reason templates, and an
 * untranslated locale is worse than an absent one — a patient who selects
 * their language and then hears English has been told the app supports
 * something it doesn't. `cueCatalogue.test.ts` fails the build if a locale
 * listed here is missing any string.
 *
 * `speechLang` is the BCP-47 tag handed to SpeechSynthesisUtterance.lang. It
 * is a *request*, not a guarantee: which voices exist is the browser and
 * operating system's business, not ours. See apps/patient/src/lib/speech.ts
 * for what happens when no voice matches.
 */
export const LocaleSchema = z.enum(["en", "es", "hi", "fr"]);
export type Locale = z.infer<typeof LocaleSchema>;

// Deliberately a literal type rather than `Locale`: callers narrow with
// `locale === DEFAULT_LOCALE` to reach the "translated" branch, and a widened
// type silently defeats that narrowing.
export const DEFAULT_LOCALE = "en" as const satisfies Locale;

export type LocaleInfo = {
  code: Locale;
  /** How the language names itself — what goes in the picker. */
  nativeName: string;
  /** English name, for logs, clinician-facing surfaces and reports. */
  englishName: string;
  speechLang: string;
  /**
   * False until a human fluent in the language has read the strings. Mirrors
   * the `provisional` posture on exercise specs: shipped, usable, and
   * labelled as unreviewed rather than quietly presented as finished.
   */
  reviewed: boolean;
};

export const LOCALES: readonly LocaleInfo[] = [
  { code: "en", nativeName: "English", englishName: "English", speechLang: "en-US", reviewed: true },
  { code: "es", nativeName: "Español", englishName: "Spanish", speechLang: "es-ES", reviewed: false },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", speechLang: "hi-IN", reviewed: false },
  { code: "fr", nativeName: "Français", englishName: "French", speechLang: "fr-FR", reviewed: false }
];

export const LOCALES_BY_CODE: ReadonlyMap<Locale, LocaleInfo> = new Map(
  LOCALES.map((l) => [l.code, l])
);

export function localeInfo(code: Locale): LocaleInfo {
  const info = LOCALES_BY_CODE.get(code);
  // The enum makes this unreachable; the throw is here so that adding a
  // locale to LocaleSchema without adding it to LOCALES fails loudly at the
  // first call rather than silently coaching someone in the wrong language.
  if (!info) throw new Error(`No LocaleInfo for locale "${code}"`);
  return info;
}

/**
 * Shown next to the language picker for any locale where `reviewed` is
 * false. The honest counterpart to PROVISIONAL_NOTE.
 */
export const UNREVIEWED_TRANSLATION_NOTE =
  "These translations have not been checked by a fluent speaker yet. " +
  "If a cue reads oddly, follow the on-screen movement and ask your clinician.";
