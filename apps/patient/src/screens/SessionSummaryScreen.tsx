import type { BodyRegion, FormScore, RepEvent } from "@ai-rehab/contracts";
import { MetricCard } from "../components/MetricCard.js";
import { Button } from "../components/Button.js";
import { FORM_SCORE_CONFIDENCE_FLOOR } from "@ai-rehab/core";

/** H4 — post-session summary card. Reps, score, pain, closure — a session needs an ending. */
export function SessionSummaryScreen({
  exerciseName,
  reps,
  painReport,
  onDone
}: {
  exerciseName: string;
  reps: Array<{ rep: RepEvent; score: FormScore }>;
  painReport: { region: BodyRegion | null; severity: number } | null;
  onDone: () => void;
}) {
  const confidentScores = reps.map((r) => r.score).filter((s) => s.confidence >= FORM_SCORE_CONFIDENCE_FLOOR);
  const avgScore =
    confidentScores.length > 0
      ? Math.round(confidentScores.reduce((sum, s) => sum + s.score, 0) / confidentScores.length)
      : null;
  const lowConfidenceCount = reps.length - confidentScores.length;

  return (
    <div className="flex flex-col gap-20 px-16 py-24 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-heading-20 text-text-primary">Session complete</h1>
        <p className="text-body-sm text-text-secondary mt-4">{exerciseName}</p>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <MetricCard label="Reps completed" value={reps.length} caption="This set" />
        <MetricCard
          label="Average form score"
          value={avgScore ?? "—"}
          caption={avgScore !== null ? "Across confident reps" : "Not enough signal to score"}
        />
      </div>

      {lowConfidenceCount > 0 && (
        <p className="text-caption text-text-muted">
          {lowConfidenceCount} rep{lowConfidenceCount === 1 ? "" : "s"} had low tracking confidence and{" "}
          {lowConfidenceCount === 1 ? "isn't" : "aren't"} included in your average.
        </p>
      )}

      <div className="bg-surface border border-border rounded-lg p-16">
        <span className="text-label text-text-secondary">Pain this session</span>
        {painReport ? (
          <p className="text-body text-text-primary mt-4">
            You said {painReport.severity}/5{painReport.region ? ` — ${painReport.region.replace("_", " ")}` : ""}.
          </p>
        ) : (
          <p className="text-body text-text-primary mt-4">No pain reported.</p>
        )}
      </div>

      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
