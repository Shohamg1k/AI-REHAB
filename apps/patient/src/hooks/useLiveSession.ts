import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CaptureQuality,
  CoachingCue,
  FormScore,
  JointAngles,
  Landmark,
  RepEvent,
  SafetyVerdict
} from "@ai-rehab/contracts";
import { POSE_MODEL_TIER } from "virtual:pose-model-tier";
import { localiseCue } from "@ai-rehab/exercises";
import type { MainToWorkerMessage, WorkerToMainMessage } from "../worker/protocol.js";
import { speakLocalised, stopSpeaking } from "../lib/speech.js";
import { localiseSafetyReason } from "../lib/i18n/safetyReason.js";

/** Measured pipeline cost, surfaced so ADR-0007 can be closed with a number. */
export type PosePerf = {
  /** Median inference time over a recent window — median, not mean, so one GC pause doesn't dominate. */
  inferenceMsP50: number;
  /** Frames per second actually completing the full pipeline, not the rate we attempt. */
  fps: number;
  tier: string;
};

export type LiveSessionState = {
  cameraStatus: "idle" | "requesting" | "granted" | "denied" | "error";
  workerStatus: "idle" | "loading" | "ready" | "error";
  errorMessage: string | null;
  /** Landmark coordinates for the skeleton overlay. Never pixel data (ADR-0002). */
  landmarks: Landmark[] | null;
  personDetected: boolean;
  captureQuality: CaptureQuality | null;
  jointAngles: JointAngles | null;
  safetyVerdict: SafetyVerdict | null;
  activeCue: CoachingCue | null;
  reps: Array<{ rep: RepEvent; score: FormScore }>;
  /** Null until enough frames have completed to report a stable figure. */
  perf: PosePerf | null;
  /**
   * The stream's actual dimensions, which are whatever the camera decided to
   * give us — `getUserMedia` constraints are a request, not a guarantee. The
   * skeleton overlay needs them to map normalised landmarks onto a video the
   * browser may be cropping to fit its container.
   */
  videoSize: { width: number; height: number } | null;
};

/**
 * Whether the pipeline currently has enough signal to score. `tracking` and
 * `no_person` both mean "scoring is paused" — kept distinct because they
 * need different guidance ("reposition" vs "step back into view").
 */
export type SignalStatus = "ok" | "insufficient" | "no_person" | "pending";

export function signalStatusOf(state: LiveSessionState): SignalStatus {
  if (!state.captureQuality) return "pending";
  if (!state.personDetected) return "no_person";
  return state.captureQuality.requiredLandmarksOk ? "ok" : "insufficient";
}

/**
 * Median inference time and achieved frame rate over a rolling window.
 * Returns null below two completions, when there is no elapsed span to
 * divide by and any figure would be an artefact of the first frame.
 *
 * Exported for its own test: this is the number ADR-0007 will be closed
 * with, so it should not be the one part of the change nobody checked.
 */
export function computePerf(
  inferenceMs: readonly number[],
  completionTimes: readonly number[],
  tier: string
): PosePerf | null {
  if (inferenceMs.length === 0 || completionTimes.length < 2) return null;

  const sorted = [...inferenceMs].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)]!;

  const spanMs = completionTimes[completionTimes.length - 1]! - completionTimes[0]!;
  // Intervals, not samples: N completions bound N-1 gaps.
  const fps = spanMs > 0 ? ((completionTimes.length - 1) / spanMs) * 1000 : 0;

  return {
    inferenceMsP50: Math.round(p50 * 10) / 10,
    fps: Math.round(fps * 10) / 10,
    tier
  };
}

// Target the M0 spike's stated floor (docs/ROADMAP.md M0 exit criterion:
// "≥24fps on the worst device we intend to support") rather than 30 — this
// is a ceiling on how often we *send* frames, not a claim that the pipeline
// hits it; the real number needs the physical-device spike this environment
// cannot run. See docs/adr/0007-pose-model-tier.md.
const FRAME_INTERVAL_MS = 1000 / 24;

/**
 * How long to wait for a frame's result before assuming it will never come
 * and unblocking the capture loop.
 *
 * Only reachable if the worker dies mid-frame or a message is lost. Without
 * it, one lost result would freeze the preview permanently, which is a far
 * worse failure than processing one extra frame.
 *
 * Sized well above any plausible single frame rather than close to it:
 * measured steady-state inference is ~30ms with occasional ~150ms outliers,
 * and the one genuinely slow frame — the ~10s first inference — is now paid
 * during worker startup instead (see `warmUp` in poseWorker.ts). A timeout
 * that trips on a merely-slow frame would re-create the frame pile-up the
 * backpressure exists to prevent, so it errs long.
 */
