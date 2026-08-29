import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "pain" | "brand";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-subtle text-text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  pain: "bg-pain-soft text-pain",
  brand: "bg-brand-soft text-brand"
};

/**
 * `Pill/Status` — docs/UX-SPEC.md §3. Colour is never the only signal
 * (§1): every pill pairs its tone with a word, never colour alone.
 */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-4 px-12 py-4 rounded-pill text-label ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
