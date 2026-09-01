import type { SafetyVerdict } from "@ai-rehab/contracts";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
import { useSpeechPrefs } from "../hooks/useSpeechPrefs.js";
import { localiseSafetyReason } from "../lib/i18n/safetyReason.js";
import { interpolate } from "../lib/i18n/interpolate.js";

/**
 * M6 — `Banner/Safety Block` (E1 + E3), as the design's bottom sheet.
 *
 * docs/UX-SPEC.md §3: "states the reason and the escalation path; never
 * 'push through'." This is the only component allowed in the primary-action
 * slot while it is showing (§1), and — CLAUDE.md invariant 3 — **nothing
 * here may offer a way to continue the set**. Every action is stop, switch,
 * or end. That is the whole point of the component: a veto that the UI
 * cannot quietly soften.
 *
 * The design attributes the cap to a named clinician ("the 90° cap Ruth
 * set"). It is stated here without attribution, because the thresholds come
 * from the exercise spec and no clinician has reviewed them yet — see
 * docs/STATUS.md on provisional specs.
 *
 * H9: every string here is localised, including `verdict.reason`. This is the
 * one screen a patient must understand on sight, so it is not a place to fall
 * back to English while the cues are in their language. The *persisted*
 * verdict is untouched — see localiseSafetyReason.
 */
export function SafetyBlockBanner({
  verdict,
  onEndExercise
}: {
  verdict: SafetyVerdict;
  onEndExercise: () => void;
}) {
  const { locale, t } = useSpeechPrefs();

  if (verdict.verdict !== "block" && verdict.verdict !== "escalate") return null;

  const isEscalate = verdict.verdict === "escalate";

  return (
    <div
      role="alert"
      className="-mx-12 -mb-12 flex flex-col gap-14 rounded-t-xl bg-surf p-20"
    >
      <div className="flex items-start gap-11">
        <span className="flex h-34 w-34 flex-none items-center justify-center rounded bg-dang-wash text-dang">
          <Icon name="shield" size={19} />
        </span>
        <div className="flex flex-col gap-3">
          <h2 className="text-h1 text-dang">
            {isEscalate ? t.safety.escalateTitle : t.safety.blockTitle}
          </h2>
          <p className="text-b2 text-ink-2">{localiseSafetyReason(verdict, locale)}</p>
          {verdict.threshold && (
            <p className="text-b2 text-ink-2">
              {interpolate(t.safety.thresholdReached, {
                name: verdict.threshold.name,
                observed: (
                  <span className="font-mono font-semibold text-ink">
                    {verdict.threshold.observed.toFixed(0)}
                  </span>
                ),
                limit: (
                  <span className="font-mono font-semibold text-ink">
                    {verdict.threshold.limit.toFixed(0)}
                  </span>
                )
              })}
            </p>
          )}
        </div>
      </div>

      <div className="ds-sunk flex flex-col gap-7">
        <span className="ds-label">{t.safety.ifItHurts}</span>
        <p className="text-b2 text-ink-2">{t.safety.ifItHurtsBody}</p>
      </div>

      <div className="flex flex-col gap-6">
        <span className="ds-label">{t.safety.writtenToLog}</span>
        {/* A log entry, not a restatement — the reason is already above, and
            repeating it here just made the sheet say the same thing twice. */}
        <p className="font-mono text-[11.5px] leading-[1.6] uppercase text-ink-2">
          {isEscalate ? t.safety.escalated : t.safety.blocked}
          {verdict.threshold
            ? ` · ${verdict.threshold.name} ${verdict.threshold.observed.toFixed(0)} > cap ${verdict.threshold.limit.toFixed(0)}`
            : ""}
          <br />
          {t.safety.reasonAttached}
        </p>
      </div>

      <div className="flex flex-col gap-9">
        <Button variant="danger" onClick={onEndExercise}>
          {t.safety.endExercise}
        </Button>
        <p className="text-cap text-ink-3">
          {isEscalate ? t.safety.escalateFooter : t.safety.blockFooter}
        </p>
      </div>
    </div>
  );
}
