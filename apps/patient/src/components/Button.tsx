import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "dark";

/**
 * `.btn` and its variants from the design source (`figma-svg/_source/v2.html`).
 * Hairlines are inset shadows, not borders, so a secondary button is exactly
 * as tall as a primary one — a 1px border would make it 2px taller and the
 * two never line up in a stack.
 */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-teal text-white hover:bg-teal-deep",
  secondary: "bg-surf text-ink shadow-hair-strong hover:bg-sunk",
  danger: "bg-dang-wash text-dang shadow-[inset_0_0_0_1px_#E7BBB4] hover:brightness-95",
  // For overlaying the camera viewport, where the page palette would vanish.
  dark: "bg-night-3 text-white hover:brightness-110"
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** `.btn.sm` — 38px, for dense rows rather than a screen's main action. */
  small?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  small = false,
  className = "",
  children,
  ...rest
}: Props) {
  const size = small ? "h-38 px-14 text-b2" : "min-h-touch px-24 text-b1";
  return (
    <button
      {...rest}
      className={`flex items-center justify-center gap-8 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
