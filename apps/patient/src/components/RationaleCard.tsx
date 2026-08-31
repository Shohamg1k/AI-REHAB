import type { ExerciseSpec } from "@ai-rehab/contracts";

/** C6 — "why this exercise" card. One sentence, straight from the exercise spec. */
export function RationaleCard({ spec }: { spec: ExerciseSpec }) {
  return (
    <div className="bg-teal-wash border border-teal-wash rounded-lg p-16">
      <div className="text-b2 font-medium text-teal mb-4">Why this exercise</div>
      <p className="text-b1 text-ink">{spec.rationale}</p>
      {spec.provisional && (
        <p className="text-cap text-ink-3 mt-8">
          {spec.provisionalNote ?? "Reference ranges for this exercise are provisional."}
        </p>
      )}
    </div>
  );
}
