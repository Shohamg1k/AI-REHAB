import type { ExerciseSpec } from "@ai-rehab/contracts";
import { signalStatusOf, type LiveSessionState } from "../hooks/useLiveSession.js";
import { CameraStage, primaryGuidance } from "../components/CameraStage.js";
import { FramingChecklist } from "../components/FramingChecklist.js";
import { ReferenceMediaDisclosure } from "../components/ReferenceMediaCard.js";
import { Button } from "../components/Button.js";

/**
 * A7 — camera setup coach (steps 3–5 of the flow). The patient sees their
 * own camera, gets guidance specific to *this exercise's* required
 * landmarks, and can only start once those are actually visible.
 */
export function CameraSetupScreen({
  spec,
  liveState,
  attachVideo,
  onContinue,
  onBack
}: {
  spec: ExerciseSpec;
  liveState: LiveSessionState;
  attachVideo: (el: HTMLVideoElement | null) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { cameraStatus, workerStatus, errorMessage, captureQuality } = liveState;

  if (cameraStatus === "denied" || workerStatus === "error") {
    const isPermission = cameraStatus === "denied";
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-16 px-16 py-24">
        <div className="flex flex-col gap-8 rounded-lg border border-line bg-surf p-20">
          <span aria-hidden className="text-h1">
            {isPermission ? "📷" : "⚠️"}
          </span>
          <h1 className="text-h1 text-ink">
            {isPermission ? "We need your camera" : "Couldn't start pose tracking"}
          </h1>
          <p className="text-b1 text-ink-2">
            {isPermission
              ? "Live coaching needs to see your movement. Your video stays on this device and is never uploaded."
              : "The on-device pose model failed to load."}
          </p>
          {errorMessage && (
            <p className="rounded-sm bg-sunk p-12 text-cap text-ink-3">{errorMessage}</p>
          )}
          <p className="text-cap text-ink-3">
            {isPermission
              ? "Allow camera access in your browser's address bar, then reload this page."
              : "Check your connection and reload the page to try again."}
          </p>
        </div>
        <Button variant="secondary" onClick={onBack}>
          Back to exercises
        </Button>
      </div>
    );
  }

  const signalStatus = signalStatusOf(liveState);
  const ready = signalStatus === "ok";
  const guidance = primaryGuidance(captureQuality, signalStatus);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-16 px-16 py-16">
      <div className="flex flex-col gap-4">
        <span className="text-b2 font-medium uppercase tracking-wide text-teal">Camera setup</span>
        <h1 className="text-h1 text-ink">{spec.displayName}</h1>
      </div>

      <CameraStage
        liveState={liveState}
        signalStatus={signalStatus}
        attachVideo={attachVideo}
        bottom={
          <div
            className={`rounded-md px-12 py-8 text-b2 shadow-lg backdrop-blur-sm transition-colors ${
              ready ? "bg-emerald-600/95 text-white" : "bg-slate-900/85 text-white"
            }`}
            role="status"
          >
            {ready ? "✓ Great positioning. You're ready." : guidance}
          </div>
        }
      />

      {captureQuality && (
        <div className="rounded-lg border border-line bg-surf p-16">
          <FramingChecklist captureQuality={captureQuality} />
        </div>
      )}

      {/*
        The tracking-rate readout. Deliberately on the setup screen only and
        not during the exercise itself, where a patient should be watching
        their form rather than a number. It exists because ADR-0007 and the
        M0 exit criterion both hang on a figure nobody has ever measured on
        real hardware — now anyone who opens this screen has it.
      */}
      {liveState.perf && (
        <p className="text-cap text-ink-3">
          Tracking at {liveState.perf.fps} fps · {liveState.perf.inferenceMsP50} ms per frame ·{" "}
          {liveState.perf.tier} model
          {liveState.videoSize
            ? ` · ${liveState.videoSize.width}×${liveState.videoSize.height} camera`
            : ""}
        </p>
      )}

      {spec.referenceMedia && <ReferenceMediaDisclosure media={spec.referenceMedia} />}

      <div className="mt-auto flex flex-col gap-8 pt-8">
        <Button onClick={onContinue} disabled={!captureQuality}>
          {ready ? "Start exercise" : "Start anyway"}
        </Button>
        {!ready && captureQuality && (
          <p className="text-cap text-ink-3">
            You can start now, but reps won't be scored while a required body part is out of view.
          </p>
        )}
      </div>
    </div>
  );
}
