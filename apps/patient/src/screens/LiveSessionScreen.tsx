import type { ExerciseSpec } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR } from "@ai-rehab/core";
import { localiseCue } from "@ai-rehab/exercises";
import { signalStatusOf, type LiveSessionState } from "../hooks/useLiveSession.js";
import { CameraStage, primaryGuidance } from "../components/CameraStage.js";
import { Icon } from "../components/Icon.js";
import { useSpeechPrefs } from "../hooks/useSpeechPrefs.js";

/**
 * M5 — the live coached session (A1–A4, B5). The camera *is* the screen:
 * everything else is an overlay on it, so the patient's attention stays on
 * their own movement rather than on chrome beside it.
 *
 * Only one coaching message is shown at a time, in a fixed priority order:
 * safety block > tracking lost > form cue. Stacking them would be noise at
 * exactly the moment the patient can least afford it.
 *
 * The design's per-rep tick strip is driven by real scores here: a rep is
 * green when it scored well, amber when it scored poorly, and grey while
 * it has not happened yet. Reps that could not be scored confidently are
 * shown as unscored rather than being coloured as if they had been judged.
 */

function repTone(rep: { score: { score: number; confidence: number } } | undefined): string {
  if (!rep) return "rgba(255,255,255,.2)";
  if (rep.score.confidence < FORM_SCORE_CONFIDENCE_FLOOR) return "rgba(255,255,255,.42)";
  if (rep.score.score >= 80) return "#4ED6A8";
  if (rep.score.score >= 55) return "#F0B44C";
  return "#E8845A";
}

