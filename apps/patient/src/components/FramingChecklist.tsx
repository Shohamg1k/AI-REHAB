import {
  describeLandmarks,
  type CaptureQuality,
  type LandmarkCheck,
  type LandmarkStatus
} from "@ai-rehab/contracts";

/**
 * Live, per-requirement framing feedback (A7).
 *
 * Groups the exercise's required landmarks into readable rows ("both
 * shoulders") rather than listing 6 enum names, so the patient sees exactly
 * what this exercise needs and what is currently missing — and, just as
 * importantly, sees that nothing else is being asked of them.
 */

const STATUS_ORDER: Record<LandmarkStatus, number> = {
  not_detected: 0,
  out_of_frame: 1,
  low_confidence: 2,
  ok: 3
};

const STATUS_PRESENTATION: Record<
  LandmarkStatus,
  { icon: string; className: string; note: string }
> = {
  ok: { icon: "✓", className: "text-emerald-600", note: "visible" },
  low_confidence: { icon: "!", className: "text-amber-600", note: "hard to see" },
  out_of_frame: { icon: "✕", className: "text-amber-600", note: "outside the frame" },
  not_detected: { icon: "✕", className: "text-slate-400", note: "not visible" }
};

/** One row per phrase-group, taking the worst status within the group. */
function groupRows(checks: readonly LandmarkCheck[]) {
  const byStatus = new Map<string, LandmarkStatus>();

  for (const check of checks) {
    const [phrase] = describeLandmarks([check.landmark]);
    if (!phrase) continue;
    const existing = byStatus.get(phrase);
    if (existing === undefined || STATUS_ORDER[check.status] < STATUS_ORDER[existing]) {
      byStatus.set(phrase, check.status);
    }
  }

  // Collapse left/right pairs that share a status into "both x".
  const rows: Array<{ label: string; status: LandmarkStatus }> = [];
  const consumed = new Set<string>();
  for (const [phrase, status] of byStatus) {
    if (consumed.has(phrase)) continue;
    const match = phrase.match(/^your (left|right) (.+)$/);
    if (match) {
      const other = `your ${match[1] === "left" ? "right" : "left"} ${match[2]}`;
      if (byStatus.get(other) === status) {
        rows.push({ label: `Both ${match[2]}s`, status });
        consumed.add(phrase);
        consumed.add(other);
        continue;
      }
    }
    rows.push({ label: phrase.charAt(0).toUpperCase() + phrase.slice(1), status });
    consumed.add(phrase);
  }

  return rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

export function FramingChecklist({ captureQuality }: { captureQuality: CaptureQuality }) {
  const rows = groupRows(captureQuality.landmarkChecks);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      <span className="text-label uppercase tracking-wide text-text-secondary">
        This exercise needs
      </span>
      <ul className="flex flex-col gap-4">
        {rows.map((row) => {
          const p = STATUS_PRESENTATION[row.status];
          return (
            <li key={row.label} className="flex items-center gap-8 text-body-sm">
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption font-bold ${
                  row.status === "ok" ? "bg-emerald-50" : "bg-amber-50"
                } ${p.className}`}
              >
                {p.icon}
              </span>
              <span className="text-text-primary">{row.label}</span>
              <span className="ml-auto text-caption text-text-muted">{p.note}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-caption text-text-muted">
        Anything not listed here can stay out of frame.
      </p>
    </div>
  );
}
