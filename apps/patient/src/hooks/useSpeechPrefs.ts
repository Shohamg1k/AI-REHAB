import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@ai-rehab/contracts";
import {
  listVoices,
  loadSpeechPrefs,
  onVoicesChanged,
  saveSpeechPrefs,
  subscribeSpeechPrefs,
  type SpeechPrefs
} from "../lib/speech.js";
import { strings, type UiStrings } from "../lib/i18n/ui.js";

/**
 * H9 — the patient's voice and language choice, as a store rather than
 * component state, because two unrelated trees need it: the settings card
 * that sets it and the live session that captions with it.
 */
export function useSpeechPrefs(): {
  prefs: SpeechPrefs;
  locale: Locale;
  t: UiStrings;
  update: (patch: Partial<SpeechPrefs>) => void;
} {
  const prefs = useSyncExternalStore(subscribeSpeechPrefs, loadSpeechPrefs, () => loadSpeechPrefs());
  const update = useCallback((patch: Partial<SpeechPrefs>) => {
    saveSpeechPrefs(patch);
  }, []);
  return { prefs, locale: prefs.locale, t: strings(prefs.locale), update };
}

/**
 * The installed voice list, which arrives asynchronously: Chrome returns an
 * empty array from `getVoices()` until it fires `voiceschanged`. A picker that
 * reads it once renders empty on a machine with a dozen voices.
 */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh();
    return onVoicesChanged(refresh);
  }, []);
  return voices;
}
