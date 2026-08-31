import { useEffect, useMemo, useRef, useState } from "react";
import type { BodyRegion, FormScore, Program, RepEvent, User } from "@ai-rehab/contracts";
import { getExerciseSpec } from "@ai-rehab/exercises";
import { readRestoredScreen, writeRestoredScreen, type PersistedScreen } from "./lib/restoreScreen.js";
import { DisclaimerBar } from "./components/DisclaimerBar.js";
import { WelcomeScreen } from "./screens/WelcomeScreen.js";
import { TodayScreen } from "./screens/TodayScreen.js";
import { CoachedSession, type CoachedSessionResult } from "./screens/CoachedSession.js";
import { PainCheckInScreen } from "./screens/PainCheckInScreen.js";
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen.js";
import { AuthScreen } from "./screens/AuthScreen.js";
import { HistoryScreen } from "./screens/HistoryScreen.js";
import { ClinicianApp } from "./clinician/ClinicianApp.js";
import { BottomNav, type NavTab } from "./components/BottomNav.js";
import { SharingScreen } from "./screens/SharingScreen.js";
import { ProgramScreen } from "./screens/ProgramScreen.js";
import { RoutineSetupScreen } from "./screens/RoutineSetupScreen.js";
import {
  hasChosenRoutine,
  loadRoutine,
  pushRoutine,
  reconcileRoutine,
  routineExercises,
  saveRoutine
} from "./lib/routine.js";
import { appendEvent } from "./lib/db.js";
import { completedExercisesToday } from "./lib/localHistory.js";
import { syncPendingSessions, syncSession } from "./lib/sync.js";
import { clearSession, getSession } from "./lib/authStore.js";
import { fetchMyProgram, isApiConfigured } from "./lib/api.js";

export type Screen =
  | "welcome"
  | "auth"
  | "today"
  | "routine-setup"
  | "session"
  | "pain-check-in"
  | "summary"
  | "history"
  | "sharing"
  | "program";

/**
 * Which screens carry the bottom nav, and which tab it highlights. The whole
 * exercise flow (session -> rest -> summary) is deliberately absent: a way
 * out of a running set should not sit next to the set itself.
 */
const NAV_TAB: Partial<Record<Screen, NavTab>> = {
  today: "today",
  history: "progress",
  program: "program",
  sharing: "sharing"
};

