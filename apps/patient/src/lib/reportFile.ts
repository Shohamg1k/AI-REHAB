import type { ProgressReport } from "@ai-rehab/contracts";
import { getExerciseSpec } from "@ai-rehab/exercises";

/**
 * F1 — turning a report into a file a patient or clinician can keep.
 *
 * **Why self-contained HTML and not a PDF library.** A PDF would mean a new
 * dependency and a licence review (docs/UPSTREAM.md) for something the browser
 * already does well: the viewer's Print button hands this document to the
 * browser's own "Save as PDF", which produces a better PDF than a JS library
 * would and costs nothing. The downloaded `.html` opens anywhere, is a tenth
 * the size, and — unlike a screenshot of the app — is real text a clinician can
 * search and copy from.
 *
 * The document is deliberately not a copy of the app's UI. A clinical record
 * should read as a document, not as a screenshot of a phone screen.
 */

/** `Asha Narang` + `2026-09-02` -> `asha-narang_2026-09-02`. */
export function reportFileName(report: ProgressReport, extension: string): string {
  const name =
    report.patientDisplayName
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "patient";
  // The report's own day for a daily report; the period start otherwise.
  const date = report.periodDate ?? report.periodStart.slice(0, 10);
  return `${name}_${date}.${extension}`;
}

/**
 * Escape before interpolation, every time.
 *
 * A display name is user-supplied and ends up in a file that gets opened in a
 * browser — the one place a stored script would actually run. There is no
 * framework escaping here to fall back on, so it is done explicitly.
 */
function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const exerciseName = (id: string) => getExerciseSpec(id)?.displayName ?? id;

const dayLabel = (report: ProgressReport): string => {
  const date = report.periodDate ?? report.periodStart.slice(0, 10);
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
};

export function reportTitle(report: ProgressReport): string {
  return `${report.patientDisplayName} — ${dayLabel(report)}`;
}

/** A standalone document. No external stylesheet, no script, no network. */
export function reportToHtml(report: ProgressReport): string {
  const rows = (label: string, value: string) =>
    `<div class="stat"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;

  const exercises = report.perExercise
    .map((exercise) => {
      const criteria = exercise.criteria
        .filter((c) => c.failed > 0 || c.warned > 0)
        .map(
          (c) => `<li><b>${esc(c.label)}</b> — missed on ${c.failed} of ${c.reps} scored reps.
            <span class="muted">Averaged ${esc(c.avgValue)} against a target of ${esc(c.target.min)}–${esc(c.target.max)}${
              c.avgMissBy > 0 ? `; off by ${esc(c.avgMissBy)} when it missed` : ""
            }.</span></li>`
        )
        .join("");

      const compensations = exercise.compensations
        .map((c) => `<li>${esc(c.label)} — seen on ${c.occurrences} rep${c.occurrences === 1 ? "" : "s"}.</li>`)
        .join("");

      const rom = exercise.romChange
        .map(
          (r) =>
            `<li>Peak ${esc(r.joint.replace(/_/g, " "))}: ${esc(r.firstPeak)}° → ${esc(r.lastPeak)}° (${
              r.changeDeg > 0 ? "+" : ""
            }${esc(r.changeDeg)}°) across ${r.sessions} sessions.</li>`
        )
        .join("");

      return `<section class="ex">
        <h3>${esc(exerciseName(exercise.exerciseId))}<span class="score">${esc(exercise.avgFormScore ?? "—")}</span></h3>
        <p class="muted">${exercise.sessions} session${exercise.sessions === 1 ? "" : "s"} · ${exercise.totalReps} reps · ${exercise.scoredReps} scored${
          exercise.completionRate !== null
            ? ` · ${Math.round(exercise.completionRate * 100)}% of prescribed`
            : ""
        }</p>
        ${criteria ? `<ul>${criteria}</ul>` : ""}
        ${compensations ? `<h4>Compensation</h4><ul>${compensations}</ul>` : ""}
        ${rom ? `<h4>Range of motion</h4><ul>${rom}</ul>` : ""}
      </section>`;
    })
    .join("");

  const observations = report.observations
    .map(
      (o) => `<li>${o.exerciseId ? `<b>${esc(exerciseName(o.exerciseId))}:</b> ` : ""}${esc(o.text)}
        <span class="muted">${esc(o.basis)}</span></li>`
    )
    .join("");

  const pain = report.pain
    .map(
      (p) =>
        `<li>${esc(p.region ? p.region.replace(/_/g, " ") : "Unspecified")} — ${esc(p.severity)} of 5${
          p.exerciseId ? ` during ${esc(exerciseName(p.exerciseId))}` : ""
        }${p.repIndex !== null ? `, rep ${p.repIndex + 1}` : ""}.</li>`
    )
    .join("");

  const flags = report.safetyEvents.map((e) => `<li>${esc(e.reason)}</li>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(reportTitle(report))}</title>
