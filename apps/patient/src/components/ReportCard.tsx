import type { ProgressReport, ReportExerciseSummary } from "@ai-rehab/contracts";
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
  // `periodDate` is the report's own label for a single day. It cannot be
  // derived from `periodStart`, because east of UTC a local day begins on the
  // previous UTC date — slicing the instant would call 2 September the 1st.
  const asDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { timeZone: report.timeZone });
  const period = report.periodDate
    ? new Date(`${report.periodDate}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC" })
    : `${asDate(report.periodStart)} – ${asDate(report.periodEnd)}`;

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

          {/* How far to trust everything above. A score shown without saying
              how much of the movement was visible invites confidence the data
              does not support (G7). */}
          <p className="text-cap text-ink-3">
            {Math.round(report.dataQuality.scoredRatio * 100)}% of reps were tracked well enough to
            score
            {report.dataQuality.unscoredReps > 0
              ? ` · ${report.dataQuality.unscoredReps} could not be`
              : ""}
            {report.dataQuality.meanConfidence !== null
              ? ` · mean tracking confidence ${report.dataQuality.meanConfidence}`
              : ""}
          </p>

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

      {report.perExercise.length > 0 && (
        <div className="flex flex-col gap-11">
          <span className="ds-label">Exercise by exercise</span>
          {report.perExercise.map((exercise) => (
            <ExerciseBreakdown key={exercise.exerciseId} summary={exercise} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-10">
        <span className="ds-label">What we noticed</span>
        {report.observations.map((o) => (
          <div key={`${o.exerciseId ?? ""}${o.text}`} className="flex flex-col gap-2">
            <span className="text-b2 text-ink">
              {/* The exercise name is joined here rather than baked into the
                  server's text: apps/api cannot resolve a display name from an
                  id without depending on @ai-rehab/exercises. */}
              {o.exerciseId && (
                <span className="font-medium">
                  {getExerciseSpec(o.exerciseId)?.displayName ?? o.exerciseId}:{" "}
                </span>
              )}
              {o.text}
            </span>
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
                {p.exerciseId && (
                  <span className="text-ink-3">
                    {" · "}
                    {getExerciseSpec(p.exerciseId)?.displayName ?? p.exerciseId}
                    {p.repIndex !== null ? `, rep ${p.repIndex + 1}` : ""}
                  </span>
                )}
              </span>
              <Chip tone="pain">{p.severity} of 5</Chip>
            </div>
          ))}
          <p className="text-cap text-ink-3">
            These are the patient's own answers. Nothing here is inferred from movement.
          </p>
        </div>
      )}

      <Disclaimer>
        This describes what the camera could see over the period. It is not a clinical assessment.
      </Disclaimer>
    </div>
  );
}

/**
 * One exercise, in the detail a clinician can act on.
 *
 * The ordering is the argument: what was done, then what specifically went
 * wrong, then whether range is moving. "Average form 62" is a number; "knee
 * extension short of target on 14 of 18 reps, and peak angle up 9° over the
 * period" is something you can change a prescription over.
 *
 * Only criteria that actually missed are listed. A clinician scanning six
 * exercises should not have to read the ones that are fine.
 */
function ExerciseBreakdown({ summary }: { summary: ReportExerciseSummary }) {
  const name = getExerciseSpec(summary.exerciseId)?.displayName ?? summary.exerciseId;
  const missed = summary.criteria.filter((c) => c.failed > 0 || c.warned > 0);
  const romMoved = summary.romChange.filter((r) => Math.abs(r.changeDeg) >= 1);

  return (
    <div className="ds-card-hair flex flex-col gap-9 p-13">
      <div className="flex items-baseline justify-between gap-9">
        <span className="text-b1 font-medium text-ink">{name}</span>
        <span className="font-mono text-[15px] font-semibold text-ink">
          {summary.avgFormScore ?? "—"}
        </span>
      </div>

      <span className="font-mono text-lb uppercase text-ink-3">
        {summary.sessions} session{summary.sessions === 1 ? "" : "s"} · {summary.totalReps} reps ·{" "}
        {summary.scoredReps} scored
        {summary.completionRate !== null
          ? ` · ${Math.round(summary.completionRate * 100)}% of prescribed`
          : ""}
      </span>

      {missed.length > 0 && (
        <div className="flex flex-col gap-7">
          {missed.map((c) => (
            <div key={c.criterionId} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-9">
                <span className="text-b2 text-ink-2">{c.label}</span>
                <span className="font-mono text-[11.5px] text-ink-3">
                  {c.failed}/{c.reps} missed
                </span>
              </div>
              <span className="text-cap text-ink-3">
                averaged {c.avgValue} against a target of {c.target.min}–{c.target.max}
                {c.avgMissBy > 0 ? ` · off by ${c.avgMissBy} when it missed` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {summary.compensations.length > 0 && (
        <div className="flex flex-wrap gap-6">
          {summary.compensations.map((c) => (
            <Chip key={c.ruleId} tone="warn">
              {c.label} ×{c.occurrences}
            </Chip>
          ))}
        </div>
      )}

      {romMoved.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="ds-label">Range of motion</span>
          {romMoved.map((r) => (
            <span key={r.joint} className="text-cap text-ink-3">
              {r.joint.replace(/_/g, " ")}: {r.firstPeak}° → {r.lastPeak}°{" "}
              <span className={r.changeDeg > 0 ? "text-teal-deep" : "text-warn"}>
                ({r.changeDeg > 0 ? "+" : ""}
                {r.changeDeg}°)
              </span>{" "}
              across {r.sessions} sessions
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
