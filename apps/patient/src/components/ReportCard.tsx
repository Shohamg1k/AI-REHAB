import type { ProgressReport } from "@ai-rehab/contracts";
import { getExerciseSpec } from "@ai-rehab/exercises";
import { Chip } from "./Chip.js";
import { Disclaimer } from "./Disclaimer.js";

/**
 * F1 — the report, rendered identically for whoever is reading it.
 *
 * One component for both sides on purpose. G5 already lets a patient see
 * *who* opened their data; this lets them see *what was said*. If the
 * clinician's view diverged from the patient's, the patient could no longer
 * check what was written about them — which is exactly the asymmetry the
 * audit log exists to prevent.
 *
 * Every observation shows its `basis` (invariant 4), so nothing reads as an
 * unsourced judgement, and the framing stays non-diagnostic (CLAUDE.md §6).
 */
export function ReportCard({ report }: { report: ProgressReport }) {
  const period = `${new Date(report.periodStart).toLocaleDateString()} – ${new Date(
    report.periodEnd
  ).toLocaleDateString()}`;

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-4">
        <span className="ds-label">{period}</span>
        <h2 className="text-h1 text-ink">
          {report.sessionCount === 0
            ? "Nothing recorded this week"
            : `${report.sessionCount} session${report.sessionCount === 1 ? "" : "s"}`}
        </h2>
      </div>

      {report.sessionCount > 0 && (
        <div className="flex flex-col gap-10">
          <div className="flex items-stretch gap-10">
            <div className="ds-card-hair flex flex-1 flex-col gap-2 p-13">
              <span className="ds-label">Active days</span>
              <span className="font-mono text-[25px] font-semibold tracking-[-.02em] text-ink">
                {report.activeDays}
              </span>
            </div>
            <div className="ds-card-hair flex flex-1 flex-col gap-2 p-13">
              <span className="ds-label">Reps</span>
              <span className="font-mono text-[25px] font-semibold tracking-[-.02em] text-ink">
                {report.totalReps}
              </span>
              <span className="font-mono text-lb uppercase text-ink-3">
                {report.scoredReps} scored
              </span>
            </div>
            <div className="ds-card-hair flex flex-1 flex-col gap-2 p-13">
              <span className="ds-label">Form</span>
              <span className="font-mono text-[25px] font-semibold tracking-[-.02em] text-ink">
                {report.avgFormScore ?? "—"}
              </span>
            </div>
          </div>

          {report.exercisesPerformed.length > 0 && (
            <div className="flex flex-wrap gap-6">
              {report.exercisesPerformed.map((id) => (
                <Chip key={id} tone="mute">
                  {getExerciseSpec(id)?.displayName ?? id}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-10">
        <span className="ds-label">What we noticed</span>
        {report.observations.map((o) => (
          <div key={o.text} className="flex flex-col gap-2">
            <span className="text-b2 text-ink">{o.text}</span>
            {/* The basis, not decoration: it is what stops a number reading
                as a judgement the system formed on its own. */}
            <span className="text-cap text-ink-3">{o.basis}</span>
          </div>
        ))}
      </div>

      {report.pain.length > 0 && (
        <div className="ds-card-hair flex flex-col gap-8">
          <span className="ds-label">Pain reported</span>
          {report.pain.map((p, i) => (
            <div key={`${p.at}-${i}`} className="flex items-baseline gap-11">
              <span className="flex-1 text-b2 text-ink-2">
                {p.region ? p.region.replace(/_/g, " ") : "Unspecified"}
              </span>
              <Chip tone="pain">{p.severity} of 5</Chip>
            </div>
          ))}
          <p className="text-cap text-ink-3">
            These are the patient's own answers. Nothing here is inferred from movement.
          </p>
        </div>
      )}

      {report.safetyEvents.length > 0 && (
        <div className="flex flex-col gap-8 rounded-md bg-dang-wash p-14">
          <span className="ds-label text-dang">Sets stopped by the safety gate</span>
          {report.safetyEvents.map((e, i) => (
            <p key={`${e.at}-${i}`} className="text-b2 text-dang">
              {e.reason}
            </p>
          ))}
        </div>
      )}

      <Disclaimer>
        This describes what the camera could see over the period. It is not a clinical assessment.
      </Disclaimer>
    </div>
  );
}
