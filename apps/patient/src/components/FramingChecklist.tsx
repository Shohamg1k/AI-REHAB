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

/**
 * Two palettes rather than one: on the setup screen this list sits over the
 * camera on a near-black background, where the page's ink colours are
 * unreadable. The status *words* are identical in both — only the colour
 * that carries them changes.
 */
const STATUS_PRESENTATION: Record<
  LandmarkStatus,
  { icon: string; light: string; dark: string; note: string }
> = {
  ok: { icon: "✓", light: "text-ok", dark: "text-[#4ED6A8]", note: "Good" },
  low_confidence: { icon: "!", light: "text-warn", dark: "text-[#F0B44C]", note: "Hard to see" },
  out_of_frame: { icon: "✕", light: "text-warn", dark: "text-[#F0B44C]", note: "Out of frame" },
  not_detected: { icon: "✕", light: "text-ink-3", dark: "text-white/45", note: "Not visible" }
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

export function FramingChecklist({
  captureQuality,
  dark = false
}: {
  captureQuality: CaptureQuality;
  /** Over the camera viewport, where the page palette is unreadable. */
  dark?: boolean;
}) {
  const rows = groupRows(captureQuality.landmarkChecks);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-8">
      <span className={dark ? "ds-label text-white/55" : "ds-label"}>This exercise needs</span>
      <ul className="flex flex-col gap-10">
        {rows.map((row) => {
          const p = STATUS_PRESENTATION[row.status];
          const tone = dark ? p.dark : p.light;
          return (
            <li key={row.label} className="flex items-center gap-10">
              <span className={`w-17 shrink-0 text-center text-b2 font-semibold ${tone}`}>
                {p.icon}
              </span>
              <span className={`flex-1 text-[14px] ${dark ? "text-white" : "text-ink"}`}>
                {row.label}
              </span>
              <span className={`font-mono text-[11px] uppercase ${tone}`}>{p.note}</span>
            </li>
          );
        })}
      </ul>
      <p className={`text-cap ${dark ? "text-white/45" : "text-ink-3"}`}>
        Anything not listed here can stay out of frame.
      </p>
    </div>
  );
}