<style>
  :root { color-scheme: light }
  body { margin:0; padding:40px 32px; background:#fff; color:#101617;
         font:16px/1.55 "IBM Plex Sans",system-ui,sans-serif; max-width:52rem; margin-inline:auto }
  h1 { font-size:26px; margin:0 0 4px; letter-spacing:-.02em }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:#7C8C8F;
       margin:32px 0 10px; font-family:"IBM Plex Mono",ui-monospace,monospace }
  h3 { font-size:18px; margin:0 0 2px; display:flex; justify-content:space-between; gap:16px }
  h4 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:#7C8C8F; margin:12px 0 4px }
  .sub { color:#47575A; margin:0 0 4px }
  .stats { display:flex; gap:12px; flex-wrap:wrap; margin:16px 0 0 }
  .stat { border:1px solid #D6DEDF; border-radius:8px; padding:10px 14px; min-width:110px }
  .stat .k { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#7C8C8F }
  .stat .v { display:block; font-size:24px; font-weight:600; font-family:"IBM Plex Mono",ui-monospace,monospace }
  .ex { border:1px solid #D6DEDF; border-radius:10px; padding:16px; margin:0 0 12px; break-inside:avoid }
  .score { font-family:"IBM Plex Mono",ui-monospace,monospace }
  ul { margin:6px 0; padding-left:20px }
  li { margin:0 0 8px }
  .muted { color:#7C8C8F; display:block; font-size:14px }
  footer { margin-top:36px; padding-top:14px; border-top:1px solid #D6DEDF; color:#7C8C8F; font-size:13px }
  @media print { body { padding:0 } .ex { border-color:#bbb } }
</style></head><body>
<h1>${esc(report.patientDisplayName)}</h1>
<p class="sub">${esc(dayLabel(report))}</p>
<p class="sub muted">Times and days in ${esc(report.timeZone)}.</p>

<div class="stats">
  ${rows("Sessions", String(report.sessionCount))}
  ${rows("Reps", String(report.totalReps))}
  ${rows("Scored", String(report.scoredReps))}
  ${rows("Form", String(report.avgFormScore ?? "—"))}
</div>
<p class="muted">${Math.round(report.dataQuality.scoredRatio * 100)}% of reps were tracked well enough to score${
    report.dataQuality.unscoredReps > 0 ? ` · ${report.dataQuality.unscoredReps} could not be` : ""
  }.</p>

${exercises ? `<h2>Exercise by exercise</h2>${exercises}` : ""}
${observations ? `<h2>What we noticed</h2><ul>${observations}</ul>` : ""}
${pain ? `<h2>Pain reported</h2><ul>${pain}</ul><p class="muted">The patient's own answers. Nothing here is inferred from movement.</p>` : ""}
${flags ? `<h2>Flagged for review</h2><ul>${flags}</ul><p class="muted">These did not interrupt the session. The thresholds behind them are provisional and have not been reviewed by a physiotherapist — worth a look, not a conclusion.</p>` : ""}

<footer>This describes what the camera could see over the period. It is a coaching and monitoring aid, not a medical device, and not a clinical assessment.</footer>
</body></html>`;
}

/** Save the report as a file named for the patient and the day. */
export function downloadReport(report: ProgressReport): void {
  const blob = new Blob([reportToHtml(report)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFileName(report, "html");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next tick rather than immediately: Safari has historically
  // cancelled the download if the object URL disappears in the same frame.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Hand the report to the browser's own print dialog, which is where "Save as
 * PDF" lives. The window's title becomes the suggested filename, so it matches
 * the download.
 */
export function printReport(report: ProgressReport): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(reportToHtml(report));
  doc.close();
  // The iframe's own title is what Chrome offers as the PDF filename.
  doc.title = reportFileName(report, "pdf").replace(/\.pdf$/, "");

  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (doc.readyState === "complete") run();
  else frame.onload = run;
}
