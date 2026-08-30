import type { BodyRegion, FormScore, RepEvent } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR, repConsistency } from "@ai-rehab/core";
import { Button } from "../components/Button.js";

/**
 * H4 — post-session summary.
 *
 * Deliberately more than a score. Every reference implementation surveyed
 * (STGCN-rehab, Liao/Vakanski) ends at a single scalar, which tells a
 * patient nothing about what to change. This shows the set as a shape:
 * how consistent the reps were, which was the best, where the range
 * trended, and what to work on — each traceable to a named criterion.
 */

type ScoredRep = { rep: RepEvent; score: FormScore };

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 28 - ((v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SessionSummaryScreen({
  exerciseName,
  reps,
  painReport,
  onDone
}: {
  exerciseName: string;
  reps: ScoredRep[];
  painReport: { region: BodyRegion | null; severity: number } | null;
  onDone: () => void;
}) {
  const confident = reps.filter((r) => r.score.confidence >= FORM_SCORE_CONFIDENCE_FLOOR);
  const avgScore =
    confident.length > 0
      ? Math.round(confident.reduce((sum, r) => sum + r.score.score, 0) / confident.length)
      : null;
  const lowConfidenceCount = reps.length - confident.length;

  const romPerRep = confident.map((r) => {
    const peaks = Object.values(r.rep.peakAngles).filter(
      (v): v is number => typeof v === "number"
    );
    return peaks.length > 0 ? Math.max(...peaks) : 0;
  });
  const consistency = romPerRep.length >= 2 ? Math.round(repConsistency(romPerRep) * 100) : null;

  const best = confident.reduce<ScoredRep | null>(
    (acc, r) => (!acc || r.score.score > acc.score.score ? r : acc),
    null
  );

  // What to work on: the criterion that fell short most often across the set,
  // named rather than implied — the patient should leave knowing one thing.
  const shortfalls = new Map<string, number>();
  for (const r of confident) {
    for (const item of r.score.breakdown) {
      if (item.status === "fail" || item.status === "warn") {
        shortfalls.set(item.label, (shortfalls.get(item.label) ?? 0) + 1);
      }
    }
  }
  const topShortfall = [...shortfalls.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  const tone =
    avgScore === null
      ? "neutral"
      : avgScore >= 80
        ? "good"
        : avgScore >= 55
          ? "fair"
          : "work";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-16 px-16 py-24">
      <div className="flex flex-col items-center gap-8 rounded-xl border border-border bg-surface p-24 text-center">
        <span aria-hidden className="text-heading-24">
          {tone === "good" ? "🎉" : "✅"}
        </span>
        <h1 className="text-heading-20 text-text-primary">Set complete</h1>
        <p className="text-body-sm text-text-secondary">{exerciseName}</p>

        <div className="mt-8 flex items-end gap-24">
          <div className="flex flex-col items-center">
            <span className="text-metric tabular-nums text-text-primary">{reps.length}</span>
            <span className="text-label uppercase tracking-wide text-text-secondary">Reps</span>
          </div>
          <div className="flex flex-col items-center">
            <span
              className={`text-metric tabular-nums ${
                tone === "good"
                  ? "text-emerald-600"
                  : tone === "work"
                    ? "text-amber-600"
                    : "text-text-primary"
              }`}
            >
              {avgScore ?? "—"}
            </span>
            <span className="text-label uppercase tracking-wide text-text-secondary">Form</span>
          </div>
          {consistency !== null && (
            <div className="flex flex-col items-center">
              <span className="text-metric tabular-nums text-text-primary">{consistency}</span>
              <span className="text-label uppercase tracking-wide text-text-secondary">
                Consistency
              </span>
            </div>
          )}
        </div>
      </div>

      {romPerRep.length >= 2 && (
        <div className="flex flex-col gap-8 rounded-lg border border-border bg-surface p-16">
          <div className="flex items-baseline justify-between">
            <span className="text-label uppercase tracking-wide text-text-secondary">
              Range across the set
            </span>
            <span className="text-caption text-text-muted">
              rep 1 → rep {romPerRep.length}
            </span>
          </div>
          <div className="text-brand">
            <Sparkline values={romPerRep} />
          </div>
          <p className="text-caption text-text-muted">
            {consistency !== null && consistency >= 85
              ? "Your range held steady from first rep to last."
              : "Your range drifted across the set — often a sign of fatigue."}
          </p>
        </div>
      )}

      {best && (
        <div className="rounded-lg border border-border bg-surface p-16">
          <span className="text-label uppercase tracking-wide text-text-secondary">Best rep</span>
          <p className="mt-4 text-body text-text-primary">
            Rep {best.rep.repIndex + 1} — {Math.round(best.score.score)} / 100
          </p>
          <p className="text-caption text-text-muted">{best.score.reason}</p>
        </div>
      )}

      {topShortfall && (
        <div className="rounded-lg border border-brand-border bg-brand-soft p-16">
          <span className="text-label uppercase tracking-wide text-brand">Work on next time</span>
          <p className="mt-4 text-body text-text-primary">{topShortfall[0]}</p>
          <p className="text-caption text-text-muted">
            Came up short on {topShortfall[1]} of {confident.length} scored{" "}
            {confident.length === 1 ? "rep" : "reps"}.
          </p>
        </div>
      )}

      {lowConfidenceCount > 0 && (
        <p className="text-caption text-text-muted">
          {lowConfidenceCount} rep{lowConfidenceCount === 1 ? "" : "s"} had low tracking confidence
          and {lowConfidenceCount === 1 ? "is" : "are"} not included above.
        </p>
      )}

      <div className="rounded-lg border border-border bg-surface p-16">
        <span className="text-label uppercase tracking-wide text-text-secondary">
          Pain this session
        </span>
        {painReport ? (
          <p className="mt-4 text-body text-text-primary">
            You said {painReport.severity} out of 5
            {painReport.region ? ` — ${painReport.region.replace("_", " ")}` : ""}.
          </p>
        ) : (
          <p className="mt-4 text-body text-text-primary">No pain reported.</p>
        )}
      </div>

      <p className="text-caption text-text-muted">
        These numbers describe what the camera could see. They are not a clinical assessment.
      </p>

      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
