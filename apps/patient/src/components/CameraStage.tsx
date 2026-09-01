import type { ReactNode } from "react";
import type { CaptureQuality } from "@ai-rehab/contracts";
import { SkeletonOverlay } from "./SkeletonOverlay.js";
import type { LiveSessionState, SignalStatus } from "../hooks/useLiveSession.js";

/**
 * The live camera stage — the hero element of both the setup and session
 * screens. Renders the patient's own camera feed with the tracked skeleton
 * over it, plus whatever status chrome the parent screen supplies.
 *
 * Privacy: the `<video>` is bound to the local `MediaStream` and nothing
 * else reads it. There is no canvas capture of the video, no `toDataURL`, no
 * recorder, and no upload path anywhere in this component (ADR-0002).
 */

const STATUS_STYLE: Record<
  SignalStatus,
  { ring: string; chip: string; dot: string; label: string }
> = {
  ok: {
    ring: "ring-2 ring-emerald-400/70",
    chip: "bg-emerald-500/90 text-white",
    dot: "bg-white",
    label: "Tracking"
  },
  insufficient: {
    ring: "ring-2 ring-amber-400/80",
    chip: "bg-amber-500/95 text-white",
    dot: "bg-white",
    label: "Adjust position"
  },
  no_person: {
    ring: "ring-2 ring-slate-400/50",
    chip: "bg-slate-700/90 text-white",
    dot: "bg-slate-300",
    label: "No one in view"
  },
  pending: {
    ring: "ring-1 ring-white/10",
    chip: "bg-slate-700/90 text-white",
    dot: "bg-slate-300",
    label: "Starting"
  }
};

export function CameraStage({
  liveState,
  signalStatus,
  attachVideo,
  showSkeleton = true,
  fullBleed = false,
  topLeft,
  topRight,
  bottom,
  children
}: {
  liveState: LiveSessionState;
  signalStatus: SignalStatus;
  attachVideo: (el: HTMLVideoElement | null) => void;
  showSkeleton?: boolean;
  /** M4/M5: edge-to-edge and square-cornered, the camera as the screen rather than a card on it. */
  fullBleed?: boolean;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottom?: ReactNode;
  /** Free-positioned overlays (readouts, progress strips) that own their own placement. */
  children?: ReactNode;
}) {
  const { cameraStatus, workerStatus, landmarks, captureQuality, videoSize } = liveState;
  const style = STATUS_STYLE[signalStatus];

  const isBooting =
    cameraStatus === "idle" || cameraStatus === "requesting" || workerStatus === "loading";

  return (
    <div
      className={`relative w-full overflow-hidden bg-night transition-shadow ${
        fullBleed ? "" : `rounded-xl shadow-lift ${style.ring}`
      }`}
      style={fullBleed ? { flex: "1 1 auto", minHeight: 0 } : { aspectRatio: "4 / 3" }}
    >
      {/*
        Mirrored for a natural selfie view. This is a CSS transform on
        presentation only — the pixels handed to the pose worker, and every
        coordinate derived from them, are unmirrored.
      */}
      <video
        ref={attachVideo}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: "scaleX(-1)" }}
        muted
        playsInline
        autoPlay
      />

      {showSkeleton && (
        <SkeletonOverlay
          landmarks={landmarks}
          landmarkChecks={captureQuality?.landmarkChecks}
          videoSize={videoSize}
        />
      )}

      {/* Legibility scrim behind the overlay chrome, top and bottom only. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-8 p-12">
        <div className="min-w-0">{topLeft}</div>
        <div className="flex shrink-0 items-center gap-8">
          {topRight}
          <span
            className={`inline-flex items-center gap-4 rounded-pill px-12 py-4 text-b2 font-medium shadow-sm backdrop-blur-sm ${style.chip}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${style.dot} ${signalStatus === "ok" ? "animate-pulse" : ""}`}
            />
            {style.label}
          </span>
        </div>
      </div>

      {children}

      {bottom && <div className="absolute inset-x-0 bottom-0 p-12">{bottom}</div>}

      {isBooting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-12 bg-night/85 backdrop-blur-sm">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <span className="text-b2 text-white/90">
            {cameraStatus === "requesting"
              ? "Waiting for camera permission…"
              : workerStatus === "loading"
                ? "Loading on-device pose model…"
                : "Starting camera…"}
          </span>
          <span className="px-24 text-center text-cap text-white/60">
            Pose tracking runs on your device. Your video never leaves it.
          </span>
        </div>
      )}
    </div>
  );
}

/** The single most important thing to tell the patient right now. */
export function primaryGuidance(
  captureQuality: CaptureQuality | null,
  signalStatus: SignalStatus
): string {
  if (signalStatus === "pending") return "Getting your camera ready…";
  if (signalStatus === "no_person") return "Step into view so the camera can see you.";
  if (!captureQuality) return "Getting your camera ready…";

  // Guidance is pre-sorted worst-first by the framing validator.
  const worst =
    captureQuality.guidance.find((g) => g.severity === "fail") ??
    captureQuality.guidance.find((g) => g.severity === "warn") ??
    captureQuality.guidance[0];
  return worst?.message ?? "Great positioning.";
}
