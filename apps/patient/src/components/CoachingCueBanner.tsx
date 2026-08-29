import type { CoachingCue } from "@ai-rehab/contracts";

/**
 * `Banner/Coaching Cue` (A3) — docs/UX-SPEC.md §3: "spoken text AND
 * caption; cooldown prevents nagging." Speech happens where this cue is
 * dispatched (see hooks/useLiveSession.ts, which calls lib/speech.ts); this
 * component is the always-present caption — CLAUDE.md §4: "spoken output is
 * never the only channel."
 */
export function CoachingCueBanner({ cue }: { cue: CoachingCue | null }) {
  if (!cue) return null;

  return (
    <div
      role="status"
      className="bg-brand text-white rounded-lg px-16 py-12 flex items-center gap-8 shadow-lg"
    >
      <span aria-hidden className="text-title">
        💬
      </span>
      <span className="text-body-md">{cue.text}</span>
    </div>
  );
}
