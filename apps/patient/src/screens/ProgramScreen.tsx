import { useEffect, useState } from "react";
import type { Program } from "@ai-rehab/contracts";
import { getExerciseSpec } from "@ai-rehab/exercises";
import { ApiError, fetchMyProgram, isApiConfigured } from "../lib/api.js";
import { isSignedIn } from "../lib/authStore.js";
import { Chip } from "../components/Chip.js";
import { Button } from "../components/Button.js";
import { ExercisePicker } from "../components/ExercisePicker.js";
import { loadRoutine, pushRoutine, routineExercises, saveRoutine } from "../lib/routine.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { Icon } from "../components/Icon.js";
import { VoiceSettingsCard } from "../components/VoiceSettingsCard.js";

/**
 * The prescribed plan, as distinct from Today.
 *
 * Today answers "what am I doing next, and why". Program answers "what has
 * my clinician actually asked of me, and at what dose" — the standing
 * prescription rather than the current step through it. They were the same
 * list, which made one of the two tabs pointless.
 *
 * With no clinician the honest answer is that there is no prescription: what
 * is shown is the exercise library, labelled as such, not a plan pretending
 * to be one.
 */
export function ProgramScreen({
  onPick,
  onRoutineChanged
}: {
  onPick: (exerciseId: string) => void;
  /** So Today reflects an edit immediately, rather than on the next reload. */
  onRoutineChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(
    () => loadRoutine() ?? routineExercises(null).map((e) => e.id)
  );
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiConfigured() || !isSignedIn()) {
      setLoading(false);
      return;
    }
    fetchMyProgram()
      .then(setProgram)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't load your program.")
      )
      .finally(() => setLoading(false));
  }, []);

  const prescribed = program?.exercises ?? [];

  return (
    <div className="ds-shell gap-14 px-20 pb-10 pt-8">
      <div className="flex flex-col gap-4">
        <span className="ds-label">Program</span>
        <h1 className="text-d1 text-ink">
          {prescribed.length > 0 ? "Prescribed for you" : "No prescription yet"}
        </h1>
      </div>

      {error && <p className="text-b2 text-dang">{error}</p>}
      {loading && <p className="text-b2 text-ink-2">Loading…</p>}

      {!loading && prescribed.length > 0 && (
        <>
          {program?.notes && (
            <div className="flex flex-col gap-6 rounded-md bg-teal-wash p-14">
              <span className="ds-label text-teal-deep">A note from your clinician</span>
              <p className="text-b2 text-teal-deep">{program.notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-8">
            {prescribed
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => {
                const spec = getExerciseSpec(item.exerciseId);
                return (
                  <button
                    key={item.exerciseId}
                    type="button"
                    onClick={() => onPick(item.exerciseId)}
                    className="flex w-full items-center gap-11 rounded-md bg-surf p-14 text-left shadow-hair"
                  >
                    <span className="flex flex-1 flex-col">
                      <span className="text-b1 font-medium text-ink">
                        {spec?.displayName ?? item.exerciseId}
                      </span>
                      <span className="font-mono text-[11.5px] uppercase text-ink-3">
                        {item.sets} sets × {item.reps} · {item.intensity} intensity
                      </span>
                    </span>
                    <Icon name="chevron" size={18} className="text-ink-3" />
                  </button>
                );
              })}
          </div>
        </>
      )}

      {!loading && prescribed.length === 0 && !editing && (
        <>
          <p className="text-b2 text-ink-2">
            No clinician has assigned you a program, so this is the routine you chose. The sets and
            reps are up to you.
          </p>

          <div className="flex flex-col gap-8">
            {routineExercises(loadRoutine()).map((spec) => (
              <button
                key={spec.id}
                type="button"
                onClick={() => onPick(spec.id)}
                className="flex w-full items-center gap-11 rounded-md bg-surf p-14 text-left shadow-hair"
              >
                <span className="flex flex-1 flex-col gap-4">
                  <span className="text-b1 font-medium text-ink">{spec.displayName}</span>
                  <span className="flex flex-wrap gap-6">
                    <Chip tone="teal">{spec.targetRegions.join(" · ").toUpperCase()}</Chip>
                    <Chip tone="mute">{spec.movementType.toUpperCase()}</Chip>
                  </span>
                </span>
                <Icon name="chevron" size={18} className="text-ink-3" />
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              setDraft(loadRoutine() ?? routineExercises(null).map((e) => e.id));
              setEditing(true);
            }}
          >
            <Icon name="list" size={17} />
            Edit my routine
          </Button>
        </>
      )}

      {!loading && prescribed.length > 0 && !editing && (
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(loadRoutine() ?? routineExercises(null).map((e) => e.id));
            setEditing(true);
          }}
        >
          <Icon name="list" size={17} />
          Choose extra exercises
        </Button>
      )}

      {editing && (
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <span className="ds-label">Your routine</span>
            <p className="text-b2 text-ink-2">
              {prescribed.length > 0
                ? "Your clinician's program is what Today follows — this list does not change it. Anything you pick here is extra, for when you have finished what was prescribed."
                : "Pick what you want in your routine. You can change it whenever you like."}
            </p>
          </div>

          <ExercisePicker
            selected={draft}
            onToggle={(id) =>
              setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
          />

          <div className="flex flex-col gap-9">
            <Button
              disabled={draft.length === 0}
              onClick={() => {
                saveRoutine(draft);
                pushRoutine(draft);
                onRoutineChanged();
                setEditing(false);
              }}
            >
              {draft.length === 0
                ? "Pick at least one"
                : `Save ${draft.length} exercise${draft.length === 1 ? "" : "s"}`}
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-6 text-center text-[14.5px] font-medium text-ink-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <VoiceSettingsCard />

      <div className="flex-1" />

      <Disclaimer>
        {prescribed.length > 0
          ? "Coaching aid — not a medical device."
          : "Reference ranges for these exercises are provisional and have not been reviewed by a physiotherapist."}
      </Disclaimer>
    </div>
  );
}
