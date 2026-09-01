/**
 * The bundled neural TTS voice registry (ADR-0011).
 *
 * Shared by `scripts/fetch-tts-assets.mjs` (which stages the files) and by
 * the patient app (which loads them), so the two cannot disagree about a
 * filename — the failure mode there is a 404 at the moment a patient asks to
 * be coached, which is the worst time to discover it.
 *
 * **Licences are per voice, not per project, and they are not all the same.**
 * Piper's *engine* is MIT. Its *voices* are trained on separate corpora and
 * inherit those corpora's terms. Every entry below records its own, and
 * `nonCommercial` is surfaced in the UI rather than living only here. See
 * docs/UPSTREAM.md §6 for the full analysis and why Hindi has no permissive
 * option today.
 */

/** Upstream of the Piper voice models. The rhasspy repo, not the mirror the npm wrappers use — that one has no Hindi. */
export const VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

/**
 * The espeak-ng phonemizer, compiled to wasm for Piper. 113 languages,
 * Hindi among them — which is the reason this route works at all and the
 * Kokoro route does not (the published JS phonemizers are English-only).
 */
export const PHONEMIZER_BASE =
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build";

export const PHONEMIZER_FILES = [
  "piper_phonemize.js",
  "piper_phonemize.wasm",
  "piper_phonemize.data"
];

/**
 * Voices we stage. Keyed by app locale.
 *
 * Only Hindi is here, deliberately. English, Spanish and French device voices
 * are near-universal; Hindi is the one this project actually found missing on
 * a real machine, and every megabyte staged is a megabyte served. The shape is
 * generic so adding `es` later is one entry and no code.
 */
export const BUNDLED_VOICES = {
  hi: {
    id: "hi_IN-pratham-medium",
    path: "hi/hi_IN/pratham/medium",
    /** espeak-ng language passed to the phonemizer; also present in the model config. */
    espeakVoice: "hi",
    sampleRate: 22050,
    approxBytes: 63_516_050,
    licence: "CC BY-NC-SA 4.0",
    /**
     * True means this voice may not be used commercially. The product owner
     * confirmed this project is non-commercial (see ADR-0011); if that ever
     * changes, this flag is what has to be answered, and the UI says so.
     */
    nonCommercial: true,
    attribution:
      "Piper voice hi_IN-pratham-medium, trained by PravalX on the AI4Bharat IndicNLP corpus. CC BY-NC-SA 4.0."
  }
};

export const voiceFiles = (voice) => [`${voice.id}.onnx`, `${voice.id}.onnx.json`];
