import { useRef, useState } from "react";
import type { BodyRegion, FormScore, RepEvent } from "@ai-rehab/contracts";
import { getExerciseSpec } from "@ai-rehab/exercises";
import { DisclaimerBar } from "./components/DisclaimerBar.js";
import { WelcomeScreen } from "./screens/WelcomeScreen.js";
import { TodayScreen } from "./screens/TodayScreen.js";
import { CoachedSession, type CoachedSessionResult } from "./screens/CoachedSession.js";
import { PainCheckInScreen } from "./screens/PainCheckInScreen.js";
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen.js";
import { appendEvent } from "./lib/db.js";

type Screen = "welcome" | "today" | "session" | "pain-check-in" | "summary";

type ActiveSession = {
  sessionId: string;
  startPerf: number;
};

type CompletedSet = {
  exerciseId: string;
  reps: Array<{ rep: RepEvent; score: FormScore }>;
  bookmarkedRepIndex: number | null;
};

function newSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [completedSet, setCompletedSet] = useState<CompletedSet | null>(null);
  const [painReport, setPainReport] = useState<{ region: BodyRegion | null; severity: number } | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);

  function sessionT(): number {
    return sessionRef.current ? performance.now() - sessionRef.current.startPerf : 0;
  }

  function handleStart() {
    const sessionId = newSessionId();
    sessionRef.current = { sessionId, startPerf: performance.now() };
    appendEvent(sessionId, {
      type: "session_started",
      t: 0,
      sessionId,
      programId: null,
      wallClock: new Date().toISOString()
    });
    setScreen("today");
  }

  function handlePickExercise(id: string) {
    setExerciseId(id);
    setScreen("session");
  }

  function handleSessionFinish(result: CoachedSessionResult) {
    if (!exerciseId) return;
    setCompletedSet({ exerciseId, reps: result.reps, bookmarkedRepIndex: result.bookmarkedRepIndex });
    setScreen("pain-check-in");
  }

  function handlePainSubmit(region: BodyRegion | null, severity: number) {
    const session = sessionRef.current;
    if (session) {
      appendEvent(session.sessionId, {
        type: "pain_reported",
        t: sessionT(),
        signal: {
          t: sessionT(),
          region: region ?? "knee",
          inferred: null,
          selfReported: { severity, repIndex: completedSet?.bookmarkedRepIndex ?? null },
          fusion: "self_report_only",
          recordedSeverity: severity,
          reason: "Patient self-report — see docs/CONTRACTS.md PainSignal.reason."
        }
      });
    }
    setPainReport({ region, severity });
    setScreen("summary");
  }

  function handlePainSkip() {
    setPainReport(null);
    setScreen("summary");
  }

  function handleSummaryDone() {
    const session = sessionRef.current;
    if (session) {
      appendEvent(session.sessionId, { type: "session_ended", t: sessionT(), reason: "completed" });
    }
    sessionRef.current = null;
    setExerciseId(null);
    setCompletedSet(null);
    setPainReport(null);
    setScreen("today");
  }

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <DisclaimerBar />
      <main className="flex-1 flex flex-col">
        {screen === "welcome" && <WelcomeScreen onStart={handleStart} />}
        {screen === "today" && <TodayScreen onPick={handlePickExercise} />}
        {screen === "session" && exerciseId && (
          <CoachedSession
            exerciseId={exerciseId}
            sessionId={sessionRef.current?.sessionId ?? newSessionId()}
            sessionT={sessionT}
            onFinish={handleSessionFinish}
            onCancel={() => {
              setExerciseId(null);
              setScreen("today");
            }}
          />
        )}
        {screen === "pain-check-in" && (
          <PainCheckInScreen
            bookmarked={completedSet !== null && completedSet.bookmarkedRepIndex !== null}
            onSubmit={handlePainSubmit}
            onSkip={handlePainSkip}
          />
        )}
        {screen === "summary" && completedSet && (
          <SessionSummaryScreen
            exerciseName={getExerciseSpec(completedSet.exerciseId)?.displayName ?? completedSet.exerciseId}
            reps={completedSet.reps}
            painReport={painReport}
            onDone={handleSummaryDone}
          />
        )}
      </main>
    </div>
  );
}
