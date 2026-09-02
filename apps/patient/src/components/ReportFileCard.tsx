import type { ProgressReport } from "@ai-rehab/contracts";
import { Icon } from "./Icon.js";
import { reportFileName } from "../lib/reportFile.js";

/**
 * F1 — a day's report as a file card, in the shape people already know from
 * Drive and Gmail: a name row with a menu, and a preview of the contents.
 *
 * The preview is a real miniature of the report rather than a generic icon.
 * A wall of identical document tiles tells a clinician nothing; the numbers
 * that distinguish one day from another belong on the face of the card, so a
 * week can be scanned without opening anything.
 */
export function ReportFileCard({
  report,
  onOpen,
  onDownload
}: {
  report: ProgressReport;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const date = report.periodDate ?? report.periodStart.slice(0, 10);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  });

  return (
    <div className="group flex flex-col overflow-hidden rounded-md bg-surf shadow-hair">
      <div className="flex items-center gap-8 border-b border-line bg-sunk/60 px-11 py-9">
        <span className="flex h-22 w-22 flex-none items-center justify-center rounded-xs bg-teal text-white">
          <Icon name="chart" size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-b2 font-medium text-ink" title={reportFileName(report, "html")}>
          {day}
        </span>
        {/*
          The overflow menu is a single action rather than a menu: download is
          the only thing you can do to a derived report. A "⋮" that opens a
          menu of one is worse than the action itself.
        */}
        <button
          type="button"
          onClick={onDownload}
          aria-label={`Download ${reportFileName(report, "html")}`}
          className="flex h-24 w-24 flex-none items-center justify-center rounded-xs text-ink-3 hover:bg-line/60 hover:text-ink"
        >
          <Icon name="download" size={15} />
        </button>
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open report for ${day}`}
        className="flex aspect-[4/3] w-full flex-col justify-between p-14 text-left"
      >
        <div className="flex items-baseline justify-between gap-8">
          <span className="font-mono text-[26px] font-semibold leading-none text-ink">
            {report.avgFormScore ?? "—"}
          </span>
          <span className="ds-label">form</span>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-lb uppercase text-ink-3">
            {report.sessionCount} session{report.sessionCount === 1 ? "" : "s"} · {report.totalReps}{" "}
            reps
          </span>
          {/* The strongest thing the day has to say, if it says anything. */}
          {report.observations[3] && (
            <span className="line-clamp-3 text-cap text-ink-2">{report.observations[3].text}</span>
          )}
        </div>
      </button>
    </div>
  );
}