export function LiveSessionScreen({
  spec,
  liveState,
  countdown,
  targetReps,
  paused,
  listening,
  attachVideo,
  onBookmarkPain,
  onEndExercise
}: {
  spec: ExerciseSpec;
  liveState: LiveSessionState;
  /** Seconds until counting arms, or null once it has. */
  countdown: number | null;
  targetReps: number;
  /** The patient asked to stop. Distinct from a safety block. */
  paused: boolean;
  /** C7 — the microphone is on and listening for commands. */
  listening: boolean;
  attachVideo: (el: HTMLVideoElement | null) => void;
  onBookmarkPain: () => void;
  onEndExercise: () => void;
}) {
  const { captureQuality, activeCue, reps } = liveState;
  const { locale, t } = useSpeechPrefs();
  const lastRep = reps[reps.length - 1] ?? null;
  const counting = countdown !== null;
  const signalStatus = signalStatusOf(liveState);
  const trackingLost = signalStatus === "insufficient" || signalStatus === "no_person";
  const scored = lastRep && lastRep.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR;

  return (
    <div className="ds-stage-shell">
      <CameraStage
        liveState={liveState}
        signalStatus={signalStatus}
        attachVideo={attachVideo}
        fullBleed
        // M6: while blocked the pose overlay is suppressed. Tracking output
        // is coaching, and coaching has stopped — leaving a live skeleton
        // running would suggest the set is still being judged.
        topLeft={
          <div className="flex items-center gap-14">
            <button type="button" onClick={onEndExercise} aria-label="End set" className="text-white">
              <Icon name="chevron" size={28} className="rotate-180" />
            </button>
            <div className="flex flex-col gap-2">
              <span className="ds-stage-title text-white">{spec.displayName}</span>
              <span className="ds-stage-caption font-mono text-white/65">
                {paused
                  ? t.session.paused
                  : counting
                    ? t.session.notCountingYet
                    : `${reps.length} of ${targetReps} reps`}
              </span>
            </div>
            {listening && (
              <span
                className="ds-stage-caption flex items-center gap-6 rounded-sm bg-white/15 px-10 py-5 font-medium tracking-wide text-white/85"
                aria-label={t.voice.listening}
              >
                <span className="h-8 w-8 rounded-full bg-[#4ED6A8]" aria-hidden="true" />
                {t.voice.listening}
              </span>
            )}
          </div>
        }
        bottom={
          <div className="flex flex-col gap-10">
            {/* One message, chosen by priority — never a stack. */}
            {paused ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-14 rounded-lg bg-white/94 p-16 backdrop-blur-sm"
              >
                <span className="flex h-40 w-40 flex-none items-center justify-center rounded-sm bg-warn-wash text-warn">
                  <Icon name="sound" size={22} />
                </span>
                <span className="flex flex-col gap-2">
                  <span className="ds-stage-message text-ink">{t.session.paused}</span>
                  <span className="ds-stage-submessage text-ink-3">{t.session.notCountingYet}</span>
                </span>
              </div>
            ) : counting ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-14 rounded-lg bg-white/94 p-16 backdrop-blur-sm"
              >
                <span className="ds-stage-countdown-badge flex flex-none items-center justify-center rounded-sm bg-teal-wash font-mono text-teal-deep tabular-nums">
                  {countdown}
                </span>
                <span className="flex flex-col gap-2">
                  <span className="ds-stage-message text-ink">{t.session.getIntoPosition}</span>
                  <span className="ds-stage-submessage text-ink-3">
                    {t.session.startingIn} {countdown}s · {t.session.notCountingYet}
                  </span>
                </span>
              </div>
            ) : trackingLost ? (
              <div
                role="status"
                className="flex items-center gap-14 rounded-lg bg-white/94 p-16 backdrop-blur-sm"
              >
                <span className="flex h-40 w-40 flex-none items-center justify-center rounded-sm bg-warn-wash text-warn">
                  <Icon name="warning" size={22} />
                </span>
                <span className="ds-stage-message text-ink">
                  {primaryGuidance(captureQuality, signalStatus)}
                </span>
              </div>
            ) : activeCue ? (
              <div
                role="status"
                className="flex items-center gap-14 rounded-lg bg-white/94 p-16 backdrop-blur-sm"
              >
                <span className="flex h-40 w-40 flex-none items-center justify-center rounded-sm bg-warn-wash text-warn">
                  <Icon name="sound" size={22} />
                </span>
                <span className="flex flex-col gap-2">
                  <span className="ds-stage-message text-ink">
                    {localiseCue(activeCue.text, locale)}
                  </span>
                  <span className="ds-stage-submessage text-ink-3">{t.cue.captionNote}</span>
                </span>
              </div>
            ) : null}

            <button
                  type="button"
                  onClick={onBookmarkPain}
                  disabled={reps.length === 0}
                  className="ds-stage-action flex items-center justify-center gap-12 rounded-lg bg-[rgba(249,231,220,.96)] text-pain disabled:opacity-50"
                >
                  <span className="h-16 w-16 rounded-pill bg-pain" />
                  That one hurt
                </button>
                <span className="ds-stage-caption text-center font-mono text-white/55">
                  Tags this rep · we ask about it in the break
                </span>
                <button
                  type="button"
                  onClick={onEndExercise}
                  className="ds-stage-submessage flex min-h-[clamp(2.75rem,6vmin,4rem)] items-center justify-center gap-8 rounded bg-white/14 font-medium text-white"
                >
                  End set
                </button>
          </div>
        }
      >
        {/* Readouts sit below the header row rather than in a slot, so they
            keep their position whatever the header contains. */}
        {/*
          The readouts and the per-rep strip, in one flow rather than two
          absolutely-positioned layers at hardcoded offsets — the numbers
          resize with the viewport now, so anything pinned below them by a
          fixed pixel offset would drift.
        */}
        <div className="pointer-events-none absolute inset-x-18 top-[14%] flex flex-col gap-10">
          <div className="flex items-start justify-between">
            <div className="rounded bg-night/68 px-16 py-12 backdrop-blur-sm">
              <div className="ds-stage-count font-mono text-white tabular-nums">
                {String(reps.length).padStart(2, "0")}
              </div>
              <div className="ds-stage-caption font-mono text-white/65">of {targetReps} reps</div>
            </div>

            <div className="flex flex-col items-end rounded bg-night/68 px-16 py-12 backdrop-blur-sm">
              <div
                className="ds-stage-score font-mono tabular-nums"
                style={{ color: scored ? "#8DF0BE" : "rgba(255,255,255,.55)" }}
              >
                {scored ? Math.round(lastRep.score.score) : "—"}
              </div>
              <div className="ds-stage-caption font-mono text-white/65">
                {lastRep && !scored ? "unscored" : "form"}
              </div>
            </div>
          </div>

          {/* Per-rep progress, coloured by how each rep actually scored. */}
          <div className="flex gap-4">
            {Array.from({ length: targetReps }, (_, i) => (
              <span
                key={i}
                className="h-[clamp(0.375rem,1.1vmin,0.75rem)] flex-1 rounded-xs"
                style={{ background: repTone(reps[i]) }}
              />
            ))}
          </div>
        </div>
      </CameraStage>
    </div>
  );
}
