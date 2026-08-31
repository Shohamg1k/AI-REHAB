import type { ReactNode } from "react";

/**
 * `.chip` and its `k-*` tones from the design source. Mono, tabular, small —
 * used for statuses and counts, never for anything the patient has to act on.
 */
export type ChipTone = "ok" | "warn" | "dang" | "pain" | "mute" | "teal" | "dark";

const TONE_CLASSES: Record<ChipTone, string> = {
  ok: "bg-ok-wash text-ok",
  warn: "bg-warn-wash text-warn",
  dang: "bg-dang-wash text-dang",
  pain: "bg-pain-wash text-pain",
  mute: "bg-sunk text-ink-2",
  teal: "bg-teal-wash text-teal-deep",
  // For overlaying the camera viewport.
  dark: "bg-white/12 text-[#E5EEEC]"
};

export function Chip({
  tone = "mute",
  className = "",
  children
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`ds-chip ${TONE_CLASSES[tone]} ${className}`}>{children}</span>;
}
