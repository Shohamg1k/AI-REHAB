import type { ExerciseSpec } from "@ai-rehab/contracts";
import type { LiveSessionState } from "../hooks/useLiveSession.js";
import { SkeletonCanvas } from "../components/SkeletonCanvas.js";
import { CaptureQualityBadge } from "../components/CaptureQualityBadge.js";
import { Button } from "../components/Button.js";

/**
 * A7 — camera setup coach. Framing, lighting, required-joints check, and a
 * live quality score, before any scoring begins (docs/MVP-BUILD-PROMPT.md
 * §4 1.3 — "every downstream number inherits capture quality").
 */
export function CameraSetupScreen({
  spec,
  liveState,
  onContinue
}: {
  spec: ExerciseSpec;
  liveState: LiveSessionState;
  onContinue: () => void;
}) {
  const { cameraStatus, workerStatus, errorMessage, landmarks, captureQuality } = liveState;

  if (cameraStatus === "denied" || workerStatus === "error") {
    return (
      <div className="flex flex-col gap-16 px-16 py-24 max-w-lg mx-auto w-full">
        <h1 className="text-heading-20 text-text-primary">We need your camera</h1>
        <p className="text-body text-text-secondary">
          {errorMessage ?? "Camera access is required for live coaching."} Check your browser's
          site settings and reload the page to try again.
        </p>
      </div>
    );
  }

  const isLoading = cameraStatus !== "granted" || workerStatus !== "ready";
  const canContinue = !isLoading && !!captureQuality;
  const lowConfidence = !!captureQuality && captureQuality.score < 0.5;

  return (
    <div className="flex flex-col gap-16 px-16 py-24 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-heading-20 text-text-primary">Get in frame</h1>
        <p className="text-body-sm text-text-secondary mt-4">
          Stand where your whole body is visible, facing {spec.setup.view === "side" ? "sideways to" : ""} the
          camera.
        </p>
      </div>

      <div className="aspect-[4/3] w-full rounded-lg overflow-hidden bg-inverse relative">
        <SkeletonCanvas landmarks={landmarks} />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-body">
            {cameraStatus === "requesting" && "Requesting camera access…"}
            {cameraStatus === "granted" && workerStatus === "loading" && "Loading the pose model…"}
          </div>
        )}
      </div>

      {captureQuality && (
        <div className="bg-surface border border-border rounded-lg p-16 flex flex-col gap-12">
          <CaptureQualityBadge quality={captureQuality} />
          <ul className="text-body-sm text-text-secondary flex flex-col gap-4">
            <li>{captureQuality.framing === "ok" ? "✅" : "⚠️"} Framing</li>
            <li>{captureQuality.lighting === "ok" ? "✅" : "⚠️"} Lighting</li>
            <li>{captureQuality.missingJoints.length === 0 ? "✅" : "⚠️"} All required joints visible</li>
          </ul>
        </div>
      )}

      <Button onClick={onContinue} disabled={!canContinue}>
        {lowConfidence ? "Continue anyway" : "I'm ready"}
      </Button>
      {lowConfidence && (
        <p className="text-caption text-text-muted">
          Scores this session will be marked as low confidence. You can still practice — the
          coaching just won't be as precise.
        </p>
      )}
    </div>
  );
}
