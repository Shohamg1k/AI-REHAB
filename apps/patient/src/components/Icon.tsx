/**
 * The icon set the design source references by symbol id (`#i-home`,
 * `#i-shield`, …), drawn inline rather than loaded from a sprite or an icon
 * package. Inline keeps them on the app's own origin like every other asset
 * here, and there are few enough that a dependency would cost more than it
 * saves.
 *
 * All are 24×24 line icons on `currentColor`, so size and colour come from
 * the call site (`className="h-21 w-21 text-teal"`).
 */

export type IconName =
  | "home"
  | "chart"
  | "list"
  | "lock"
  | "shield"
  | "cam"
  | "sound"
  | "check"
  | "chevron"
  | "warning"
  | "stop";

const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  shield: <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z" />,
  cam: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 11l6-3v8l-6-3z" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M17 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  warning: (
    <>
      <path d="M12 3 22 20H2z" />
      <path d="M12 10v4M12 17.5h.01" />
    </>
  ),
  stop: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9h6v6H9z" />
    </>
  )
};

export function Icon({
  name,
  className = "h-16 w-16",
  strokeWidth = 1.7
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
