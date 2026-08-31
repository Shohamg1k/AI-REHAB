import { Icon, type IconName } from "./Icon.js";

/**
 * `.disc` from the design source — an inline, per-screen disclaimer sitting
 * with the content it qualifies, rather than the single global bar at the
 * top of the app.
 *
 * This does not replace `DisclaimerBar` (E4), which stays exactly where it
 * is: CLAUDE.md §6 makes the non-diagnostic framing load-bearing, and it is
 * snapshot-tested precisely so it cannot quietly become a footnote. These
 * are the narrower, screen-specific caveats the designs place next to a
 * particular claim — "the session is marked low-confidence", "skeleton only,
 * no video was kept" — which are more useful adjacent to the thing they are
 * about than hoisted into a banner.
 */
export function Disclaimer({
  icon = "shield",
  className = "",
  children
}: {
  icon?: IconName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`flex items-start gap-8 text-[11.5px] leading-[1.4] text-ink-3 ${className}`}>
      <Icon name={icon} size={13} className="mt-1 flex-none" />
      <span>{children}</span>
    </p>
  );
}
