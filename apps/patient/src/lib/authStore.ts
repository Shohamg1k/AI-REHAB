import type { User } from "@ai-rehab/contracts";

/**
 * Optional account layer on top of the guest-first flow (H7 stays the
 * default — see WelcomeScreen). Signing in enables cross-device sync
 * (G6); it is never required to complete a session.
 *
 * The token lives in localStorage, not an httpOnly cookie — a pragmatic
 * choice for this build (see docs/STATUS.md), not the hardened pattern a
 * production rollout should use. It never touches a landmark or a video
 * frame; it is purely a bearer credential for the sync endpoint.
 */
const STORAGE_KEY = "ai-rehab-coach:session";

type StoredSession = { token: string; user: User };

let cached: StoredSession | null | undefined;

function read(): StoredSession | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function getSession(): StoredSession | null {
  return read();
}

export function setSession(session: StoredSession): void {
  cached = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private browsing, quota) — session still
    // works for the current page load via the in-memory cache.
  }
}

export function clearSession(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isSignedIn(): boolean {
  return read() !== null;
}
