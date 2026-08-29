import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SessionEvent } from "@ai-rehab/contracts";

/**
 * G1 — structured append-only session event log. MVP scope: IndexedDB only,
 * no server, no sync (docs/FEATURES.md G1 "local-only" note). No updates,
 * no deletes — every write is a new row; corrections are new events, never
 * edits to old ones (docs/CONTRACTS.md SessionEvent rule).
 */

type StoredEvent = {
  seq?: number;
  sessionId: string;
  event: SessionEvent;
};

interface RehabDB extends DBSchema {
  events: {
    key: number;
    value: StoredEvent;
    indexes: { sessionId: string };
  };
}

const DB_NAME = "ai-rehab-coach";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RehabDB>> | null = null;

function getDb(): Promise<IDBPDatabase<RehabDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RehabDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("events", { keyPath: "seq", autoIncrement: true });
        store.createIndex("sessionId", "sessionId");
      }
    });
  }
  return dbPromise;
}

export async function appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
  const db = await getDb();
  await db.add("events", { sessionId, event });
}

export async function getSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("events", "sessionId", sessionId);
  return rows.map((r) => r.event).sort((a, b) => a.t - b.t);
}

/** Every distinct sessionId that has at least one `session_started` event, most recent first. */
export async function listSessions(): Promise<
  Array<{ sessionId: string; wallClock: string; programId: string | null }>
> {
  const db = await getDb();
  const all = await db.getAll("events");
  const started = all
    .map((r) => r.event)
    .filter((e): e is Extract<SessionEvent, { type: "session_started" }> => e.type === "session_started");
  return started
    .map((e) => ({ sessionId: e.sessionId, wallClock: e.wallClock, programId: e.programId }))
    .sort((a, b) => (a.wallClock < b.wallClock ? 1 : -1));
}
