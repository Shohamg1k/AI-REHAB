import { EXERCISES } from "@ai-rehab/exercises";
import { Chip } from "./Chip.js";

/**
 * Choosing which exercises to do. Shared by onboarding and the Program
 * screen's editor, because they are the same decision made at different
 * moments — two copies would drift.
 *
 * Each row is a real `<label>` wrapping its checkbox, so tapping the name
 * toggles it. That is not a detail: the first version of the clinician's
 * program form had the checkbox and the name as siblings, and tapping the
 * name silently did nothing.
 */
export function ExercisePicker({
  selected,
  onToggle
}: {
  selected: readonly string[];
  onToggle: (exerciseId: string) => void;
}) {
  const chosen = new Set(selected);

  return (
    <div className="flex flex-col gap-8">
      {EXERCISES.map((spec) => {
        const on = chosen.has(spec.id);
        return (
          <label
            key={spec.id}
            className={`flex cursor-pointer items-start gap-11 rounded-md p-14 transition-shadow ${
              on ? "bg-teal-wash shadow-[inset_0_0_0_1px_#9CCFC8]" : "bg-surf shadow-hair"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(spec.id)}
              className="mt-2 h-20 w-20 flex-none accent-teal"
            />
            <span className="flex flex-1 flex-col gap-4">
              <span className={`text-b1 font-medium ${on ? "text-teal-deep" : "text-ink"}`}>
                {spec.displayName}
              </span>
              <span className="flex flex-wrap gap-6">
                <Chip tone={on ? "teal" : "mute"}>
                  {spec.targetRegions.join(" · ").toUpperCase()}
                </Chip>
                <Chip tone="mute">{spec.movementType.toUpperCase()}</Chip>
              </span>
              <span className="text-b2 text-ink-2">{spec.rationale}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
