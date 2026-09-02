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
  const done = state === "done";
  const next = state === "next";

  /*
   * A square tile rather than a full-width row. The list is short and highly
   * visual — six movements, picked by recognition — and rows made a 1920px
   * window into one long thin column.
   *
   * The "why this one" rationale (C6) does not fit in a square and is not
   * dropped: it moves below the grid for the exercise that is up next, which
   * is the only one it was ever about.
   */
  return (
    <button
      type="button"
      onClick={() => onPick(spec.id)}
      aria-current={next ? "step" : undefined}
      className={`flex aspect-square w-full flex-col justify-between rounded-md p-14 text-left ${
        next ? "bg-surf shadow-lift" : "bg-surf shadow-hair"
      } ${done ? "opacity-[.72]" : ""}`}
    >
      <span
        className={`flex h-40 w-40 flex-none items-center justify-center rounded ${
          done ? "bg-ok-wash text-ok" : next ? "bg-teal-wash text-teal" : "bg-sunk text-ink-2"
        }`}
      >
        <Icon name={done ? "check" : "chart"} size={21} />
      </span>

      <span className="flex flex-col gap-2">
        <span
          className={`text-b1 leading-[1.25] text-ink ${next ? "font-semibold" : "font-medium"}`}
        >
          {spec.displayName}
        </span>
        <span
          className={`font-mono text-lb uppercase ${
            done ? "text-ok" : next ? "text-teal" : "text-ink-3"
          }`}
        >
          {done ? "done" : next ? `${meta} · up next` : meta}
        </span>
      </span>
    </button>
  );
}

export function TodayScreen({
  exercises,
  onPick,
  completedExerciseIds = [],
  prescriptions
}: {
  /**
   * What to show today: the clinician's prescription when there is one,
   * otherwise the routine the patient chose. Passed in rather than read from
   * the catalogue here, so this screen has no opinion about which of those
   * two it is looking at.
   */
  exercises: readonly ExerciseSpec[];
  onPick: (exerciseId: string) => void;
  /** Exercises already finished in this sitting — drives the done/next split. */
  completedExerciseIds?: readonly string[];
  /** exerciseId -> "3 × 10", from the assigned program when there is one. */
  prescriptions?: Record<string, string>;
}) {
  const done = new Set(completedExerciseIds);
  const next = exercises.find((e) => !done.has(e.id));
  const remaining = exercises.length - done.size;

  return (
    <div className="ds-shell">
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
            {done.size}/{exercises.length} · {remaining} left
          </span>
        </div>

        <div className="grid grid-cols-2 gap-11 md:grid-cols-3 xl:grid-cols-4">
          {exercises.map((spec) => (
            <ExerciseRow
              key={spec.id}
              spec={spec}
              state={done.has(spec.id) ? "done" : spec.id === next?.id ? "next" : "upcoming"}
              prescription={prescriptions?.[spec.id]}
              onPick={onPick}
            />
          ))}
        </div>

        {/* C6, kept: the rationale for whichever exercise is up next. */}
        {next && (
          <div className="ds-card-hair flex flex-col gap-4">
            <span className="ds-label">Why {next.displayName.toLowerCase()}</span>
            <span className="text-b2 text-ink-2">{next.rationale}</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-9 px-20 pb-12 pt-20">
        {next && (
          <Button onClick={() => onPick(next.id)}>
            <Icon name="cam" size={18} />
            Start {next.displayName.toLowerCase()}
          </Button>
        )}
        <Disclaimer>Coaching aid — not a medical device.</Disclaimer>
      </div>
    </div>
  );
}
