import { useEffect, useState } from "react";
import type { Program } from "@ai-rehab/contracts";
import { EXERCISES, getExerciseSpec } from "@ai-rehab/exercises";
import { ApiError, fetchMyProgram, isApiConfigured } from "../lib/api.js";
import { isSignedIn } from "../lib/authStore.js";
import { Chip } from "../components/Chip.js";
import { Disclaimer } from "../components/Disclaimer.js";
import { Icon } from "../components/Icon.js";

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
export function ProgramScreen({ onPick }: { onPick: (exerciseId: string) => void }) {
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
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-14 px-20 pb-10 pt-8">
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

      {!loading && prescribed.length === 0 && (
        <>
          <p className="text-b2 text-ink-2">
            No clinician has assigned you a program. These are the exercises this app can currently
            coach — you can try any of them, but the sets and reps are up to you.
          </p>

          <div className="flex flex-col gap-8">
            {EXERCISES.map((spec) => (
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
        </>
      )}

      <div className="flex-1" />

      <Disclaimer>
        {prescribed.length > 0
          ? "Coaching aid — not a medical device."
          : "Reference ranges for these exercises are provisional and have not been reviewed by a physiotherapist."}
      </Disclaimer>
    </div>
  );
}
