import type { ExerciseSpec } from "@ai-rehab/contracts";

/** C6 — "why this exercise" card. One sentence, straight from the exercise spec. */
export function RationaleCard({ spec }: { spec: ExerciseSpec }) {
  return (
    <div className="bg-brand-soft border border-brand-border rounded-lg p-16">
      <div className="text-label text-brand mb-4">Why this exercise</div>
      <p className="text-body text-text-primary">{spec.rationale}</p>
      {spec.provisional && (
        <p className="text-caption text-text-muted mt-8">
          {spec.provisionalNote ?? "Reference ranges for this exercise are provisional."}
        </p>
      )}
    </div>
  );
}
