import type { BodyRegion, FormScore, RepEvent } from "@ai-rehab/contracts";
import { FORM_SCORE_CONFIDENCE_FLOOR, repConsistency } from "@ai-rehab/core";
import { Button } from "../components/Button.js";
import { Disclaimer } from "../components/Disclaimer.js";

/**
 * M8 / H4 — session summary.
 *
 * Deliberately more than a score. Every reference implementation surveyed
 * (STGCN-rehab, Liao/Vakanski) ends at a single scalar, which tells a
 * patient nothing about what to change. This shows the set as a shape: how
 * consistent the reps were, which was the best, where the range trended,
 * and what to work on — each traceable to a named criterion.
 *
 * Laid out to the design's stat grid and observations list, but the
 * observations are derived from the set that was actually performed rather
 * than the artboard's samples. The design's streak row and "Send a note to
 * Ruth" are not reproduced: neither streak history nor clinician messaging
 * exists yet, and a button that sends nothing is worse than no button.
 */

type ScoredRep = { rep: RepEvent; score: FormScore };

function Stat({
  label,
  value,
  sublabel,
  tone = "muted"
}: {
  label: string;
  value: string;
  sublabel: string;
  tone?: "ok" | "pain" | "muted";
}) {
  const subColour =
    tone === "ok" ? "text-ok" : tone === "pain" ? "text-pain" : "text-ink-3";
  return (
    <div className="ds-card-hair flex flex-1 flex-col gap-2 p-13">
      <span className="ds-label">{label}</span>
      <span className="font-mono text-[25px] font-semibold tracking-[-.02em] text-ink">{value}</span>
      <span className={`font-mono text-lb uppercase ${subColour}`}>{sublabel}</span>
    </div>
  );
}

function Observation({ tone, children }: { tone: "ok" | "pain" | "muted"; children: React.ReactNode }) {
  const dot = tone === "ok" ? "bg-ok" : tone === "pain" ? "bg-pain" : "bg-ink-3";
  return (
    <div className="flex items-start gap-10">
      <span className={`mt-8 h-5 w-5 flex-none rounded-pill ${dot}`} />
      <span className="text-b2 text-ink-2">{children}</span>
    </div>
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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex flex-col gap-14 px-20 pt-10">
        <div className="flex flex-col gap-4">
          <span className="ds-label">{exerciseName}</span>
          <h1 className="text-d1 text-ink">Set complete</h1>
        </div>

        <div className="flex flex-col gap-10">
          <div className="flex items-stretch gap-10">
            <Stat
              label="Reps"
              value={String(reps.length)}
              sublabel={lowConfidenceCount === 0 ? "All reps scored" : `${confident.length} scored`}
              tone={lowConfidenceCount === 0 ? "ok" : "muted"}
            />
            <Stat
              label="Form"
              value={avgScore === null ? "—" : String(avgScore)}
              sublabel={avgScore === null ? "Not enough signal" : "Average this set"}
              tone={avgScore !== null && avgScore >= 80 ? "ok" : "muted"}
            />
          </div>
          <div className="flex items-stretch gap-10">
            <Stat
              label="Discomfort"
              value={painReport ? `${painReport.severity}/5` : "None"}
              sublabel={
                painReport?.region ? painReport.region.replace(/_/g, " ") : "Nothing reported"
              }
              tone={painReport && painReport.severity > 0 ? "pain" : "muted"}
            />
            <Stat
              label="Capture"
              value={lowConfidenceCount === 0 ? "Good" : "Mixed"}
              sublabel={
                lowConfidenceCount === 0
                  ? "Scores trustworthy"
                  : `${lowConfidenceCount} rep${lowConfidenceCount === 1 ? "" : "s"} unscored`
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-10">
          <span className="ds-label">What we noticed</span>

          {best && (
            <Observation tone="ok">
              Your best was rep{" "}
              <span className="font-mono font-semibold text-ink">{best.rep.repIndex + 1}</span> at{" "}
              <span className="font-mono font-semibold text-ink">
                {Math.round(best.score.score)}
              </span>
              . {best.score.reason}
            </Observation>
          )}

          {consistency !== null && (
            <Observation tone={consistency >= 85 ? "ok" : "muted"}>
              {consistency >= 85
                ? "Your range held steady from the first rep to the last."
                : "Your range drifted across the set — often a sign of fatigue."}
            </Observation>
          )}

          {topShortfall && (
            <Observation tone="muted">
              Work on next time: <span className="text-ink">{topShortfall[0]}</span> — it came up
              short on{" "}
              <span className="font-mono font-semibold text-ink">{topShortfall[1]}</span> of{" "}
              {confident.length} scored {confident.length === 1 ? "rep" : "reps"}.
            </Observation>
          )}

          {painReport && (
            <Observation tone="pain">
              You reported {painReport.severity} out of 5
              {painReport.region ? ` in your ${painReport.region.replace(/_/g, " ")}` : ""}. It is
              saved with this set.
            </Observation>
          )}

          {lowConfidenceCount > 0 && (
            <Observation tone="muted">
              {lowConfidenceCount} rep{lowConfidenceCount === 1 ? "" : "s"} had low tracking
              confidence and {lowConfidenceCount === 1 ? "is" : "are"} not included above.
            </Observation>
          )}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-12 pt-20">
        <Button onClick={onDone}>Done for today</Button>
        <Disclaimer>
          These numbers describe what the camera could see. They are not a clinical assessment.
        </Disclaimer>
      </div>
    </div>
  );
}
