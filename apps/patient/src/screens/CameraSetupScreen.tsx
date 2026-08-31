import { signalStatusOf, type LiveSessionState } from "../hooks/useLiveSession.js";
import { CameraStage, primaryGuidance } from "../components/CameraStage.js";
import { FramingChecklist } from "../components/FramingChecklist.js";
import { Button } from "../components/Button.js";
import { Disclaimer } from "../components/Disclaimer.js";

/**
 * A7 — camera setup coach (steps 3–5 of the flow). The patient sees their
 * own camera, gets guidance specific to *this exercise's* required
 * landmarks, and can only start once those are actually visible.
 */
export function CameraSetupScreen({
  liveState,
  attachVideo,
  onContinue,
  onBack
}: {
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

  // The capture-quality meter: five ticks off the real 0-1 framing score,
  // so it moves for the same reason the checklist rows do.
  const filledTicks = captureQuality ? Math.max(1, Math.round(captureQuality.score * 5)) : 0;
  const meterTone = ready ? "#4ED6A8" : "#F0B44C";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col bg-night">
      <CameraStage
        liveState={liveState}
        signalStatus={signalStatus}
        attachVideo={attachVideo}
        fullBleed
        topLeft={
          <div className="flex flex-col gap-4 pr-24">
            <h1 className="text-h1 text-white">Set up your camera</h1>
            <p className="text-b2 text-white/70">
              Fifteen seconds. Every score today inherits this setup.
            </p>
          </div>
        }
        bottom={
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-6 rounded-xs bg-white/95 px-9 py-5 font-mono text-[11px] uppercase tracking-[.06em] shadow-lift"
              style={{ color: ready ? "#1F7A4D" : "#A75A0B" }}
              role="status"
            >
              <span
                className="h-7 w-7 rounded-pill"
                style={{ background: ready ? "#1F7A4D" : "#A75A0B" }}
              />
              {ready ? "Ready when you are" : guidance}
            </span>
          </div>
        }
      />

      <div className="flex flex-col gap-12 px-20 pt-16">
        {captureQuality && <FramingChecklist captureQuality={captureQuality} dark />}
      </div>

      <div className="flex flex-col gap-10 px-20 pb-18 pt-16">
        <div className="flex flex-col gap-6">
          <div className="flex items-center">
            <span className="flex-1 font-mono text-[11px] uppercase tracking-[.1em] text-white/55">
              Capture quality
            </span>
            <span className="font-mono text-[11px] uppercase" style={{ color: meterTone }}>
              {!captureQuality
                ? "Measuring"
                : ready
                  ? "Good"
                  : `Fair — ${guidance.toLowerCase()}`}
            </span>
          </div>
          <div className="flex gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="h-4 flex-1 rounded-xs"
                style={{ background: i < filledTicks ? meterTone : "rgba(255,255,255,.18)" }}
              />
            ))}
          </div>
        </div>

        <Button
          onClick={onContinue}
          disabled={!captureQuality}
          variant={ready ? "primary" : "dark"}
          className={ready ? "" : "text-white/45"}
        >
          {ready ? "Start exercise" : "Start when this turns green"}
        </Button>

        <Disclaimer icon="shield" className="text-white/50">
          {ready
            ? "Coaching aid — not a medical device."
            : "You can start anyway — the session is then marked low-confidence."}
        </Disclaimer>

        {/*
          The tracking-rate readout. Deliberately on the setup screen only and
          not during the exercise itself, where a patient should be watching
          their form rather than a number. It exists because ADR-0007 and the
          M0 exit criterion both hang on a figure nobody has ever measured on
          real hardware — now anyone who opens this screen has it.
        */}
        {liveState.perf && (
          <p className="font-mono text-[10.5px] uppercase text-white/40">
            {liveState.perf.fps} fps · {liveState.perf.inferenceMsP50} ms/frame ·{" "}
            {liveState.perf.tier}
            {liveState.videoSize
              ? ` · ${liveState.videoSize.width}×${liveState.videoSize.height}`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
