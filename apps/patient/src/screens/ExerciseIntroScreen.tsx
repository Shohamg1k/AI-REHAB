import {
  describeLandmarks,
  joinPhrases,
  landmarksForJoints,
  type ExerciseSpec
} from "@ai-rehab/contracts";
import { EXERCISES } from "@ai-rehab/exercises";
import { Button } from "../components/Button.js";
import { Chip } from "../components/Chip.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { Icon } from "../components/Icon.js";
import { ReferenceMediaCard } from "../components/ReferenceMediaCard.js";

/**
 * M3 — Why this exercise. What it is, why it is this one, what good looks
 * like, and the limit that will stop the set — all *before* asking for the
 * camera. Asking for a camera is a big request; earning it with context
 * first is both better product and better consent.
 *
 * The design's "Ruth's limit for you" is attributed to a named clinician.
 * Here it is drawn from the exercise's own safety thresholds and attributed
 * accordingly, because on a guest device no clinician set it — claiming one
 * did would invent a person.
 */

/** The joint caps the safety gate will actually enforce, in patient words. */
function describeLimits(spec: ExerciseSpec): string | null {
  const parts: string[] = [];
  for (const [joint, angle] of Object.entries(spec.safety.maxAngle ?? {})) {
    parts.push(`${joint.replace(/_/g, " ")} capped at ${angle}°`);
  }
  if (spec.safety.maxTrunkLean !== undefined) {
    parts.push(`trunk lean capped at ${spec.safety.maxTrunkLean}°`);
  }
  if (parts.length === 0) return null;
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. We pause the set if you go past it.`;
}

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
  const index = EXERCISES.findIndex((e) => e.id === spec.id);
  const limits = describeLimits(spec);
  const steps = spec.referenceMedia?.keyPoints ?? [];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex items-center gap-12 px-20 pb-12 pt-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Choose a different exercise"
          className="text-ink"
        >
          <Icon name="chevron" size={20} className="rotate-180" />
        </button>
        {index >= 0 && (
          <span className="font-mono text-[11.5px] uppercase text-ink-3">
            Exercise {index + 1} of {EXERCISES.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-13 px-20">
        {/* `compact` suppresses the card's own bullet list — the numbered
            "What good looks like" steps below own those cues on this screen,
            and rendering both showed every cue twice. */}
        {spec.referenceMedia && <ReferenceMediaCard media={spec.referenceMedia} compact />}

        <div className="flex flex-col gap-6">
          <h1 className="text-h1 text-ink">{spec.displayName}</h1>
          <div className="flex flex-wrap items-center gap-6">
            <Chip tone="teal">{spec.targetRegions.join(" · ").toUpperCase()}</Chip>
            <Chip tone="mute">{spec.movementType.toUpperCase()}</Chip>
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-md bg-teal-wash p-14">
          <span className="ds-label text-teal-deep">Why this one</span>
          <p className="text-b1 text-teal-deep">{spec.rationale}</p>
        </div>

        {steps.length > 0 && (
          <div className="flex flex-col gap-9">
            <span className="ds-label">What good looks like</span>
            {steps.map((step, i) => (
              <div key={step} className="flex items-start gap-9">
                <span className="mt-2 font-mono text-[11.5px] text-teal">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-b2 text-ink-2">{step}</span>
              </div>
            ))}
          </div>
        )}

        {limits && (
          <div className="flex flex-col gap-6 rounded-md bg-warn-wash p-14">
            <div className="flex items-center gap-6">
              <Icon name="shield" size={14} className="text-warn" />
              <span className="ds-label text-warn">Your limit for this exercise</span>
            </div>
            <p className="text-b2 text-[#7A4208]">{limits}</p>
          </div>
        )}

        <div className="ds-card-hair flex flex-col gap-6">
          <span className="ds-label">Camera setup</span>
          <p className="text-b2 text-ink">
            {spec.setup.framingHint ??
              (needed
                ? `Keep ${needed} in view of the camera.`
                : "Position yourself in view of the camera.")}
          </p>
          <p className="text-cap text-ink-3">
            You don't need your whole body in frame — only what this exercise measures.
          </p>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-18 pt-20">
        <Button onClick={onStart}>
          <Icon name="cam" size={18} />
          Set up camera
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="p-6 text-center text-[14.5px] font-medium text-teal"
        >
          Swap or skip this exercise
        </button>
        <Disclaimer>Coaching aid — not a medical device.</Disclaimer>
      </div>
    </div>
  );
}
