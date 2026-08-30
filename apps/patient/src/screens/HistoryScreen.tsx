import { useEffect, useState } from "react";
import type { AdherenceDay, AuditEntry, RomTrendSeries, SessionSummary } from "@ai-rehab/contracts";
import { ApiError, fetchAdherence, fetchAuditLog, fetchMe, fetchRomTrend, fetchSessions, updateDataSharing } from "../lib/api.js";

/**
 * G2 (session list + ROM trend) + H1/H2 (streak, calendar, milestones) +
 * G5 (patient-visible access log + the data-sharing toggle that actually
 * gates it — see apps/api/src/routes/patients.ts), in one screen. Nothing
 * here blocks the guest-first flow: only reachable when signed in.
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

type Milestone = { id: string; label: string; achieved: boolean };

/**
 * Client-side only — thresholds are illustrative gamification, not a
 * clinical claim, so there's no reason for apps/api to know about them.
 */
function computeMilestones(streak: number, totalSessions: number): Milestone[] {
  return [
    { id: "first-session", label: "First session", achieved: totalSessions >= 1 },
    { id: "streak-3", label: "3-day streak", achieved: streak >= 3 },
    { id: "sessions-10", label: "10 sessions", achieved: totalSessions >= 10 },
    { id: "streak-7", label: "7-day streak", achieved: streak >= 7 },
    { id: "sessions-25", label: "25 sessions", achieved: totalSessions >= 25 },
    { id: "streak-30", label: "30-day streak", achieved: streak >= 30 }
  ];
}

/** A minimal inline sparkline — no charting dependency for one line per joint. */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="text-caption text-text-muted">Not enough sessions yet for a trend.</div>;
  }
  const width = 200;
  const height = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full" role="img" aria-label="Range-of-motion trend">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={2} className="text-brand" />
    </svg>
  );
}

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [adherence, setAdherence] = useState<AdherenceDay[] | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[] | null>(null);
  const [romTrend, setRomTrend] = useState<RomTrendSeries[] | null>(null);
  const [dataSharingEnabled, setDataSharingEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharingSaving, setSharingSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchSessions(), fetchAdherence(), fetchAuditLog(), fetchRomTrend(), fetchMe()])
      .then(([s, a, l, r, me]) => {
        setSessions(s);
        setAdherence(a);
        setAuditLog(l);
        setRomTrend(r);
        setDataSharingEnabled(me.dataSharingEnabled);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your history."));
  }, []);

  async function handleToggleSharing() {
    if (dataSharingEnabled === null) return;
    setSharingSaving(true);
    try {
      const updated = await updateDataSharing(!dataSharingEnabled);
      setDataSharingEnabled(updated.dataSharingEnabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update data sharing.");
    } finally {
      setSharingSaving(false);
    }
  }

  const streak = adherence ? computeStreak(adherence) : null;
  const activeDays = new Set((adherence ?? []).filter((d) => d.sessionCount > 0).map((d) => d.date));
  const milestones = sessions && adherence ? computeMilestones(streak ?? 0, sessions.length) : null;

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

      {milestones && (
        <div className="flex flex-wrap gap-8">
          {milestones.map((m) => (
            <span
              key={m.id}
              className={`rounded-pill border px-12 py-4 text-caption ${
                m.achieved
                  ? "border-success bg-success-soft text-success"
                  : "border-border bg-subtle text-text-muted"
              }`}
            >
              {m.achieved ? "✓ " : ""}
              {m.label}
            </span>
          ))}
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

      {romTrend && romTrend.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-16">
          <span className="text-label uppercase tracking-wide text-text-secondary">Range of motion</span>
          <div className="mt-8 flex flex-col gap-12">
            {romTrend.map((series) => {
              const first = series.points[0]?.peakAngle;
              const last = series.points[series.points.length - 1]?.peakAngle;
              const delta = first !== undefined && last !== undefined ? Math.round(last - first) : null;
              return (
                <div key={`${series.exerciseId}:${series.joint}`}>
                  <div className="flex items-center justify-between text-body-sm text-text-primary">
                    <span>
                      {series.exerciseId} — {series.joint.replace(/_/g, " ")}
                    </span>
                    {delta !== null && (
                      <span className={delta >= 0 ? "text-success" : "text-danger"}>
                        {delta >= 0 ? "+" : ""}
                        {delta}° since first session
                      </span>
                    )}
                  </div>
                  <Sparkline points={series.points.map((p) => p.peakAngle)} />
                </div>
              );
            })}
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

      <div className="rounded-lg border border-border bg-surface p-16">
        <div className="flex items-center justify-between gap-16">
          <div>
            <span className="text-label uppercase tracking-wide text-text-secondary">Data sharing</span>
            <p className="mt-4 text-body-sm text-text-primary">
              {dataSharingEnabled === false
                ? "Your clinician cannot currently view your session data."
                : "Your clinician can view your session data."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dataSharingEnabled ?? undefined}
            disabled={dataSharingEnabled === null || sharingSaving}
            onClick={handleToggleSharing}
            className={`min-h-touch shrink-0 rounded-pill border px-16 text-body-sm ${
              dataSharingEnabled
                ? "border-brand-border bg-brand-soft text-brand"
                : "border-border bg-subtle text-text-secondary"
            }`}
          >
            {dataSharingEnabled ? "On" : "Off"}
          </button>
        </div>
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
