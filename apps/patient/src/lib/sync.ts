import { getSessionEvents, listUnsyncedSessionIds, markSessionSynced } from "./db.js";
import { isApiConfigured, syncEvents } from "./api.js";
import { isSignedIn } from "./authStore.js";

/**
 * G6 — local-first write with background sync. Every session is already
 * durable the moment it's written (IndexedDB, unconditionally — see
 * lib/db.ts, unchanged from M1). This module is purely additive: if the
 * patient is signed in and a server is configured, flush what hasn't been
 * synced yet. If either is false, sessions simply accumulate locally
 * exactly as they always have — sync is never a precondition for using
 * the app.
 *
 * Best-effort, not a retrying queue with backoff: a failed flush leaves
 * the session marked unsynced, and the next call to `syncPendingSessions`
 * (on next app load, or after the next session ends) picks it up again.
 */
export async function syncSession(sessionId: string): Promise<boolean> {
  if (!isApiConfigured() || !isSignedIn()) return false;

  const events = await getSessionEvents(sessionId);
  if (events.length === 0) return false;

  try {
    await syncEvents(
      sessionId,
      events.map((event, seq) => ({ seq, event }))
    );
    await markSessionSynced(sessionId);
    return true;
  } catch {
    // Left unsynced deliberately — picked up by the next opportunistic sync.
    return false;
  }
}

/** Call once at app startup: flushes anything left over from a previous session that didn't sync. */
export async function syncPendingSessions(): Promise<void> {
  if (!isApiConfigured() || !isSignedIn()) return;
  const pending = await listUnsyncedSessionIds();
  for (const sessionId of pending) {
    await syncSession(sessionId);
  }
}
