import { getExerciseSpec } from "@ai-rehab/exercises";
import type { Screen } from "../App.js";

/**
 * Where the app was, so a refresh puts the patient back rather than at the
 * front door.
 *
 * Both the screen *and* the exercise are remembered: "the page I was on"
 * mid-workout means a specific exercise, and restoring the screen without it
 * would land on a session with nothing to run.
 *
 * Session-scoped, not local: this restores a tab you refreshed, and does not
 * silently drop someone back into a half-finished workout days later.
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
    const raw = sessionStorage.getItem(SCREEN_KEY);
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

/** Records where the patient is, so the next reload can put them back. */
export function writeRestoredScreen(state: PersistedScreen): void {
  try {
    sessionStorage.setItem(SCREEN_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled — the app still works, it just forgets on reload */
  }
}
