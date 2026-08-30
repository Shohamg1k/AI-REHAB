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
import type { MainToWorkerMessage, WorkerToMainMessage } from "../worker/protocol.js";
import { speak } from "../lib/speech.js";

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

// Target the M0 spike's stated floor (docs/ROADMAP.md M0 exit criterion:
// "≥24fps on the worst device we intend to support") rather than 30 — this
// is a ceiling on how often we *send* frames, not a claim that the pipeline
// hits it; the real number needs the physical-device spike this environment
// cannot run. See docs/adr/0007-pose-model-tier.md.
const FRAME_INTERVAL_MS = 1000 / 24;

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
  reps: []
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
      lastFrameTimeRef.current = time;

      createImageBitmap(video)
        .then((bitmap) => {
          const msg: MainToWorkerMessage = { type: "frame", bitmap, t: performance.now() };
          workerRef.current?.postMessage(msg, [bitmap]);
        })
        .catch(() => {
          /* frame grab raced with teardown — safe to drop this frame */
        });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (cueClearTimerRef.current !== null) window.clearTimeout(cueClearTimerRef.current);

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
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
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
        setState((s) => ({ ...s, workerStatus: "error", errorMessage: msg.message }));
        return;
      }

      // msg.type === "result"
      setState((s) => ({
        ...s,
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

      if (msg.cue) {
        speak(msg.cue.text);
        if (cueClearTimerRef.current !== null) window.clearTimeout(cueClearTimerRef.current);
        cueClearTimerRef.current = window.setTimeout(() => {
          setState((s) => ({ ...s, activeCue: null }));
        }, 4000);
      }

      if (
        msg.safetyVerdict &&
        (msg.safetyVerdict.verdict === "block" || msg.safetyVerdict.verdict === "escalate")
      ) {
        speak(msg.safetyVerdict.reason, { urgent: true });
      }
    };

    const initMsg: MainToWorkerMessage = { type: "init", exerciseId };
    worker.postMessage(initMsg);
  }, [exerciseId, loop]);

  useEffect(() => stop, [stop]); // stop the camera and worker on unmount, no matter how we got here

  return { state, start, stop, attachVideo };
}
