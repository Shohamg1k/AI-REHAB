import type { CaptureQuality } from "@ai-rehab/contracts";
import { Pill } from "./Pill.js";

/**
 * `Badge/Capture Quality` (A7 + G7) — docs/UX-SPEC.md §3: "persistent for
 * the whole session; degrades good -> fair -> low-confidence." Every score
 * downstream inherits this, so it always states *what to fix*, never just a
 * bare score (CLAUDE.md invariant 4).
 */
export function CaptureQualityBadge({ quality }: { quality: CaptureQuality }) {
  const tier = quality.score >= 0.8 ? "good" : quality.score >= 0.5 ? "fair" : "low";
  const tone = tier === "good" ? "success" : tier === "fair" ? "warning" : "danger";
  const label = tier === "good" ? "Good view" : tier === "fair" ? "Fair view" : "Low confidence";

  const issues: string[] = [];
  if (quality.framing !== "ok") issues.push(quality.framing.replace(/_/g, " "));
  if (quality.lighting !== "ok") issues.push(quality.lighting.replace(/_/g, " "));
  if (quality.missingJoints.length > 0) {
    issues.push(`can't see ${quality.missingJoints.map((j) => j.replace(/_/g, " ")).join(", ")}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Pill tone={tone}>{label}</Pill>
      {issues.length > 0 && <span className="text-caption text-text-muted">{issues.join(" · ")}</span>}
    </div>
  );
}
