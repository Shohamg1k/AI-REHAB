import type { ExerciseSpec } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR } from "@ai-rehab/core";
import { signalStatusOf, type LiveSessionState } from "../hooks/useLiveSession.js";
import { CameraStage, primaryGuidance } from "../components/CameraStage.js";
import { SafetyBlockBanner } from "../components/SafetyBlockBanner.js";
import { Icon } from "../components/Icon.js";

const TARGET_REPS = 8;

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
  attachVideo,
  onBookmarkPain,
  onEndExercise
}: {
  spec: ExerciseSpec;
  liveState: LiveSessionState;
  attachVideo: (el: HTMLVideoElement | null) => void;
  onBookmarkPain: () => void;
  onEndExercise: () => void;
}) {
  const { captureQuality, safetyVerdict, activeCue, reps } = liveState;
  const lastRep = reps[reps.length - 1] ?? null;
  const isBlocked =
    !!safetyVerdict && (safetyVerdict.verdict === "block" || safetyVerdict.verdict === "escalate");

  const signalStatus = signalStatusOf(liveState);
  const trackingLost = signalStatus === "insufficient" || signalStatus === "no_person";
  const scored = lastRep && lastRep.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR;

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col bg-night">
      <CameraStage
        liveState={liveState}
        signalStatus={signalStatus}
        attachVideo={attachVideo}
        fullBleed
        // M6: while blocked the pose overlay is suppressed. Tracking output
        // is coaching, and coaching has stopped — leaving a live skeleton
        // running would suggest the set is still being judged.
        showSkeleton={!isBlocked}
        topLeft={
          <div className="flex items-center gap-12">
            <button type="button" onClick={onEndExercise} aria-label="End set" className="text-white">
              <Icon name="chevron" className="h-20 w-20 rotate-180" />
            </button>
            <div className="flex flex-col">
              <span className="text-[16px] font-semibold text-white">{spec.displayName}</span>
              <span
                className={`font-mono text-[11px] uppercase ${
                  isBlocked ? "text-[#F2A79C]" : "text-white/60"
                }`}
              >
                {isBlocked ? "Paused by safety" : `${reps.length} of ${TARGET_REPS} reps`}
              </span>
            </div>
          </div>
        }
        bottom={
          <div className="flex flex-col gap-10">
            {/* One message, chosen by priority — never a stack. */}
            {isBlocked && safetyVerdict ? (
              <SafetyBlockBanner verdict={safetyVerdict} onEndExercise={onEndExercise} />
            ) : trackingLost ? (
              <div
                role="status"
                className="flex items-center gap-11 rounded-lg bg-white/94 p-11 backdrop-blur-sm"
              >
                <span className="flex h-26 w-26 flex-none items-center justify-center rounded-sm bg-warn-wash text-warn">
                  <Icon name="warning" className="h-15 w-15" />
                </span>
                <span className="text-[13.5px] font-medium text-ink">
                  {primaryGuidance(captureQuality, signalStatus)}
                </span>
              </div>
            ) : activeCue ? (
              <div
                role="status"
                className="flex items-center gap-11 rounded-lg bg-white/94 p-11 backdrop-blur-sm"
              >
                <span className="flex h-26 w-26 flex-none items-center justify-center rounded-sm bg-warn-wash text-warn">
                  <Icon name="sound" className="h-15 w-15" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[13.5px] font-medium text-ink">{activeCue.text}</span>
                  <span className="text-[11px] text-ink-3">spoken cue · always captioned</span>
                </span>
              </div>
            ) : null}

            {!isBlocked && (
              <>
                <button
                  type="button"
                  onClick={onBookmarkPain}
                  disabled={reps.length === 0}
                  className="flex h-[74px] items-center justify-center gap-10 rounded-lg bg-[rgba(249,231,220,.96)] disabled:opacity-50"
                >
                  <span className="h-13 w-13 rounded-pill bg-pain" />
                  <span className="text-[19px] font-semibold text-pain">That one hurt</span>
                </button>
                <span className="text-center font-mono text-[10.5px] uppercase tracking-[.04em] text-white/55">
                  Tags this rep · we ask about it in the break
                </span>
                <button
                  type="button"
                  onClick={onEndExercise}
                  className="flex h-[46px] items-center justify-center gap-8 rounded bg-white/14 text-b2 font-medium text-white"
                >
                  End set
                </button>
              </>
            )}
          </div>
        }
      >
        {/* Flat dim, not a gradient — the camera keeps running so the
            patient can still see themselves, but nothing on top of it is
            claiming to measure anything any more. */}
        {isBlocked && <div className="pointer-events-none absolute inset-0 bg-night/72" />}

        {/* Readouts sit below the header row rather than in a slot, so they
            keep their position whatever the header contains. */}
        {!isBlocked && (
        <div className="pointer-events-none absolute inset-x-18 top-[92px] flex items-start justify-between">
          <div className="rounded bg-night/68 px-14 py-10 backdrop-blur-sm">
            <div className="font-mono text-[38px] font-semibold leading-none tracking-[-.03em] text-white">
              {String(reps.length).padStart(2, "0")}
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-[.09em] text-white/65">
              of {TARGET_REPS} reps
            </div>
          </div>

          <div className="flex flex-col items-end rounded bg-night/68 px-14 py-10 backdrop-blur-sm">
            <div
              className="font-mono text-[26px] font-semibold leading-none"
              style={{ color: scored ? "#8DF0BE" : "rgba(255,255,255,.55)" }}
            >
              {scored ? Math.round(lastRep.score.score) : "—"}
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-[.09em] text-white/65">
              {lastRep && !scored ? "unscored" : "form"}
            </div>
          </div>
        </div>
        )}

        {/* Per-rep progress, coloured by how each rep actually scored. */}
        {!isBlocked && (
        <div className="pointer-events-none absolute inset-x-18 top-[188px] flex gap-3">
          {Array.from({ length: TARGET_REPS }, (_, i) => (
            <span
              key={i}
              className="h-4 flex-1 rounded-xs"
              style={{ background: repTone(reps[i]) }}
            />
          ))}
        </div>
        )}
      </CameraStage>
    </div>
  );
}