const FRAME_STALL_TIMEOUT_MS = 5000;

/** Rolling window for the perf figures. ~2s of frames — long enough to be stable, short enough to track a real slowdown. */
const PERF_WINDOW = 30;

const INITIAL_STATE: LiveSessionState = {
  cameraStatus: "idle",
  workerStatus: "idle",
  errorMessage: null,
  landmarks: null,
  personDetected: false,
  captureQuality: null,
  jointAngles: null,
  safetyVerdict: null,
  activeCue: null,
  reps: [],
  perf: null,
  videoSize: null
};

/**
 * Owns the camera capture loop and the pose worker for one live session.
 *
 * Privacy boundary (ADR-0002), stated precisely because this is the one
 * place the raw stream exists:
 * - The `MediaStream` is attached directly to a `<video>` element for the
 *   patient to see, and is never read into any other sink.
 * - Each frame becomes a transient `ImageBitmap`, transferred to the pose
 *   worker, and closed there immediately after detection. It is never
 *   retained, encoded, uploaded, or written to storage.
 * - Nothing pixel-derived enters React state. What comes back out of the
 *   worker is landmark coordinates and derived metrics only.
 */
export function useLiveSession(exerciseId: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const cueClearTimerRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  /** Timestamp of the frame currently being processed, or null when the worker is idle. */
  const inFlightSinceRef = useRef<number | null>(null);
  const inferenceSamplesRef = useRef<number[]>([]);
  const completionTimesRef = useRef<number[]>([]);

  const [state, setState] = useState<LiveSessionState>(INITIAL_STATE);

  /**
   * Ref callback for the visible `<video>`. The patient must be able to see
   * themselves, so the stream is bound to a rendered element rather than an
   * offscreen one. Screens mount and unmount their own video element (setup
   * -> live), so binding happens here on every attach rather than once at
   * stream acquisition.
   */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    el.muted = true;
    el.playsInline = true;

    const recordSize = () => {
      if (!el.videoWidth || !el.videoHeight) return;
      setState((s) =>
        s.videoSize?.width === el.videoWidth && s.videoSize.height === el.videoHeight
          ? s
          : { ...s, videoSize: { width: el.videoWidth, height: el.videoHeight } }
      );
    };
    el.addEventListener("loadedmetadata", recordSize);
    recordSize(); // may already have metadata if this element is being re-attached

    if (streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      void el.play().catch(() => {
        /* autoplay can be refused until a gesture; the capture loop waits on readyState */
      });
    }
  }, []);

  const loop = useCallback(() => {
    const tick = (time: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      const worker = workerRef.current;
      if (!video || !worker || video.readyState < 2) return;
      if (time - lastFrameTimeRef.current < FRAME_INTERVAL_MS) return;

      // Backpressure. Without this the loop posted a frame every interval
      // regardless of whether the worker had finished the previous one.
      // Inference is slower than the send interval, so the worker's message
      // queue grew without bound and the skeleton fell further behind the
      // video the longer a session ran — frames were queued faster than they
      // could ever be consumed. Dropping frames while busy keeps the overlay
      // pinned to the present instead: the patient sees a lower frame rate,
      // not a growing lag.
      const inFlightSince = inFlightSinceRef.current;
      if (inFlightSince !== null && time - inFlightSince < FRAME_STALL_TIMEOUT_MS) return;

      lastFrameTimeRef.current = time;
      inFlightSinceRef.current = time;

      createImageBitmap(video)
        .then((bitmap) => {
          const msg: MainToWorkerMessage = { type: "frame", bitmap, t: performance.now() };
          workerRef.current?.postMessage(msg, [bitmap]);
        })
        .catch(() => {
          // Frame grab raced with teardown. Release the slot — otherwise the
          // loop waits out the stall timeout for a frame that was never sent.
          inFlightSinceRef.current = null;
        });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    // Speech outlives the screen that queued it: `speechSynthesis` is a
    // browser-global queue, so a cue spoken as the patient ends the set would
    // carry on talking over the summary screen, or the next exercise. Nothing
    // used to cancel it.
    stopSpeaking();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (cueClearTimerRef.current !== null) window.clearTimeout(cueClearTimerRef.current);
    inFlightSinceRef.current = null;
    inferenceSamplesRef.current = [];
    completionTimesRef.current = [];

    if (workerRef.current) {
      const disposeMsg: MainToWorkerMessage = { type: "dispose" };
      workerRef.current.postMessage(disposeMsg);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
    startedRef.current = false;
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    setState((s) => ({ ...s, cameraStatus: "requesting" }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 720p rather than 480p: the landmark model works from a crop around
        // the detected person, so a sharper source measurably helps when the
        // patient stands far enough back for a full-body exercise to fit in
        // frame — the case where 480p had the least to work with. `ideal`
        // throughout, so a device that cannot manage it degrades instead of
        // failing. Steady-state inference cost is dominated by the fixed-size
        // crop, not the source, and the capture loop now drops frames rather
        // than queueing them, so the extra per-frame cost cannot accumulate.
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;

      // The element may already be mounted (the setup screen renders it
      // before permission resolves); if so bind now, otherwise `attachVideo`
      // binds it when it mounts.
      const mounted = videoRef.current;
      if (mounted && mounted.srcObject !== stream) {
        mounted.srcObject = stream;
        void mounted.play().catch(() => {});
      }

      setState((s) => ({ ...s, cameraStatus: "granted" }));
    } catch (err) {
      setState((s) => ({
        ...s,
        cameraStatus: "denied",
        errorMessage:
          err instanceof Error
            ? err.message
            : "Camera access was denied. Check your browser's site permissions."
      }));
      startedRef.current = false;
      return;
    }

    setState((s) => ({ ...s, workerStatus: "loading" }));
    const worker = new Worker(new URL("../worker/poseWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const msg = event.data;

      if (msg.type === "ready") {
        setState((s) => ({ ...s, workerStatus: "ready" }));
        loop();
        return;
      }

      if (msg.type === "error") {
        inFlightSinceRef.current = null;
        setState((s) => ({ ...s, workerStatus: "error", errorMessage: msg.message }));
        return;
      }

      // msg.type === "result" — the worker is free again, so the next tick may send.
      inFlightSinceRef.current = null;

      const now = performance.now();
      const inferences = inferenceSamplesRef.current;
      const completions = completionTimesRef.current;
      inferences.push(msg.perf.inferenceMs);
      completions.push(now);
      if (inferences.length > PERF_WINDOW) inferences.shift();
      if (completions.length > PERF_WINDOW) completions.shift();

      const perf = computePerf(inferences, completions, msg.perf.tier);

      setState((s) => ({
        ...s,
        perf: perf ?? s.perf,
        landmarks: msg.landmarks,
        personDetected: msg.personDetected,
        captureQuality: msg.captureQuality,
        jointAngles: msg.jointAngles,
        // Keep the last real verdict when there's no pose to judge, rather
        // than clearing a standing block because the patient left the frame.
        safetyVerdict: msg.safetyVerdict ?? s.safetyVerdict,
        reps: msg.closedRep ? [...s.reps, msg.closedRep] : s.reps,
        activeCue: msg.cue ?? s.activeCue
      }));

      // Localised for the ear and the screen only. `msg.cue` and
      // `msg.safetyVerdict` are persisted verbatim by CoachedSession, so the
      // clinician's record stays in one canonical language (invariant 4).
      if (msg.cue) {
        const cue = msg.cue;
        speakLocalised((locale) => localiseCue(cue.text, locale));
        if (cueClearTimerRef.current !== null) window.clearTimeout(cueClearTimerRef.current);
        cueClearTimerRef.current = window.setTimeout(() => {
          setState((s) => ({ ...s, activeCue: null }));
        }, 4000);
      }

      if (
        msg.safetyVerdict &&
        (msg.safetyVerdict.verdict === "block" || msg.safetyVerdict.verdict === "escalate")
      ) {
        const verdict = msg.safetyVerdict;
        speakLocalised((locale) => localiseSafetyReason(verdict, locale), { urgent: true });
      }
    };

    const initMsg: MainToWorkerMessage = { type: "init", exerciseId, tier: POSE_MODEL_TIER };
    worker.postMessage(initMsg);
  }, [exerciseId, loop]);

  /**
   * Arms or disarms rep counting in the worker. Separate from `start`, which
   * only means "camera and model running" — the patient spends the framing
   * phase in front of a live camera and must not be scored for it.
   */
  const setScoring = useCallback((scoring: boolean) => {
    const msg: MainToWorkerMessage = { type: "setScoring", scoring };
    workerRef.current?.postMessage(msg);
  }, []);

  useEffect(() => stop, [stop]); // stop the camera and worker on unmount, no matter how we got here

  return { state, start, stop, setScoring, attachVideo };
}
