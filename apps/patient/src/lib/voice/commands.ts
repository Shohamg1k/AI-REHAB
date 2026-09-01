import { BODY_REGIONS, type BodyRegion, type Locale } from "@ai-rehab/contracts";

/**
 * C7 — turning what a patient said into a session command.
 *
 * A pure function over a transcript string, deliberately separated from the
 * `SpeechRecognition` plumbing so that the interesting half is testable
 * without a microphone. Everything here is matched against fixed phrase
 * tables, not a model: ADR-0001 keeps models out of the fast loop, and a
 * patient mid-rep saying "stop" needs an answer in the same instant.
 *
 * **Recognition is unreliable, so the bias is asymmetric.** Mishearing
 * something as "pause" costs the patient a tap to resume. Mishearing
 * something as "resume" restarts a set they wanted stopped. So the stop-like
 * phrases are matched loosely (substring, many synonyms) and the go-like
 * phrases are matched strictly (the utterance must be *about* starting and
 * nothing else). The same asymmetry is why `resume` can never clear a safety
 * block — that decision belongs to the gate, and this file cannot reach it.
 */

export type VoiceCommand =
  | { kind: "start" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "end" }
  /**
   * The patient said something hurt. Severity is deliberately absent: B6
   * forbids presenting inferred pain as fact, and "a little pain" is not a
   * number. This bookmarks the rep and the region; the pain check-in asks
   * the patient for severity in their own terms afterwards.
   */
  | { kind: "pain"; region: BodyRegion | null };

export type CommandKind = VoiceCommand["kind"];

type Phrases = {
  start: string[];
  pause: string[];
  resume: string[];
  end: string[];
  /** Words that mean "this hurts", in any grammatical position. */
  pain: string[];
  /** Body region lexicon — several words may map to one region. */
  regions: Partial<Record<BodyRegion, string[]>>;
};

const PHRASES: Record<Locale, Phrases> = {
  en: {
    start: ["start", "begin", "go", "start the exercise", "start exercise", "lets go", "let's go"],
    pause: ["pause", "wait", "hold on", "hang on", "stop for a second", "give me a second"],
    resume: ["resume", "continue", "carry on", "keep going", "im ready", "i'm ready", "ready"],
    end: [
      "end",
      "finish",
      "done",
      "im done",
      "i'm done",
      "end the exercise",
      "end exercise",
      "stop the exercise",
      "that's it",
      "thats it"
    ],
    pain: ["pain", "hurt", "hurts", "hurting", "sore", "aches", "aching", "ow", "ouch"],
    regions: {
      shoulder: ["shoulder"],
      elbow: ["elbow"],
      wrist: ["wrist"],
      lower_back: ["lower back", "back", "lumbar"],
      hip: ["hip"],
      knee: ["knee"],
      ankle: ["ankle"],
      neck: ["neck"]
    }
  },
  hi: {
    start: ["शुरू", "शुरू करो", "शुरू करें", "चालू करो", "start", "shuru"],
    pause: ["रुको", "रुकिए", "रोको", "ठहरो", "एक मिनट", "pause", "ruko"],
    resume: ["जारी रखो", "आगे बढ़ो", "फिर से शुरू", "तैयार हूँ", "तैयार", "continue"],
    end: ["बंद करो", "खत्म", "ख़त्म", "समाप्त", "हो गया", "बस", "finish", "khatam"],
    pain: ["दर्द", "दुख", "तकलीफ", "तकलीफ़", "pain", "dard"],
    regions: {
      shoulder: ["कंधा", "कंधे", "kandha"],
      elbow: ["कोहनी"],
      wrist: ["कलाई"],
      lower_back: ["कमर", "पीठ", "kamar"],
      hip: ["कूल्हा", "कूल्हे"],
      knee: ["घुटना", "घुटने", "ghutna"],
      ankle: ["टखना", "टखने"],
      neck: ["गर्दन", "gardan"]
    }
  }
};

/**
 * Lowercase, strip punctuation, collapse whitespace. Latin accents are left
 * alone — the phrase tables carry both accented and unaccented spellings,
 * because recognisers disagree about accents and stripping them would break
 * Devanagari, which has no unaccented form to fall back to.
 */
export function normalise(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[.,!?;:¡¿"'`()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole-word/phrase containment, so "start" does not fire inside "restart". */
function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // Devanagari has no ASCII word boundaries, so fall back to substring there.
  if (!/^[\x20-\x7F]+$/.test(needle)) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s)`).test(haystack);
}

const anyOf = (text: string, phrases: string[]): boolean => phrases.some((p) => contains(text, p));

export function detectRegion(text: string, locale: Locale): BodyRegion | null {
  const table = PHRASES[locale].regions;
  // Longest phrase first, so "lower back" wins over "back" and maps to the
  // region the patient actually named.
  const candidates: Array<{ region: BodyRegion; phrase: string }> = [];
  for (const region of BODY_REGIONS) {
    for (const phrase of table[region] ?? []) candidates.push({ region, phrase });
  }
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);
  return candidates.find((c) => contains(text, c.phrase))?.region ?? null;
}

/**
 * Match one utterance. Returns null when nothing is recognised — which is the
 * common case, because this listens continuously and most of what it hears is
 * not addressed to it.
 *
 * Order matters and encodes the safety bias: pain and stop-like commands are
 * checked before go-like ones, so "my knee hurts, stop" can never come out as
 * a start.
 */
export function matchCommand(transcript: string, locale: Locale): VoiceCommand | null {
  const text = normalise(transcript);
  if (!text) return null;

  const phrases = PHRASES[locale] ?? PHRASES.en;

  // 1. Pain first. It is the only thing here a patient might say urgently and
  //    in the middle of a sentence, and it must never be lost to a stray
  //    "go" elsewhere in the same utterance.
  if (anyOf(text, phrases.pain)) {
    return { kind: "pain", region: detectRegion(text, locale) };
  }

  // 2. Ending, before pausing — "stop the exercise" is an end, not a pause.
  if (anyOf(text, phrases.end)) return { kind: "end" };

  // 3. Pausing.
  if (anyOf(text, phrases.pause)) return { kind: "pause" };

  // 4. Only now the go-like commands, and only if nothing above matched.
  if (anyOf(text, phrases.resume)) return { kind: "resume" };
  if (anyOf(text, phrases.start)) return { kind: "start" };

  return null;
}

/**
 * Which commands are legal right now.
 *
 * The safety rule lives here rather than at the call site so it cannot be
 * forgotten by a future caller: **while the safety gate is blocking, nothing
 * spoken can restart the set.** CLAUDE.md invariant 3 — nothing downstream may
 * soften a block, and a voice command is downstream. Pain and end stay
 * available, because a blocked patient still needs to report and to leave.
 */
export function isCommandAllowed(
  kind: CommandKind,
  context: { blocked: boolean; scoring: boolean; countingDown: boolean }
): boolean {
  if (kind === "pain" || kind === "end") return true;
  if (context.blocked) return false;

  switch (kind) {
    case "start":
      return !context.scoring && !context.countingDown;
    case "resume":
      return !context.scoring && !context.countingDown;
    case "pause":
      return context.scoring;
  }
}
