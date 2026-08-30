import {
  describeLandmarks,
  joinPhrases,
  landmarksForJoints,
  type ExerciseSpec
} from "@ai-rehab/contracts";
import { Button } from "../components/Button.js";
import { ReferenceMediaCard } from "../components/ReferenceMediaCard.js";

/**
 * Step 1 of the camera flow — what the exercise is, how it looks, and what
 * the camera will need to see, all *before* asking for camera permission.
 * Asking for a camera is a big request; earning it with context first is
 * both better product and better consent.
 */
export function ExerciseIntroScreen({
  spec,
  onStart,
  onBack
}: {
  spec: ExerciseSpec;
  onStart: () => void;
  onBack: () => void;
}) {
  const required = spec.setup.requiredLandmarks?.length
    ? spec.setup.requiredLandmarks
    : landmarksForJoints(spec.setup.requiredJoints);
  const needed = joinPhrases(describeLandmarks(required));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-20 px-16 py-24">
      <div className="flex flex-col gap-4">
        <span className="text-label uppercase tracking-wide text-brand">Before you start</span>
        <h1 className="text-heading-24 text-text-primary">{spec.displayName}</h1>
        <p className="text-body text-text-secondary">{spec.rationale}</p>
      </div>

      {spec.referenceMedia && <ReferenceMediaCard media={spec.referenceMedia} />}

      <div className="flex flex-col gap-8 rounded-lg border border-brand-border bg-brand-soft p-16">
        <span className="text-label uppercase tracking-wide text-brand">Camera setup</span>
        <p className="text-body-sm text-text-primary">
          {spec.setup.framingHint ??
            (needed ? `Keep ${needed} in view of the camera.` : "Position yourself in view of the camera.")}
        </p>
        <p className="text-caption text-text-muted">
          You don't need your whole body in frame — only what this exercise measures.
        </p>
      </div>

      <div className="flex items-start gap-12 rounded-lg border border-border bg-surface p-16">
        <span aria-hidden className="text-title">
          🔒
        </span>
        <div className="flex flex-col gap-4">
          <span className="text-body-md text-text-primary">Your camera stays private</span>
          <p className="text-caption text-text-secondary">
            Movement is analysed on your device. Your video is never recorded, uploaded, or sent
            anywhere — only counts, angles and scores are saved.
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-8">
        <Button onClick={onStart}>Turn on camera</Button>
        <Button variant="secondary" onClick={onBack}>
          Choose a different exercise
        </Button>
      </div>
    </div>
  );
}
