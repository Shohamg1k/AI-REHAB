import { useCallback, useEffect, useRef, useState } from "react";
import { getExerciseSpec } from "@ai-rehab/exercises";
import type { FormScore, RepEvent } from "@ai-rehab/contracts";
import { useLiveSession } from "../hooks/useLiveSession.js";
import { appendEvent } from "../lib/db.js";
import { ExerciseIntroScreen } from "./ExerciseIntroScreen.js";
import { CameraSetupScreen } from "./CameraSetupScreen.js";
import { LiveSessionScreen } from "./LiveSessionScreen.js";
import { prerenderCues, speakLocalised, stopSpeaking } from "../lib/speech.js";
import { strings } from "../lib/i18n/ui.js";
import { localiseCue } from "@ai-rehab/exercises";
import { useSpeechPrefs, useBundledVoice } from "../hooks/useSpeechPrefs.js";
import { useVoiceCommands } from "../hooks/useVoiceCommands.js";
import { isCommandAllowed, type VoiceCommand } from "../lib/voice/commands.js";

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
  /** C7 — the patient asked to stop mid-set. Distinct from a safety block. */
  const [paused, setPaused] = useState(false);
  const finishedRef = useRef(false);
  const { prefs, locale } = useSpeechPrefs();
  useBundledVoice(locale);
  /**
   * Kept in a ref because `handleSetupContinue` is redeclared every render and
   * reads `state.captureQuality`. Listing it as a dependency of the voice
   * handler would rebuild that handler constantly; omitting it would capture a
   * stale one and log the wrong capture quality when a patient says "start".
   */
  const setupContinueRef = useRef<() => void>(() => {});

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
   * Render this exercise's cues into the bundled voice, starting the moment
   * the session mounts (ADR-0011).
   *
   * **Measured in the browser, which is where it counts: ~5s per cue.** The
   * Node spike said 1.4s; single-threaded wasm in a browser is far slower, and
   * threaded wasm needs cross-origin isolation this app cannot assume of
   * whoever deploys it. Six cues is therefore ~30s of work, which does *not*
   * fit the 10-second countdown it was originally written to use.
   *
   * So it starts at the intro screen instead and runs through framing and the
   * countdown — a minute or more in practice. Cues are rendered in the spec's
   * own priority order so that if the patient is quick, the lines most likely
   * to be needed are the ones that made it. Everything not ready by the time
   * it fires simply falls back to the device voice.
   */
  useEffect(() => {
    if (!spec) return;
    const lines = [...spec.cues]
      .sort((a, b) => b.priority - a.priority)
      .map((cue) => localiseCue(cue.text, locale));
    void prerenderCues(lines);
  }, [spec, locale]);

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

  const isBlocked =
    state.safetyVerdict?.verdict === "block" || state.safetyVerdict?.verdict === "escalate";
  const scoringArmed = phase === "live" && countdown === null && !paused && !isBlocked;

  /**
   * Spoken session commands (C7).
   *
   * `isCommandAllowed` is the gate, and it lives in the pure module with the
   * matcher so it is tested and so no call site can skip it. The rule that
   * matters: while the safety gate is blocking, nothing spoken can restart the
   * set (CLAUDE.md invariant 3). A blocked patient can still report pain and
   * still end the exercise.
   */
  const handleVoiceCommand = useCallback(
    (command: VoiceCommand) => {
      const allowed = isCommandAllowed(command.kind, {
        blocked: !!isBlocked,
        scoring: scoringArmed,
        countingDown: countdown !== null
      });
      if (!allowed) return;

      switch (command.kind) {
        case "start":
          if (phase === "setup") setupContinueRef.current();
          break;
        case "pause":
          setPaused(true);
          setScoring(false);
          speakLocalised((l) => strings(l).session.paused);
          break;
        case "resume":
          setPaused(false);
          setScoring(true);
          speakLocalised((l) => strings(l).session.resumed);
          break;
        case "end":
          handleEndExercise();
          break;
        case "pain": {
          // B6: this records *that the patient said something hurt*, and
          // where. It does not record how much — "a little pain" is not a
          // number, and the check-in asks them for one in their own terms.
          const repIndex = Math.max(0, state.reps.length - 1);
          bookmarkedRepIndex.current = repIndex;
          appendEvent(sessionId, {
            type: "pain_bookmarked",
            t: sessionT(),
            repIndex,
            region: command.region
          });
          speakLocalised((l) => strings(l).session.painNoted);
          break;
        }
      }
    },
    [
      isBlocked,
      scoringArmed,
      countdown,
      phase,
      setScoring,
      state.reps.length,
      sessionId,
      sessionT,
      handleEndExercise
    ]
  );

  const voice = useVoiceCommands({
    enabled: prefs.commandsEnabled && (phase === "setup" || phase === "live"),
    locale,
    onCommand: handleVoiceCommand
  });

  /**
   * A safety block cancels a pause rather than stacking with it: the gate has
   * taken over, and leaving `paused` set would let the patient "resume" out of
   * a blocked state the moment the block cleared.
   */
  useEffect(() => {
    if (isBlocked && paused) setPaused(false);
  }, [isBlocked, paused]);

  /** Nothing this screen queued should still be talking after it is gone. */
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
    speakLocalised((l) => strings(l).session.getIntoPosition);
  }
  setupContinueRef.current = handleSetupContinue;

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
      paused={paused}
      listening={voice.status === "listening" || voice.status === "restarting"}
      attachVideo={attachVideo}
      onBookmarkPain={handleBookmarkPain}
      onEndExercise={handleEndExercise}
    />
  );
}
