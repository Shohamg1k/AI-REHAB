import { LOCALES, localeInfo } from "@ai-rehab/contracts";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { useBundledVoice, useSpeechPrefs, useVoices } from "../hooks/useSpeechPrefs.js";
import { isVoiceCommandsSupported } from "../hooks/useVoiceCommands.js";
import { strings } from "../lib/i18n/ui.js";
import {
  MAX_RATE,
  MIN_RATE,
  isSpeechSupported,
  previewVoice,
  voiceCoverage,
  voicesForLocale
} from "../lib/speech.js";

/**
 * H9 — the patient chooses the language they are coached in and the voice
 * that speaks it.
 *
 * Two things here are honesty rather than decoration, and both should survive
 * a redesign:
 *
 * 1. **The unreviewed-translation note.** Nobody fluent has read the Spanish,
 *    Hindi or French strings. That is the same posture as PROVISIONAL_NOTE on
 *    the exercise ranges, and it is stated for the same reason.
 * 2. **The missing-voice warning.** Which voices exist is the operating
 *    system's business. If the device has no Hindi voice, the app says so and
 *    explains that cues will be *shown* in Hindi and *spoken* in English,
 *    rather than leaving the patient to work out why the coach switched
 *    language mid-set.
 */
export function VoiceSettingsCard() {
  const { prefs, t, update } = useSpeechPrefs();
  const voices = useVoices();
  const bundled = useBundledVoice(prefs.locale);

  const info = localeInfo(prefs.locale);
  const available = voicesForLocale(prefs.locale, voices);
  const coverage = voiceCoverage(prefs, voices);

  if (!isSpeechSupported()) return null;

  return (
    <div className="ds-card flex flex-col gap-14">
      <div className="flex items-center gap-9">
        <span className="flex h-26 w-26 flex-none items-center justify-center rounded-sm bg-teal-wash text-teal-deep">
          <Icon name="sound" size={15} />
        </span>
        <span className="ds-label">{t.settings.title}</span>
      </div>

      <label className="flex flex-col gap-6">
        <span className="text-b2 text-ink-2">{t.settings.language}</span>
        <select
          value={prefs.locale}
          onChange={(e) => {
            // Clearing voiceURI matters: a voice saved under the old language
            // must not survive the switch. resolveVoice would reject it
            // anyway, but leaving stale state around invites the next bug.
            update({ locale: e.target.value as typeof prefs.locale, voiceURI: null });
          }}
          className="min-h-touch rounded bg-sunk px-12 text-b1 text-ink shadow-hair"
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName}
            </option>
          ))}
        </select>
      </label>

      {!info.reviewed && <p className="text-cap text-ink-3">{t.settings.unreviewedNote}</p>}

      <label className="flex flex-col gap-6">
        <span className="text-b2 text-ink-2">{t.settings.voice}</span>
        <select
          value={prefs.voiceURI ?? ""}
          disabled={available.length === 0}
          onChange={(e) => update({ voiceURI: e.target.value || null })}
          className="min-h-touch rounded bg-sunk px-12 text-b1 text-ink shadow-hair disabled:opacity-50"
        >
          <option value="">{t.settings.browserDefault}</option>
          {available.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      {/*
        ADR-0011. A staged voice makes the missing-device-voice warning wrong:
        the language *is* available, just not from the operating system. The
        licence is shown rather than buried because this particular voice is
        non-commercial, and whoever deploys this needs to know that without
        reading the repo.
      */}
      {bundled ? (
        <div className="ds-sunk flex flex-col gap-6">
          <span className="text-b2 text-ink">
            {t.settings.bundledVoice(info.nativeName)}
          </span>
          <span className="text-cap text-ink-3">
            {bundled.id} · {bundled.licence}
            {bundled.nonCommercial ? ` · ${t.settings.nonCommercial}` : ""}
          </span>
          <span className="text-cap text-ink-3">{bundled.attribution}</span>
        </div>
      ) : (
        coverage === "missing" && (
          <p className="ds-sunk text-b2 text-ink-2">{t.settings.noVoice(info.nativeName)}</p>
        )
      )}

      <label className="flex flex-col gap-6">
        <span className="text-b2 text-ink-2">
          {t.settings.speed} · {prefs.rate.toFixed(2)}×
        </span>
        <input
          type="range"
          min={MIN_RATE}
          max={MAX_RATE}
          step={0.05}
          value={prefs.rate}
          onChange={(e) => update({ rate: Number(e.target.value) })}
          className="accent-teal"
        />
        <span className="flex justify-between text-cap text-ink-3">
          <span>{t.settings.slower}</span>
          <span>{t.settings.faster}</span>
        </span>
      </label>

      <Button
        variant="secondary"
        small
        onClick={() => previewVoice(prefs, (locale) => strings(locale).settings.sample)}
      >
        <Icon name="sound" size={15} />
        {t.settings.test}
      </Button>

      {/*
        C7. Off by default and switched on only here, deliberately: in every
        shipping browser `SpeechRecognition` streams microphone audio to the
        vendor's servers, so this is a network decision as much as a
        microphone one. The patient is told that in plain words before the
        switch, not in a policy page after it. See ADR-0010.
      */}
      <div className="ds-sunk flex flex-col gap-9">
        <span className="ds-label">{t.voice.title}</span>
        {isVoiceCommandsSupported() ? (
          <>
            <label className="flex items-start gap-9">
              <input
                type="checkbox"
                checked={prefs.commandsEnabled}
                onChange={(e) => update({ commandsEnabled: e.target.checked })}
                className="mt-2 h-16 w-16 flex-none accent-teal"
              />
              <span className="text-b2 text-ink">{t.voice.enable}</span>
            </label>
            <p className="text-cap text-ink-3">{t.voice.examples}</p>
            <p className="text-cap text-ink-3">{t.voice.privacy}</p>
            <p className="text-cap text-ink-3">{t.voice.blockedNote}</p>
          </>
        ) : (
          <p className="text-cap text-ink-3">{t.voice.unsupported}</p>
        )}
      </div>
    </div>
  );
}
