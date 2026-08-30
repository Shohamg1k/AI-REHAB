import type { ExerciseSpec } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR } from "@ai-rehab/core";
import { signalStatusOf, type LiveSessionState } from "../hooks/useLiveSession.js";
import { CameraStage, primaryGuidance } from "../components/CameraStage.js";
import { SafetyBlockBanner } from "../components/SafetyBlockBanner.js";
import { Button } from "../components/Button.js";

const TARGET_REPS = 8;

/**
 * M5 — the live coached session (A1–A4, B5). The camera is the hero; every
 * other element is a thin overlay or a compact strip beneath it, so the
 * patient's attention stays on their own movement.
 *
 * Only one coaching message is shown at a time, in a fixed priority order:
 * safety block > tracking lost > form cue > steady-state status. Stacking
 * them would be noise at exactly the moment the patient can least afford it.
 */
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
  const progress = Math.min(1, reps.length / TARGET_REPS);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-12 px-16 py-12">
      <div className="flex items-baseline justify-between gap-8">
        <h1 className="truncate text-title text-text-primary">{spec.displayName}</h1>
        <span className="shrink-0 text-caption text-text-muted">Set 1 of 1</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-subtle">
        <div
          className="h-full rounded-pill bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <CameraStage
        liveState={liveState}
        signalStatus={signalStatus}
        attachVideo={attachVideo}
        topLeft={
          <span className="rounded-pill bg-black/45 px-12 py-4 text-label text-white backdrop-blur-sm">
            {reps.length} / {TARGET_REPS} reps
          </span>
        }
        bottom={
          trackingLost && !isBlocked ? (
            <div
              role="status"
              className="flex items-center gap-8 rounded-md bg-amber-500/95 px-12 py-8 text-body-sm text-white shadow-lg backdrop-blur-sm"
            >
              <span aria-hidden>⚠</span>
              <span>{primaryGuidance(captureQuality, signalStatus)}</span>
            </div>
          ) : activeCue ? (
            <div
              role="status"
              className="flex items-center gap-8 rounded-md bg-brand/95 px-12 py-8 text-body-md text-white shadow-lg backdrop-blur-sm"
            >
              <span aria-hidden>💬</span>
              <span>{activeCue.text}</span>
            </div>
          ) : null
        }
      />

      {isBlocked && safetyVerdict && (
        <SafetyBlockBanner verdict={safetyVerdict} onEndExercise={onEndExercise} />
      )}

      {!isBlocked && (
        <div className="grid grid-cols-2 gap-12">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-16">
            <span className="text-label uppercase tracking-wide text-text-secondary">Reps</span>
            <span className="text-metric tabular-nums text-text-primary">
              {reps.length}
              <span className="text-body-sm text-text-muted"> / {TARGET_REPS}</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-16">
            <span className="text-label uppercase tracking-wide text-text-secondary">
              Last rep
            </span>
            {trackingLost ? (
              <span className="text-body-md text-amber-600">Tracking paused</span>
            ) : !lastRep ? (
              <span className="text-body-md text-text-muted">—</span>
            ) : scored ? (
              <span className="text-metric tabular-nums text-text-primary">
                {Math.round(lastRep.score.score)}
                <span className="text-body-sm text-text-muted"> / 100</span>
              </span>
            ) : (
              <span className="text-body-sm text-text-muted">Not enough signal to score</span>
            )}
          </div>
        </div>
      )}

      {!isBlocked && !trackingLost && lastRep && scored && lastRep.score.reason && (
        <p className="text-caption text-text-muted">{lastRep.score.reason}</p>
      )}

      <div className="mt-auto flex flex-col gap-8 pt-4">
        <Button variant="secondary" onClick={onBookmarkPain} disabled={reps.length === 0}>
          That one hurt
        </Button>
        <Button variant="secondary" onClick={onEndExercise} disabled={isBlocked}>
          End set
        </Button>
      </div>
    </div>
  );
}
