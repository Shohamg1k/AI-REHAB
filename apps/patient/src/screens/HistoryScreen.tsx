import { useEffect, useState } from "react";
import type { AdherenceDay, RomTrendSeries, SessionSummary } from "@ai-rehab/contracts";
import { ApiError, fetchAdherence, fetchRomTrend, fetchSessions, isApiConfigured } from "../lib/api.js";
import { adherenceFromSessions, loadLocalSessions } from "../lib/localHistory.js";
import { isSignedIn } from "../lib/authStore.js";

/**
 * M9 — Progress. G2 (session list + ROM trend) and H1/H2 (streak, week
 * strip, milestones). Consent and the access log used to live here too;
 * they now have their own screen (M10) so there is exactly one place to
 * change who can see what.
 *
 * The design's form-score chart and left-vs-right symmetry card are not
 * reproduced: neither a cross-session score series nor per-side comparison
 * is computed anywhere yet, and drawing the artboard's sample curve would
 * be showing the patient a trend that is not theirs.
 */

/** The last seven days as (letter, isActive, isToday), oldest first. */
function lastSevenDays(active: Set<string>): Array<{ key: string; letter: string; on: boolean; today: boolean }> {
  const out = [];
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      key,
      letter: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()]!,
      on: active.has(key),
      today: key === todayKey
    });
  }
  return out;
}

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
    // Guests are the default (H7), and their sessions only ever existed in
    // IndexedDB. Reading the server for a patient with no account produced
    // an empty screen however much work they had actually done.
    const signedIn = isApiConfigured() && isSignedIn();

    if (!signedIn) {
      loadLocalSessions()
        .then((local) => {
          setSessions(local);
          setAdherence(adherenceFromSessions(local));
          setRomTrend([]);
        })
        .catch(() => setError("Couldn't read your history from this device."));
      return;
    }

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
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-12 px-20 pb-10 pt-8">
      <h1 className="text-d1 text-ink">Progress</h1>

      {error && <p className="text-b2 text-dang">{error}</p>}

      {adherence && (
        <div className="ds-card-hair flex flex-col gap-11">
          <div className="flex items-baseline">
            <span className="flex-1 text-h2 text-ink">
              {streak && streak > 0 ? `${streak}-day streak` : "No streak yet"}
            </span>
            <span className="font-mono text-[11px] uppercase text-ink-3">
              {lastSevenDays(activeDays).filter((d) => d.on).length} of 7 days
            </span>
          </div>
          <div className="flex gap-6" role="img" aria-label="Activity for the last seven days">
            {lastSevenDays(activeDays).map((d, i) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-5">
                <span className="font-mono text-[10px] text-ink-3">{d.letter}</span>
                <span
                  title={d.key}
                  className={`h-30 w-full rounded-sm ${
                    d.on
                      ? "bg-teal"
                      : d.today
                        ? "bg-teal-wash shadow-[inset_0_0_0_1.5px_#0D6E68]"
                        : "bg-sunk"
                  }`}
                  data-day={i}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {milestones && (
        <div className="flex flex-wrap gap-8">
          {milestones.map((m) => (
            <span
              key={m.id}
              className={`ds-chip ${m.achieved ? "bg-ok-wash text-ok" : "bg-sunk text-ink-3"}`}
            >
              {m.achieved ? "✓ " : ""}
              {m.label}
            </span>
          ))}
        </div>
      )}

      {adherence && (
        <div className="ds-card-hair">
          <span className="ds-label">Last 4 weeks</span>
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
        <div className="ds-card-hair">
          <span className="ds-label">Range of motion</span>
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
        <span className="ds-label">Sessions</span>
        {sessions === null && !error && <p className="mt-4 text-b2 text-ink-2">Loading…</p>}
        {sessions && sessions.length === 0 && (
          <p className="mt-4 text-b2 text-ink-2">No synced sessions yet.</p>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="mt-8 flex flex-col gap-8">
            {sessions.map((s) => (
              <li key={s.sessionId} className="rounded-md bg-surf p-12 shadow-hair">
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
