import type { ExerciseSpec } from "@ai-rehab/contracts";
import type { LiveSessionState } from "../hooks/useLiveSession.js";
import { SkeletonCanvas } from "../components/SkeletonCanvas.js";
import { CaptureQualityBadge } from "../components/CaptureQualityBadge.js";
import { CoachingCueBanner } from "../components/CoachingCueBanner.js";
import { SafetyBlockBanner } from "../components/SafetyBlockBanner.js";
import { Button } from "../components/Button.js";

const TARGET_REPS = 8;

/** M5 — live session (A1-A4, A3, B5). The core of the product. */
export function LiveSessionScreen({
  spec,
  liveState,
  onBookmarkPain,
  onEndExercise
}: {
  spec: ExerciseSpec;
  liveState: LiveSessionState;
  onBookmarkPain: () => void;
  onEndExercise: () => void;
}) {
  const { landmarks, captureQuality, safetyVerdict, activeCue, reps } = liveState;
  const lastRep = reps[reps.length - 1] ?? null;
  const isBlocked = safetyVerdict && (safetyVerdict.verdict === "block" || safetyVerdict.verdict === "escalate");

  return (
    <div className="flex flex-col gap-16 px-16 py-16 max-w-lg mx-auto w-full flex-1">
      <div className="flex items-center justify-between">
        <span className="text-title text-text-primary">{spec.displayName}</span>
        {captureQuality && <CaptureQualityBadge quality={captureQuality} />}
      </div>

      <div className="aspect-[4/3] w-full rounded-lg overflow-hidden bg-inverse relative">
        <SkeletonCanvas landmarks={landmarks} />
      </div>

      {isBlocked && safetyVerdict ? (
        <SafetyBlockBanner verdict={safetyVerdict} onEndExercise={onEndExercise} />
      ) : (
        <CoachingCueBanner cue={activeCue} />
      )}

      <div className="grid grid-cols-2 gap-12">
        <div className="bg-surface border border-border rounded-lg p-16 flex flex-col gap-4">
          <span className="text-label text-text-secondary">Reps</span>
          <span className="text-metric text-text-primary">
            {reps.length}
            <span className="text-body-sm text-text-muted"> / {TARGET_REPS}</span>
          </span>
        </div>
        <div className="bg-surface border border-border rounded-lg p-16 flex flex-col gap-4">
          <span className="text-label text-text-secondary">Last rep</span>
          {lastRep ? (
            lastRep.score.confidence < 0.5 ? (
              <span className="text-body-md text-text-muted">Not enough signal this rep</span>
            ) : (
              <span className="text-metric text-text-primary">{Math.round(lastRep.score.score)}</span>
            )
          ) : (
            <span className="text-body-md text-text-muted">—</span>
          )}
        </div>
      </div>

      {lastRep && lastRep.score.reason && (
        <p className="text-caption text-text-muted">{lastRep.score.reason}</p>
      )}

      <div className="flex-1" />

      <div className="flex flex-col gap-8">
        <Button variant="secondary" onClick={onBookmarkPain} disabled={reps.length === 0}>
          That one hurt
        </Button>
        <Button variant="secondary" onClick={onEndExercise} disabled={!!isBlocked}>
          End set
        </Button>
      </div>
    </div>
  );
}
