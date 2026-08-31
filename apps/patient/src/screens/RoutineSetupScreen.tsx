import { useState } from "react";
import { EXERCISES } from "@ai-rehab/exercises";
import { Button } from "../components/Button.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { ExercisePicker } from "../components/ExercisePicker.js";

/**
 * Onboarding: pick what you actually want to work on, before the first
 * session rather than after discovering the app chose for you.
 *
 * Everything starts ticked. That keeps the default identical to the
 * behaviour before this screen existed — a patient who taps straight through
 * gets exactly what they got before — and makes this a subtractive choice,
 * which is the easier one to make about your own body. It is also the honest
 * default: choosing a *smaller* starting set for someone would be a clinical
 * recommendation, and nothing here is qualified to make one.
 *
 * Shown once. It is reachable again from Program, and says so, because a
 * setup step that feels permanent is one people rush.
 */
export function RoutineSetupScreen({
  onDone
}: {
  onDone: (exerciseIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => EXERCISES.map((e) => e.id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="flex flex-col gap-6 px-20 pt-8">
        <span className="ds-label">Setting up</span>
        <h1 className="text-d1 text-ink">What do you want to work on?</h1>
        <p className="text-b2 text-ink-2">
          Pick the exercises you want in your routine. You can change this at any time from the
          Program tab — nothing here is final.
        </p>
      </div>

      <div className="px-20 pt-16">
        <ExercisePicker selected={selected} onToggle={toggle} />
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-18 pt-20">
        <Button onClick={() => onDone(selected)} disabled={selected.length === 0}>
          {selected.length === 0
            ? "Pick at least one"
            : `Start with ${selected.length} exercise${selected.length === 1 ? "" : "s"}`}
        </Button>
        <Disclaimer>
          These are coaching exercises with provisional reference ranges, not a prescription. If a
          clinician has given you a program, follow that.
        </Disclaimer>
      </div>
    </div>
  );
}
