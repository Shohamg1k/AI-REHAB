import { useEffect, useState } from "react";
import type { AdherenceDay, AuditEntry, SessionSummary } from "@ai-rehab/contracts";
import { ApiError, fetchAdherence, fetchAuditLog, fetchSessions } from "../lib/api.js";

/**
 * G2 (session list) + H1/H2 (streak, calendar) + G5 (patient-visible
 * access log), in one screen — all three read from data `apps/api` already
 * computed; this is the UI half that didn't exist before. Nothing here
 * blocks the guest-first flow: only reachable when signed in.
 */

function computeStreak(days: AdherenceDay[]): number {
  const active = new Set(days.filter((d) => d.sessionCount > 0).map((d) => d.date));
  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!active.has(todayKey)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (active.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function last28DayKeys(): string[] {
  const keys: string[] = [];
  const cursor = new Date();
  for (let i = 27; i >= 0; i--) {
    const d = new Date(cursor);
    d.setDate(cursor.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [adherence, setAdherence] = useState<AdherenceDay[] | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSessions(), fetchAdherence(), fetchAuditLog()])
      .then(([s, a, l]) => {
        setSessions(s);
        setAdherence(a);
        setAuditLog(l);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your history."));
  }, []);

  const streak = adherence ? computeStreak(adherence) : null;
  const activeDays = new Set((adherence ?? []).filter((d) => d.sessionCount > 0).map((d) => d.date));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-16 px-16 py-24">
      <button type="button" onClick={onBack} className="w-fit text-body-sm text-brand underline">
        ← Back
      </button>

      <h1 className="text-heading-20 text-text-primary">Your history</h1>

      {error && <p className="text-body-sm text-danger">{error}</p>}

      {streak !== null && streak > 0 && (
        <div className="rounded-lg border border-brand-border bg-brand-soft p-16 text-center">
          <span className="text-metric text-brand">{streak}</span>
          <p className="text-caption text-text-muted">day streak</p>
        </div>
      )}

      {adherence && (
        <div className="rounded-lg border border-border bg-surface p-16">
          <span className="text-label uppercase tracking-wide text-text-secondary">Last 4 weeks</span>
          <div className="mt-8 grid grid-cols-7 gap-4" role="img" aria-label="Session activity calendar, last 28 days">
            {last28DayKeys().map((key) => (
              <div
                key={key}
                title={key}
                className={`aspect-square rounded ${activeDays.has(key) ? "bg-brand" : "bg-subtle"}`}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="text-label uppercase tracking-wide text-text-secondary">Sessions</span>
        {sessions === null && !error && <p className="mt-4 text-body-sm text-text-secondary">Loading…</p>}
        {sessions && sessions.length === 0 && (
          <p className="mt-4 text-body-sm text-text-secondary">No synced sessions yet.</p>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="mt-8 flex flex-col gap-8">
            {sessions.map((s) => (
              <li key={s.sessionId} className="rounded-lg border border-border bg-surface p-12">
                <div className="flex items-center justify-between text-body-sm text-text-primary">
                  <span>{s.wallClock ? new Date(s.wallClock).toLocaleDateString() : "Unknown date"}</span>
                  <span className="text-text-muted">{s.exerciseIds.join(", ") || "—"}</span>
                </div>
                <div className="text-caption text-text-muted">
                  {s.repCount} rep{s.repCount === 1 ? "" : "s"}
                  {s.avgFormScore !== null ? ` · avg score ${s.avgFormScore}` : " · not enough signal to score"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <span className="text-label uppercase tracking-wide text-text-secondary">Who's viewed your data</span>
        {auditLog && auditLog.length === 0 && (
          <p className="mt-4 text-body-sm text-text-secondary">No clinician has viewed your data.</p>
        )}
        {auditLog && auditLog.length > 0 && (
          <ul className="mt-8 flex flex-col gap-4">
            {auditLog.map((entry) => (
              <li key={entry.id} className="text-caption text-text-muted">
                {entry.actorDisplayName} — {entry.action.replace("_", " ")} —{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
