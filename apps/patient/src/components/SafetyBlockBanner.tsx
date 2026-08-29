import type { SafetyVerdict } from "@ai-rehab/contracts";
import { Button } from "./Button.js";

/**
 * `Banner/Safety Block` (E1 + E3) — docs/UX-SPEC.md §3: "states the reason
 * and the escalation path; never 'push through'." The safety banner is the
 * only component allowed in the primary-action slot when it's showing
 * (§1) — nothing below it offers "continue anyway" (CLAUDE.md invariant 3:
 * nothing may soften a block/escalate verdict).
 */
export function SafetyBlockBanner({
  verdict,
  onEndExercise
}: {
  verdict: SafetyVerdict;
  onEndExercise: () => void;
}) {
  if (verdict.verdict !== "block" && verdict.verdict !== "escalate") return null;

  const isEscalate = verdict.verdict === "escalate";

  return (
    <div className="bg-danger-soft border-2 border-danger rounded-lg p-20 flex flex-col gap-12" role="alert">
      <div className="flex items-center gap-8">
        <span aria-hidden className="text-heading-24">
          ⚠️
        </span>
        <span className="text-title text-danger">
          {isEscalate ? "Stop and check in with your clinician" : "Let's pause this exercise"}
        </span>
      </div>

      <p className="text-body text-text-primary">Reason: {verdict.reason}</p>

      {verdict.threshold && (
        <p className="text-caption text-text-muted">
          {verdict.threshold.name}: observed {verdict.threshold.observed.toFixed(1)}, limit{" "}
          {verdict.threshold.limit.toFixed(1)}
        </p>
      )}

      <div className="flex flex-col gap-8">
        <Button variant="danger" onClick={onEndExercise}>
          End this exercise
        </Button>
        <p className="text-caption text-text-muted">
          {isEscalate
            ? "If this is a medical emergency, contact emergency services. Otherwise, message your clinician before your next session."
            : "You can try a different exercise, or come back to this one later."}
        </p>
      </div>
    </div>
  );
}
