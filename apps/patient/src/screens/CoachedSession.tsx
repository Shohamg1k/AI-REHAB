import { useEffect, useRef, useState } from "react";
import { getExerciseSpec } from "@ai-rehab/exercises";
import type { FormScore, RepEvent } from "@ai-rehab/contracts";
import { useLiveSession } from "../hooks/useLiveSession.js";
import { appendEvent } from "../lib/db.js";
import { CameraSetupScreen } from "./CameraSetupScreen.js";
import { LiveSessionScreen } from "./LiveSessionScreen.js";

type Phase = "setup" | "live";

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
  onFinish
}: {
  exerciseId: string;
  sessionId: string;
  sessionT: () => number;
  onFinish: (result: CoachedSessionResult) => void;
}) {
  const spec = getExerciseSpec(exerciseId);
  const { state, start, stop } = useLiveSession(exerciseId);
  const [phase, setPhase] = useState<Phase>("setup");

  const loggedRepCount = useRef(0);
  const loggedCueKey = useRef<string | null>(null);
  const loggedVerdictTier = useRef<string>("allow");
  const bookmarkedRepIndex = useRef<number | null>(null);

  useEffect(() => {
    void start();
  }, [start]);

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
      prescribed: { sets: 1, reps: 8 }
    });
    setPhase("live");
  }

  function handleBookmarkPain() {
    const repIndex = state.reps.length - 1; // button is disabled until this is >= 0
    bookmarkedRepIndex.current = repIndex;
    appendEvent(sessionId, { type: "pain_bookmarked", t: sessionT(), repIndex, region: null });
  }

  function handleEndExercise() {
    appendEvent(sessionId, {
      type: "exercise_completed",
      t: sessionT(),
      exerciseId,
      repsCompleted: state.reps.length
    });
    stop();
    onFinish({ reps: state.reps, bookmarkedRepIndex: bookmarkedRepIndex.current });
  }

  if (phase === "setup") {
    return <CameraSetupScreen spec={spec} liveState={state} onContinue={handleSetupContinue} />;
  }

  return (
    <LiveSessionScreen
      spec={spec}
      liveState={state}
      onBookmarkPain={handleBookmarkPain}
      onEndExercise={handleEndExercise}
    />
  );
}
