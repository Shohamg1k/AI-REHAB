import { getExerciseSpec } from "@ai-rehab/exercises";
import type { Screen } from "../App.js";

/**
 * Where the app was, so reopening it puts the patient back rather than at
 * the front door.
 *
 * Both the screen *and* the exercise are remembered: "the page I was on"
 * mid-workout means a specific exercise, and restoring the screen without it
 * would land on a session with nothing to run.
 *
 * Stored in `localStorage`, so it survives closing the browser and not just
 * a refresh. That is a deliberate trade: `sessionStorage` would keep each
 * tab independent and forget everything on exit, which is tidier but means
 * a patient who closes the app between sets comes back to the welcome
 * screen. Being returned to where you were is worth more than per-tab
 * independence in an app people use in short bursts.
 *
 * Two consequences of that choice, neither hidden:
 * - Tabs share one value, so the last screen navigated to in *any* tab is
 *   the one the next launch restores. Harmless — every screen here is
 *   reachable from the nav — and preferable to per-tab state that vanishes.
 * - Nothing here expires. A restored screen is only ever a *view*: the
 *   exercise id is re-validated on read, and no rep, score or session
 *   survives in it. Landing on an exercise you opened last week costs a tap
 *   to leave, so an expiry rule would add a moving part to solve a problem
 *   nobody has.
 */
const SCREEN_KEY = "ai-rehab:screen";

export type PersistedScreen = { screen: Screen; exerciseId: string | null };

/**
 * How each screen survives a reload.
 *
 * `exact` — restore it as it was; it reads everything it needs from storage
 * or the server.
 *
 * `exercise` — restore it, but only with a valid exercise to run. The live
 * session cannot literally resume (camera, worker and rep state are all
 * gone), so it re-enters at that exercise's setup step. That is still "the
 * page I was on" in every sense the patient means it.
 *
 * `today` — these screens are *about* rep data held in memory, which a
 * reload destroys. Rendering them empty would be worse than honest
 * redirection: a summary of a set that no longer exists, or a pain check-in
 * about no particular rep. Today is where that workout actually resumes.
 */
const RESTORE_MODE: Record<Screen, "exact" | "exercise" | "today"> = {
  welcome: "exact",
  auth: "exact",
  today: "exact",
  program: "exact",
  history: "exact",
  sharing: "exact",
  session: "exercise",
  "pain-check-in": "today",
  summary: "today"
};

export function readRestoredScreen(): PersistedScreen | null {
  try {
    const raw = localStorage.getItem(SCREEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PersistedScreen;
    if (!saved?.screen || !(saved.screen in RESTORE_MODE)) return null;

    switch (RESTORE_MODE[saved.screen]) {
      case "exact":
        return { screen: saved.screen, exerciseId: saved.exerciseId ?? null };
      case "exercise":
        // Guard the id too — an exercise can be renamed or removed between
        // visits, and restoring into one that no longer exists is a crash.
        return saved.exerciseId && getExerciseSpec(saved.exerciseId)
          ? { screen: "session", exerciseId: saved.exerciseId }
          : { screen: "today", exerciseId: null };
      case "today":
        return { screen: "today", exerciseId: null };
    }
  } catch {
    return null; // private mode, storage disabled, or malformed JSON
  }
}

/** Records where the patient is, so the next launch can put them back. */
export function writeRestoredScreen(state: PersistedScreen): void {
  try {
    localStorage.setItem(SCREEN_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled — the app still works, it just forgets on reload */
  }
}
