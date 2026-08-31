import { useEffect, useState } from "react";
import type { AdherenceDay, RomTrendSeries, SessionSummary } from "@ai-rehab/contracts";
import { ApiError, fetchAdherence, fetchRomTrend, fetchSessions } from "../lib/api.js";

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
    return <div className="text-cap text-ink-3">Not enough sessions yet for a trend.</div>;
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
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={2} className="text-teal" />
    </svg>
  );
}

export function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [adherence, setAdherence] = useState<AdherenceDay[] | null>(null);
  const [romTrend, setRomTrend] = useState<RomTrendSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSessions(), fetchAdherence(), fetchRomTrend()])
      .then(([s, a, r]) => {
        setSessions(s);
        setAdherence(a);
        setRomTrend(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your history."));
  }, []);


  const streak = adherence ? computeStreak(adherence) : null;
  const activeDays = new Set((adherence ?? []).filter((d) => d.sessionCount > 0).map((d) => d.date));
  const milestones = sessions && adherence ? computeMilestones(streak ?? 0, sessions.length) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-16 px-16 py-24">
      <h1 className="text-h1 text-ink">Your history</h1>

      {error && <p className="text-b2 text-dang">{error}</p>}

      {streak !== null && streak > 0 && (
        <div className="rounded-lg border border-teal-wash bg-teal-wash p-16 text-center">
          <span className="text-metric text-teal">{streak}</span>
          <p className="text-cap text-ink-3">day streak</p>
        </div>
      )}

      {milestones && (
        <div className="flex flex-wrap gap-8">
          {milestones.map((m) => (
            <span
              key={m.id}
              className={`rounded-pill border px-12 py-4 text-cap ${
                m.achieved
                  ? "border-ok bg-ok-wash text-ok"
                  : "border-line bg-sunk text-ink-3"
              }`}
            >
              {m.achieved ? "✓ " : ""}
              {m.label}
            </span>
          ))}
        </div>
      )}

      {adherence && (
        <div className="rounded-lg border border-line bg-surf p-16">
          <span className="text-b2 font-medium uppercase tracking-wide text-ink-2">Last 4 weeks</span>
          <div className="mt-8 grid grid-cols-7 gap-4" role="img" aria-label="Session activity calendar, last 28 days">
            {last28DayKeys().map((key) => (
              <div
                key={key}
                title={key}
                className={`aspect-square rounded ${activeDays.has(key) ? "bg-teal" : "bg-sunk"}`}
              />
            ))}
          </div>
        </div>
      )}

      {romTrend && romTrend.length > 0 && (
        <div className="rounded-lg border border-line bg-surf p-16">
          <span className="text-b2 font-medium uppercase tracking-wide text-ink-2">Range of motion</span>
          <div className="mt-8 flex flex-col gap-12">
            {romTrend.map((series) => {
              const first = series.points[0]?.peakAngle;
              const last = series.points[series.points.length - 1]?.peakAngle;
              const delta = first !== undefined && last !== undefined ? Math.round(last - first) : null;
              return (
                <div key={`${series.exerciseId}:${series.joint}`}>
                  <div className="flex items-center justify-between text-b2 text-ink">
                    <span>
                      {series.exerciseId} — {series.joint.replace(/_/g, " ")}
                    </span>
                    {delta !== null && (
                      <span className={delta >= 0 ? "text-ok" : "text-dang"}>
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
        <span className="text-b2 font-medium uppercase tracking-wide text-ink-2">Sessions</span>
        {sessions === null && !error && <p className="mt-4 text-b2 text-ink-2">Loading…</p>}
        {sessions && sessions.length === 0 && (
          <p className="mt-4 text-b2 text-ink-2">No synced sessions yet.</p>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="mt-8 flex flex-col gap-8">
            {sessions.map((s) => (
              <li key={s.sessionId} className="rounded-lg border border-line bg-surf p-12">
                <div className="flex items-center justify-between text-b2 text-ink">
                  <span>{s.wallClock ? new Date(s.wallClock).toLocaleDateString() : "Unknown date"}</span>
                  <span className="text-ink-3">{s.exerciseIds.join(", ") || "—"}</span>
                </div>
                <div className="text-cap text-ink-3">
                  {s.repCount} rep{s.repCount === 1 ? "" : "s"}
                  {s.avgFormScore !== null ? ` · avg score ${s.avgFormScore}` : " · not enough signal to score"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
