/**
 * `Bar/Disclaimer` (E4) — docs/UX-SPEC.md §3: "copy is snapshot-tested; do
 * not edit without review." Present on every patient screen (§1). This is
 * the load-bearing sentence for CLAUDE.md §6 — never present a form score
 * as a clinical assessment, never imply diagnosis.
 *
 * Snapshot-tested in DisclaimerBar.test.tsx — a change here should be a
 * deliberate, reviewed decision, not an incidental copy edit.
 */
export function DisclaimerBar() {
  return (
    <div className="bg-subtle border-b border-border px-16 py-8 text-caption text-text-secondary text-center">
      A coaching and monitoring aid, not a medical device. It does not diagnose or replace your
      clinician.
    </div>
  );
}
