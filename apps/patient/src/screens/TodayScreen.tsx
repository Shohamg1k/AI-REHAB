import { EXERCISES } from "@ai-rehab/exercises";
import { RationaleCard } from "../components/RationaleCard.js";
import { Button } from "../components/Button.js";

/** M2/M3 (trimmed for MVP) — pick today's exercise, C6 rationale shown per option. */
export function TodayScreen({ onPick }: { onPick: (exerciseId: string) => void }) {
  return (
    <div className="flex flex-col gap-20 px-16 py-24 max-w-lg mx-auto w-full">
      <div>
        <h1 className="text-heading-20 text-text-primary">Today's session</h1>
        <p className="text-body-sm text-text-secondary mt-4">Choose an exercise to begin.</p>
      </div>

      <div className="flex flex-col gap-16">
        {EXERCISES.map((spec) => (
          <div key={spec.id} className="bg-surface border border-border rounded-lg p-16 flex flex-col gap-12">
            <div className="flex items-center justify-between">
              <span className="text-title text-text-primary">{spec.displayName}</span>
              <span className="text-caption text-text-muted capitalize">{spec.movementType}</span>
            </div>
            <RationaleCard spec={spec} />
            <Button onClick={() => onPick(spec.id)}>Start {spec.displayName}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
