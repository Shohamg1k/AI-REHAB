import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "pain" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-sunk text-ink-2",
  success: "bg-ok-wash text-ok",
  warning: "bg-warn-wash text-warn",
  danger: "bg-dang-wash text-dang",
  pain: "bg-pain-wash text-pain",
  brand: "bg-teal-wash text-teal"
};

/**
 * `Pill/Status` — docs/UX-SPEC.md §3. Colour is never the only signal
 * (§1): every pill pairs its tone with a word, never colour alone.
 */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-4 px-12 py-4 rounded-pill text-b2 font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
