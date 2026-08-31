import { EXERCISES } from "@ai-rehab/exercises";
import type { ExerciseSpec } from "@ai-rehab/contracts";
import { Button } from "../components/Button.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { Icon } from "../components/Icon.js";

/**
 * M2 — Today. The hub: what to do now, why, and one way to start it.
 *
 * Follows the design's structure (header, program list with exactly one
 * lifted "up next" card, footer CTA) but is driven by the real exercise
 * catalogue rather than the artboard's sample content. The mock's daily
 * check-in ("How is the knee today?") and streak chip are not reproduced:
 * both imply stored state this app does not yet have anywhere to put, and a
 * control that silently discards a patient's answer about their knee is
 * worse than no control. Tracked in docs/STATUS.md.
 */

function ExerciseRow({
  spec,
  state,
  prescription,
  onPick
}: {
  spec: ExerciseSpec;
  state: "done" | "next" | "upcoming";
  /** `3 × 10` when a clinician has assigned this exercise; absent for a guest. */
  prescription?: string;
  onPick: (id: string) => void;
}) {
  // Sets and reps live on an assigned Program, not on the spec — a guest
  // with no clinician has no prescription, so the row describes the
  // movement instead of inventing numbers for it.
  const meta = prescription ?? spec.movementType;

  if (state === "next") {
    return (
      <button
        type="button"
        onClick={() => onPick(spec.id)}
        className="ds-card-lift flex w-full flex-col gap-11 text-left"
      >
        <div className="flex items-center gap-11">
          <span className="flex h-38 w-38 flex-none items-center justify-center rounded bg-teal-wash text-teal">
            <Icon name="chart" className="h-20 w-20" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-b1 font-semibold text-ink">{spec.displayName}</span>
            <span className="font-mono text-[11.5px] uppercase text-ink-3">
              {meta} · up next
            </span>
          </span>
          <Icon name="chevron" className="h-18 w-18 flex-none text-ink-3" />
        </div>
        <span className="h-1 bg-line" />
        <span className="text-b2 text-ink-2">
          <b className="font-semibold text-ink">Why this one — </b>
          {spec.rationale}
        </span>
      </button>
    );
  }

  const done = state === "done";
  return (
    <button
      type="button"
      onClick={() => onPick(spec.id)}
      className={`flex w-full items-center gap-11 rounded-md bg-surf p-14 text-left shadow-hair ${
        done ? "opacity-[.72]" : ""
      }`}
    >
      <span
        className={`flex h-38 w-38 flex-none items-center justify-center rounded ${
          done ? "bg-ok-wash text-ok" : "bg-sunk text-ink-2"
        }`}
      >
        <Icon name={done ? "check" : "chart"} className="h-20 w-20" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-b1 font-medium text-ink">{spec.displayName}</span>
        <span className={`font-mono text-[11.5px] uppercase ${done ? "text-ok" : "text-ink-3"}`}>
          {meta}
        </span>
      </span>
      {!done && <Icon name="chevron" className="h-18 w-18 flex-none text-ink-3" />}
    </button>
  );
}

export function TodayScreen({
  onPick,
  completedExerciseIds = [],
  prescriptions
}: {
  onPick: (exerciseId: string) => void;
  /** Exercises already finished in this sitting — drives the done/next split. */
  completedExerciseIds?: readonly string[];
  /** exerciseId -> "3 × 10", from the assigned program when there is one. */
  prescriptions?: Record<string, string>;
}) {
  const done = new Set(completedExerciseIds);
  const next = EXERCISES.find((e) => !done.has(e.id));
  const remaining = EXERCISES.length - done.size;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="flex items-start px-20 pb-14 pt-8">
        <div className="flex flex-1 flex-col gap-4">
          <span className="ds-label">Today</span>
          <h1 className="text-d1 text-ink">
            {next ? "Ready when you are." : "That's everything for today."}
          </h1>
        </div>
      </header>

      <div className="flex flex-col gap-14 px-20">
        <div className="flex items-center">
          <span className="ds-label flex-1">Today's program</span>
          <span className="font-mono text-[11.5px] uppercase text-ink-3">
            {done.size}/{EXERCISES.length} · {remaining} left
          </span>
        </div>

        <div className="flex flex-col gap-8">
          {EXERCISES.map((spec) => (
            <ExerciseRow
              key={spec.id}
              spec={spec}
              state={done.has(spec.id) ? "done" : spec.id === next?.id ? "next" : "upcoming"}
              prescription={prescriptions?.[spec.id]}
              onPick={onPick}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-12 pt-20">
        {next && (
          <Button onClick={() => onPick(next.id)}>
            <Icon name="cam" className="h-18 w-18" />
            Start {next.displayName.toLowerCase()}
          </Button>
        )}
        <Disclaimer>Coaching aid — not a medical device.</Disclaimer>
      </div>
    </div>
  );
}
