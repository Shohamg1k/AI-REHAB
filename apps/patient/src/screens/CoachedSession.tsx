import { useCallback, useEffect, useRef, useState } from "react";
import { getExerciseSpec } from "@ai-rehab/exercises";
import type { FormScore, RepEvent } from "@ai-rehab/contracts";
import { useLiveSession } from "../hooks/useLiveSession.js";
import { appendEvent } from "../lib/db.js";
import { ExerciseIntroScreen } from "./ExerciseIntroScreen.js";
import { CameraSetupScreen } from "./CameraSetupScreen.js";
import { LiveSessionScreen } from "./LiveSessionScreen.js";
import { speakLocalised, stopSpeaking } from "../lib/speech.js";
import { strings } from "../lib/i18n/ui.js";

type Phase = "intro" | "setup" | "live";

/**
 * How long the patient gets between pressing start and the first rep being
 * counted. They have to walk back to where the camera can see them, which is
 * the whole reason the framing step exists — counting from the instant they
 * tap a button on a phone they are still holding makes no sense.
 */
export const COUNTDOWN_SECONDS = 10;

/** Reps in a set. Also what is written to the log as `prescribed`. */
export const TARGET_REPS = 8;

/**
 * Beat between the last rep landing and the summary appearing, so the patient
 * sees the counter reach its target rather than having the screen vanish
 * out from under the movement they just finished.
 */
const AUTO_END_DELAY_MS = 1600;

export type CoachedSessionResult = {
  reps: Array<{ rep: RepEvent; score: FormScore }>;
  bookmarkedRepIndex: number | null;
};

/**
 * Owns one exercise's camera + worker lifecycle across both the setup
 * screen (A7) and the live session screen (A1-A4, A3, B5), so the camera
 * and pose model persist across that transition instead of restarting.
 * Also where G1 event-log writes for this exercise happen — each effect
 * below logs a SessionEvent exactly once per real occurrence, not once per
 * render.
 */
export function CoachedSession({
  exerciseId,
  sessionId,
  sessionT,
  onFinish,
  onCancel
}: {
  exerciseId: string;
  sessionId: string;
  sessionT: () => number;
  onFinish: (result: CoachedSessionResult) => void;
  onCancel: () => void;
}) {
  const spec = getExerciseSpec(exerciseId);
  const { state, start, stop, setScoring, attachVideo } = useLiveSession(exerciseId);
  const [phase, setPhase] = useState<Phase>("intro");
  /** Seconds left before counting arms; null once it has, or before it starts. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const finishedRef = useRef(false);

  const loggedRepCount = useRef(0);
  const loggedCueKey = useRef<string | null>(null);
  const loggedVerdictTier = useRef<string>("allow");
  const bookmarkedRepIndex = useRef<number | null>(null);

  useEffect(() => {
    for (let i = loggedRepCount.current; i < state.reps.length; i++) {
      const closed = state.reps[i];
      if (!closed) continue;
      appendEvent(sessionId, { type: "rep_completed", t: sessionT(), rep: closed.rep, score: closed.score });
    }
    loggedRepCount.current = state.reps.length;
  }, [state.reps, sessionId, sessionT]);

  useEffect(() => {
    if (!state.activeCue) return;
    const key = `${state.activeCue.cueId}:${state.activeCue.t}`;
    if (loggedCueKey.current === key) return;
    loggedCueKey.current = key;
    appendEvent(sessionId, { type: "cue_delivered", t: sessionT(), cue: state.activeCue });
  }, [state.activeCue, sessionId, sessionT]);

  useEffect(() => {
    if (!state.safetyVerdict || state.safetyVerdict.verdict === loggedVerdictTier.current) return;
    loggedVerdictTier.current = state.safetyVerdict.verdict;
    appendEvent(sessionId, { type: "safety_verdict", t: sessionT(), verdict: state.safetyVerdict });
  }, [state.safetyVerdict, sessionId, sessionT]);

  // Guarded because there are now two ways out — the patient tapping "end"
  // and the set auto-completing — and both must not log a completion.
  const handleEndExercise = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    appendEvent(sessionId, {
      type: "exercise_completed",
      t: sessionT(),
      exerciseId,
      repsCompleted: state.reps.length
    });
    stop();
    onFinish({ reps: state.reps, bookmarkedRepIndex: bookmarkedRepIndex.current });
  }, [sessionId, sessionT, exerciseId, state.reps, stop, onFinish]);

  /**
   * The pre-set countdown. Counting is armed by the tick that reaches zero,
   * never by the render, so a re-render cannot arm it early or twice.
   */
  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0) {
      setCountdown(null);
      setScoring(true);
      speakLocalised((locale) => strings(locale).session.go);
      return;
    }

    const timer = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, setScoring]);

  /**
   * Auto-end once the set is done. The patient's hands are busy and they are
   * usually not near the screen, so making them walk back to tap "end" is the
   * wrong ending for a set they have just finished.
   */
  useEffect(() => {
    if (phase !== "live" || countdown !== null) return;
    if (state.reps.length < TARGET_REPS) return;

    speakLocalised((locale) => strings(locale).session.setComplete);
    const timer = window.setTimeout(handleEndExercise, AUTO_END_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, countdown, state.reps.length, handleEndExercise]);

  /** Nothing this screen queued should still be talking after it is gone. */
  useEffect(() => stopSpeaking, []);

  if (!spec) return null;

  function handleSetupContinue() {
    if (state.captureQuality) {
      appendEvent(sessionId, {
        type: "setup_completed",
        t: sessionT(),
        captureQuality: state.captureQuality
      });
    }
    appendEvent(sessionId, {
      type: "exercise_started",
      t: sessionT(),
      exerciseId,
      prescribed: { sets: 1, reps: TARGET_REPS }
    });
    setPhase("live");
    setCountdown(COUNTDOWN_SECONDS);
    speakLocalised((locale) => strings(locale).session.getIntoPosition);
  }

  function handleBookmarkPain() {
    const repIndex = state.reps.length - 1; // button is disabled until this is >= 0
    bookmarkedRepIndex.current = repIndex;
    appendEvent(sessionId, { type: "pain_bookmarked", t: sessionT(), repIndex, region: null });
  }

  if (phase === "intro") {
    return (
      <ExerciseIntroScreen
        spec={spec}
        onStart={() => {
          setPhase("setup");
          void start();
        }}
        onBack={onCancel}
      />
    );
  }

  if (phase === "setup") {
    return (
      <CameraSetupScreen
        liveState={state}
        attachVideo={attachVideo}
        onContinue={handleSetupContinue}
        onBack={() => {
          stop();
          onCancel();
        }}
      />
    );
  }

  return (
    <LiveSessionScreen
      spec={spec}
      liveState={state}
      countdown={countdown}
      targetReps={TARGET_REPS}
      attachVideo={attachVideo}
      onBookmarkPain={handleBookmarkPain}
      onEndExercise={handleEndExercise}
    />
  );
}
