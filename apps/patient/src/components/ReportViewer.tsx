import { useEffect, useRef } from "react";
import type { ProgressReport } from "@ai-rehab/contracts";
import { Icon } from "./Icon.js";
import { ReportCard } from "./ReportCard.js";
import { downloadReport, printReport, reportFileName, reportTitle } from "../lib/reportFile.js";

/**
 * F1 — the report preview, in the shape of a document viewer rather than
 * another app screen: dark surround, a toolbar naming the file, and the report
 * itself on a page.
 *
 * The same component serves the patient and the clinician, which is the same
 * rule the report itself follows — a report a patient cannot open is a report
 * that can be wrong about them without their knowing.
 */
export function ReportViewer({
  report,
  onClose
}: {
  report: ProgressReport;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Escape closes, and the page behind does not scroll while it is open —
    // both are what anyone who has used a document viewer expects.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={reportTitle(report)}
      className="fixed inset-0 z-50 flex flex-col bg-night/92 backdrop-blur-sm"
    >
      <div className="flex flex-none items-center gap-10 px-16 py-12">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-34 w-34 flex-none items-center justify-center rounded text-white/80 hover:bg-white/12 hover:text-white"
        >
          <Icon name="close" size={19} />
        </button>

        <span className="min-w-0 flex-1 truncate text-b2 font-medium text-white">
          {reportFileName(report, "html")}
        </span>

        <button
          type="button"
          onClick={() => printReport(report)}
          className="flex h-34 items-center gap-7 rounded px-11 text-b2 font-medium text-white/85 hover:bg-white/12 hover:text-white"
        >
          <Icon name="print" size={16} />
          <span className="hidden sm:inline">Print / PDF</span>
        </button>

        <button
          type="button"
          onClick={() => downloadReport(report)}
          className="flex h-34 items-center gap-7 rounded bg-white/14 px-11 text-b2 font-medium text-white hover:bg-white/22"
        >
          <Icon name="download" size={16} />
          <span className="hidden sm:inline">Download</span>
        </button>
      </div>

      {/*
        A page on a dark surround, scrolling independently — the report is
        long, and the toolbar should stay put while it is read.
      */}
      <div className="flex-1 overflow-y-auto px-12 pb-24">
        <div className="mx-auto w-full max-w-[46rem] rounded-md bg-page p-20 shadow-lift">
          <ReportCard report={report} />
        </div>
      </div>
    </div>
  );
}
