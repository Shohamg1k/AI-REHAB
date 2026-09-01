import { useEffect, useRef, useState } from "react";
import { localeInfo, type Locale } from "@ai-rehab/contracts";
import { matchCommand, type VoiceCommand } from "../lib/voice/commands.js";

/**
 * C7 — continuous listening for session commands.
 *
 * The DOM lib does not type `SpeechRecognition`, and the API is still
 * vendor-prefixed in every shipping browser, so the surface we use is
 * declared here rather than pulling in a dependency for six fields.
 */
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { readonly length: number; isFinal: boolean; [i: number]: RecognitionAlternative };
type RecognitionEvent = {
  resultIndex: number;
  results: { readonly length: number; [i: number]: RecognitionResult };
};
type RecognitionErrorEvent = { error: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceCommandsSupported(): boolean {
  return recognitionCtor() !== null;
}

export type VoiceStatus =
  | "unsupported"
  | "off"
  /** Enabled and listening. */
  | "listening"
  /** Enabled, but the browser has stopped the stream and we are restarting it. */
  | "restarting"
  /** The patient declined the microphone. Not retried — that is their answer. */
  | "denied"
  | "error";

/**
 * `SpeechRecognition` ends itself constantly — after silence, after a result,
 * after the tab loses focus. "Continuous listening" is really "restart it
 * every time it stops", which is what this does.
 */
const RESTART_DELAY_MS = 400;

export function useVoiceCommands({
  enabled,
  locale,
  onCommand
}: {
  enabled: boolean;
  locale: Locale;
  onCommand: (command: VoiceCommand, transcript: string) => void;
}): { status: VoiceStatus; lastHeard: string | null } {
  const [status, setStatus] = useState<VoiceStatus>(() =>
    isVoiceCommandsSupported() ? "off" : "unsupported"
  );
  const [lastHeard, setLastHeard] = useState<string | null>(null);

  // Held in a ref so that changing the handler does not tear down and restart
  // recognition — restarting drops audio, and dropping the audio in which the
  // patient said "pause" is the one failure that matters here.
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    if (!enabled) {
      setStatus("off");
      return;
    }

    let stopped = false;
    let restartTimer: number | null = null;
    const recognition = new Ctor();
    recognition.lang = localeInfo(locale).speechLang;
    recognition.continuous = true;
    // Final results only. Interim results fire many times for one phrase, so
    // acting on them means either debouncing (which costs the latency the
    // interim results were for) or firing a command several times. A repeated
    // "end" would be harmless; a repeated "pain" would write several
    // bookmarks for one complaint.
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const transcript = result[0]?.transcript ?? "";
        if (!transcript.trim()) continue;
        setLastHeard(transcript.trim());
        const command = matchCommand(transcript, locale);
        if (command) onCommandRef.current(command, transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        // The patient said no to the microphone. Retrying would just re-prompt.
        stopped = true;
        setStatus("denied");
        return;
      }
      // "no-speech", "aborted" and "network" are all routine here — someone
      // exercising is quiet for long stretches. `onend` handles the restart.
      if (event.error !== "no-speech" && event.error !== "aborted") setStatus("error");
    };

    recognition.onend = () => {
      if (stopped) return;
      setStatus("restarting");
      restartTimer = window.setTimeout(() => {
        if (stopped) return;
        try {
          recognition.start();
          setStatus("listening");
        } catch {
          // Already started, or started too soon after ending. Harmless — the
          // next `onend` will try again.
        }
      }, RESTART_DELAY_MS);
    };

    try {
      recognition.start();
      setStatus("listening");
    } catch {
      setStatus("error");
    }

    return () => {
      stopped = true;
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      // `abort` rather than `stop`: stop waits to deliver a final result, and
      // a command arriving after the screen is gone has nowhere to go.
      recognition.abort();
    };
  }, [enabled, locale]);

  return { status, lastHeard };
}