const TAB_SCREEN: Record<NavTab, Screen> = {
  today: "today",
  progress: "history",
  program: "program",
  sharing: "sharing"
};

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
  // A signed-in or returning patient lands where they left off; a first
  // visit still starts at the welcome screen.
  // Read once, so the screen and the exercise come from the same snapshot.
  const restoredRef = useRef<PersistedScreen | null>(readRestoredScreen());
  const [screen, setScreen] = useState<Screen>(() => restoredRef.current?.screen ?? "welcome");
  const [exerciseId, setExerciseId] = useState<string | null>(
    () => restoredRef.current?.exerciseId ?? null
  );
  const [completedSet, setCompletedSet] = useState<CompletedSet | null>(null);
  const [painReport, setPainReport] = useState<{ region: BodyRegion | null; severity: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => getSession()?.user ?? null);
  const [completedToday, setCompletedToday] = useState<string[]>([]);
  // Bumped when the routine is edited, so Today re-reads it without a reload.
  const [routineVersion, setRoutineVersion] = useState(0);
  const [program, setProgram] = useState<Program | null>(null);

  useEffect(() => {
    // A clinician's prescription outranks the patient's own routine for what
    // Today asks them to do — it is a clinical instruction that passed the
    // E5 contraindication check before it was assigned. Failing to load it
    // falls back to the routine rather than to an empty screen.
    if (!isApiConfigured() || !currentUser) return;
    // A returning session: the server copy may have moved on while this
    // device was closed.
    if (reconcileRoutine(currentUser)) setRoutineVersion((v) => v + 1);
    fetchMyProgram()
      .then(setProgram)
      .catch(() => setProgram(null));
  }, [currentUser]);

  /**
   * What Today actually lists. The prescription when there is one, the
   * patient's chosen routine otherwise.
   */
  const todaysExercises = useMemo(() => {
    const prescribed = program?.exercises ?? [];
    if (prescribed.length > 0) {
      const specs = [...prescribed]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => getExerciseSpec(item.exerciseId))
        .filter((spec): spec is NonNullable<typeof spec> => spec !== undefined);
      if (specs.length > 0) return specs;
    }
    return routineExercises(loadRoutine());
    // routineVersion is the dependency that matters: the routine lives in
    // localStorage, so nothing else here changes when it is edited.
  }, [program, routineVersion]);

  const prescriptions = useMemo(() => {
    const out: Record<string, string> = {};
    for (const item of program?.exercises ?? []) {
      out[item.exerciseId] = `${item.sets} × ${item.reps}`;
    }
    return out;
  }, [program]);
  const sessionRef = useRef<ActiveSession | null>(null);

  useEffect(() => {
    writeRestoredScreen({ screen, exerciseId });
  }, [screen, exerciseId]);

  useEffect(() => {
    // A restored session needs its own session record: the previous one's
    // id and start time died with the reload, and appending reps to it would
    // write events to a session that never started.
    if (restoredRef.current?.screen === "session" && !sessionRef.current) {
      beginSession();
    }
    restoredRef.current = null;
    // Empty deps on purpose: this is one-shot recovery from a reload, not a
    // rule that should re-run when the screen changes.
  }, []);

  // Which exercises are already done today, so Today can mark them. Read from
  // the local log rather than tracked in memory, so it survives a reload.
  const refreshCompleted = () => {
    void completedExercisesToday().then(setCompletedToday);
  };
  useEffect(refreshCompleted, []);

  useEffect(() => {
    // G6 — flush anything a previous visit didn't manage to sync. A no-op
    // if there's no server configured or nobody's signed in.
    void syncPendingSessions();
  }, []);

  function sessionT(): number {
    return sessionRef.current ? performance.now() - sessionRef.current.startPerf : 0;
  }

  /** Opens a new session record. Shared by starting fresh and by recovering after a reload. */
  function beginSession(): void {
    const sessionId = newSessionId();
    sessionRef.current = { sessionId, startPerf: performance.now() };
    void appendEvent(sessionId, {
      type: "session_started",
      t: 0,
      sessionId,
      programId: null,
      wallClock: new Date().toISOString()
    });
  }

  function handleStart() {
    beginSession();
    // First run: ask what they want to work on before handing them a list
    // somebody else picked. Once chosen, this never interrupts again.
    setScreen(hasChosenRoutine() ? "today" : "routine-setup");
  }

  function handlePickExercise(id: string) {
    // Picking an exercise from a tab screen can happen without a session
    // having been started — the nav lets you reach Today directly.
    if (!sessionRef.current) beginSession();
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
      // Chained, not fire-and-forget in parallel: syncSession reads back
      // everything written so far, so it must wait for this write to
      // actually land or it can sync a session missing its final event.
      void appendEvent(session.sessionId, { type: "session_ended", t: sessionT(), reason: "completed" }).then(() =>
        syncSession(session.sessionId)
      );
    }
    sessionRef.current = null;
    setExerciseId(null);
    setCompletedSet(null);
    setPainReport(null);
    refreshCompleted();
    setScreen("today");
  }

  function handleSignOut() {
    clearSession();
    setCurrentUser(null);
    setScreen("welcome");
  }

  function handleSignedIn(user: User) {
    setCurrentUser(user);
    // Bring the routine across from whatever device chose it. Signing in is
    // the only moment the two copies can be reconciled without guessing.
    if (reconcileRoutine(user)) setRoutineVersion((v) => v + 1);
    setScreen(user.role === "clinician" ? "welcome" : "today");
  }

  // ADR-0005 — a clinician gets an entirely different app shell, not a
  // role-gated screen inside the patient flow. Still wrapped in the same
  // disclaimer bar (E4 applies regardless of who's looking at the app).
  if (currentUser?.role === "clinician") {
    return (
      <div className="min-h-screen flex flex-col bg-page">
        <DisclaimerBar />
        <main className="flex-1 flex flex-col">
          <ClinicianApp user={currentUser} onSignOut={handleSignOut} />
        </main>
      </div>
    );
  }

  const navTab = NAV_TAB[screen];

  return (
    <div className="min-h-screen flex flex-col bg-page">
      <DisclaimerBar />
      <main className="flex-1 flex flex-col">
        {screen === "welcome" && <WelcomeScreen onStart={handleStart} onSignIn={() => setScreen("auth")} />}
        {screen === "auth" && (
          <AuthScreen
            onDone={handleSignedIn}
            onBack={() => setScreen("welcome")}
          />
        )}
        {screen === "today" && (
          <TodayScreen
            exercises={todaysExercises}
            onPick={handlePickExercise}
            completedExerciseIds={completedToday}
            prescriptions={prescriptions}
          />
        )}
        {screen === "routine-setup" && (
          <RoutineSetupScreen
            onDone={(ids) => {
              saveRoutine(ids);
              pushRoutine(ids);
              setRoutineVersion((v) => v + 1);
              setScreen("today");
            }}
          />
        )}
        {screen === "program" && (
          <ProgramScreen
            onPick={handlePickExercise}
            onRoutineChanged={() => setRoutineVersion((v) => v + 1)}
          />
        )}
        {screen === "history" && <HistoryScreen />}
        {screen === "sharing" && (
          <SharingScreen
            user={currentUser}
            signedIn={isApiConfigured() && currentUser !== null}
            onSignIn={() => setScreen("auth")}
            onSignOut={handleSignOut}
            onUserChanged={setCurrentUser}
          />
        )}
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

      {navTab && (
        <BottomNav
          active={navTab}
          onNavigate={(tab) => setScreen(TAB_SCREEN[tab])}
        />
      )}
    </div>
  );
}
