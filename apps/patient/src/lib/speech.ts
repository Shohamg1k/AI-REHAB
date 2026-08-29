/**
 * Browser SpeechSynthesis wrapper for A3 (live corrective coaching) and E3
 * (escalation). MVP scope per docs/ARCHITECTURE.md — browser speech only,
 * no hosted TTS. Cue *text* always comes from the exercise spec (ADR-0001);
 * this module only speaks it aloud. Speech is never the only channel — every
 * call site also renders the caption text visually (CLAUDE.md §4 "cue text
 * has a caption; spoken output is never the only channel").
 */

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let enabled = true;

export function setSpeechEnabled(value: boolean): void {
  enabled = value;
  if (!value && isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeechEnabled(): boolean {
  return enabled;
}

export function speak(text: string, opts: { urgent?: boolean } = {}): void {
  if (!enabled || !isSpeechSupported()) return;

  if (opts.urgent) {
    window.speechSynthesis.cancel(); // a safety message pre-empts whatever was being said
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}
