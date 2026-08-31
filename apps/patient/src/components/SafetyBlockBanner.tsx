import type { SafetyVerdict } from "@ai-rehab/contracts";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

/**
 * M6 — `Banner/Safety Block` (E1 + E3), as the design's bottom sheet.
 *
 * docs/UX-SPEC.md §3: "states the reason and the escalation path; never
 * 'push through'." This is the only component allowed in the primary-action
 * slot while it is showing (§1), and — CLAUDE.md invariant 3 — **nothing
 * here may offer a way to continue the set**. Every action is stop, switch,
 * or end. That is the whole point of the component: a veto that the UI
 * cannot quietly soften.
 *
 * The design attributes the cap to a named clinician ("the 90° cap Ruth
 * set"). It is stated here without attribution, because the thresholds come
 * from the exercise spec and no clinician has reviewed them yet — see
 * docs/STATUS.md on provisional specs.
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
    <div
      role="alert"
      className="-mx-12 -mb-12 flex flex-col gap-14 rounded-t-xl bg-surf p-20"
    >
      <div className="flex items-start gap-11">
        <span className="flex h-34 w-34 flex-none items-center justify-center rounded bg-dang-wash text-dang">
          <Icon name="shield" className="h-19 w-19" />
        </span>
        <div className="flex flex-col gap-3">
          <h2 className="text-h1 text-dang">
            {isEscalate ? "Stop and check in with your clinician" : "We stopped the set"}
          </h2>
          <p className="text-b2 text-ink-2">{verdict.reason}</p>
          {verdict.threshold && (
            <p className="text-b2 text-ink-2">
              {verdict.threshold.name} reached{" "}
              <span className="font-mono font-semibold text-ink">
                {verdict.threshold.observed.toFixed(0)}
              </span>{" "}
              against a cap of{" "}
              <span className="font-mono font-semibold text-ink">
                {verdict.threshold.limit.toFixed(0)}
              </span>
              .
            </p>
          )}
        </div>
      </div>

      <div className="ds-sunk flex flex-col gap-7">
        <span className="ds-label">If it hurts</span>
        <p className="text-b2 text-ink-2">
          Stop and contact your clinician. If the pain is severe or you cannot bear weight, call your
          local emergency number. We will not ask you to carry on.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <span className="ds-label">Written to your log</span>
        {/* A log entry, not a restatement — the reason is already above, and
            repeating it here just made the sheet say the same thing twice. */}
        <p className="font-mono text-[11.5px] leading-[1.6] uppercase text-ink-2">
          {isEscalate ? "Escalated" : "Blocked"}
          {verdict.threshold
            ? ` · ${verdict.threshold.name} ${verdict.threshold.observed.toFixed(0)} > cap ${verdict.threshold.limit.toFixed(0)}`
            : ""}
          <br />
          Reason attached · visible to your clinician
        </p>
      </div>

      <div className="flex flex-col gap-9">
        <Button variant="danger" onClick={onEndExercise}>
          End this exercise
        </Button>
        <p className="text-cap text-ink-3">
          {isEscalate
            ? "If this is a medical emergency, contact emergency services. Otherwise, message your clinician before your next session."
            : "You can try a different exercise, or come back to this one later."}
        </p>
      </div>
    </div>
  );
}
