import { useEffect, useState } from "react";
import type { SessionSummary } from "@ai-rehab/contracts";
import { EXERCISES } from "@ai-rehab/exercises";
import { ApiError, createProgram, fetchPatientSessions } from "../lib/api.js";
import { Button } from "../components/Button.js";

type Selection = Record<string, { selected: boolean; sets: number; reps: number }>;

function initialSelection(): Selection {
  return Object.fromEntries(EXERCISES.map((e) => [e.id, { selected: false, sets: 3, reps: 10 }]));
}

/**
 * A clinician's view of one patient: their session history (each load
 * writes a G5/F5 audit entry the patient can see — see
 * `apps/api/src/routes/patients.ts`) and a form to assign a program. The
 * program-assignment call is the one that actually exercises E5 — a
 * blocked exercise surfaces here as a specific, named rejection, not a
 * generic failure.
 */
export function PatientDetailScreen({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPatientSessions(patientId)
      .then(setSessions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this patient's sessions."));
  }, [patientId]);

  async function handleAssign() {
    setError(null);
    setSaved(false);
    const chosen = EXERCISES.filter((e) => selection[e.id]?.selected);
    if (chosen.length === 0) {
      setError("Pick at least one exercise.");
      return;
    }

    setSaving(true);
    try {
      await createProgram({
        patientId,
        notes: notes || undefined,
        exercises: chosen.map((e) => ({
          exerciseId: e.id,
          targetRegions: e.targetRegions,
          intensity: e.intensity,
          sets: selection[e.id]!.sets,
          reps: selection[e.id]!.reps
        }))
      });
      setSaved(true);
    } catch (err) {
      // A 422 from E5's contraindication check names the specific exercise
      // and reason (see apps/api/src/routes/programs.ts) — surfaced as-is
      // rather than a generic "failed to save."
      setError(err instanceof ApiError ? err.message : "Couldn't assign this program.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-16">
      <button type="button" onClick={onBack} className="text-b2 text-teal underline w-fit">
        ← Back to roster
      </button>

      <div>
        <h1 className="text-h1 text-ink">Session history</h1>
        {error && <p className="text-b2 text-dang mt-4">{error}</p>}
        {sessions === null && !error && <p className="text-b2 text-ink-2 mt-4">Loading…</p>}
        {sessions && sessions.length === 0 && (
          <p className="text-b2 text-ink-2 mt-4">No sessions synced yet.</p>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="mt-8 flex flex-col gap-8">
            {sessions.map((s) => (
              <li key={s.sessionId} className="rounded-lg border border-line bg-surf p-12">
                <div className="flex items-center justify-between text-b2">
                  <span>{s.wallClock ? new Date(s.wallClock).toLocaleDateString() : "Unknown date"}</span>
                  <span className="text-ink-3">{s.exerciseIds.join(", ") || "—"}</span>
                </div>
                <div className="text-cap text-ink-3">
                  {s.repCount} rep{s.repCount === 1 ? "" : "s"}
                  {s.avgFormScore !== null ? ` · avg ${s.avgFormScore}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surf p-16">
        <h2 className="text-h2 text-ink">Assign a program</h2>
        <div className="mt-12 flex flex-col gap-12">
          {EXERCISES.map((exercise) => {
            const row = selection[exercise.id]!;
            return (
              <div key={exercise.id} className="flex items-center gap-12">
                <label className="flex flex-1 items-center gap-12">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) =>
                      setSelection((s) => ({ ...s, [exercise.id]: { ...row, selected: e.target.checked } }))
                    }
                    className="h-20 w-20"
                  />
                  <span className="text-b2 text-ink">{exercise.displayName}</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={row.sets}
                  onChange={(e) => setSelection((s) => ({ ...s, [exercise.id]: { ...row, sets: Number(e.target.value) } }))}
                  className="w-16 min-h-touch rounded-md border border-line px-8 text-center"
                  aria-label={`Sets for ${exercise.displayName}`}
                />
                <span className="text-cap text-ink-3">×</span>
                <input
                  type="number"
                  min={1}
                  value={row.reps}
                  onChange={(e) => setSelection((s) => ({ ...s, [exercise.id]: { ...row, reps: Number(e.target.value) } }))}
                  className="w-16 min-h-touch rounded-md border border-line px-8 text-center"
                  aria-label={`Reps for ${exercise.displayName}`}
                />
              </div>
            );
          })}

          <label className="flex flex-col gap-4">
            <span className="text-b2 font-medium text-ink-2">Notes (optional)</span>
            <input
              className="min-h-touch rounded-md border border-line px-16"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {saved && <p className="text-b2 text-ok">Program assigned.</p>}

          <Button onClick={handleAssign} disabled={saving}>
            Assign program
          </Button>
        </div>
      </div>
    </div>
  );
}
