import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * H9 layout, enforced by inspection rather than by intention.
 *
 * Two things here are easy to undo by accident and impossible to notice in a
 * unit test:
 *
 * 1. **Screens pinning themselves to a phone-width column.** Every screen used
 *    to hardcode `max-w-lg`, which on a 1920px display left three quarters of
 *    the window empty. They share `.ds-shell` now, which widens with the
 *    viewport — and a new screen that copies an old one's class string would
 *    quietly reintroduce the problem.
 *
 * 2. **Small type in the live session overlay.** The patient reads that screen
 *    from across the room — far enough that they cannot reach it, which is why
 *    voice control exists at all. The overlay sizes itself from the viewport
 *    (`.ds-stage-*`); a hardcoded `text-[13.5px]` would render it unreadable
 *    at the only distance it is ever read from.
 *
 * These are crude source greps, like `privacy.test.ts`. They catch the
 * realistic failure — someone extending the app by copying a pattern — rather
 * than a determined workaround.
 */

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}

const relative = (path: string) => path.replace(/\\/g, "/").split("/src/")[1] ?? "";
const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(path),
  text: readFileSync(path, "utf8")
}));

describe("page layout", () => {
  it("has screens to inspect", () => {
    expect(FILES.filter((f) => f.path.startsWith("screens/")).length).toBeGreaterThan(8);
  });

  /**
   * `.ds-shell` is the one place the column width is decided. A screen that
   * hardcodes its own width cannot follow it, and the desktop layout regresses
   * for that screen alone — which is exactly how this went unnoticed before.
   */
  it("routes every patient screen through the shared responsive column", () => {
    const offenders = FILES.filter((f) => f.path.startsWith("screens/"))
      .filter((f) => /max-w-lg/.test(f.text))
      .map((f) => f.path);
    expect(offenders, `Screens pinned to a fixed phone width:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("gives the live session the whole window rather than the reading column", () => {
    const live = FILES.find((f) => f.path === "screens/LiveSessionScreen.tsx");
    expect(live).toBeDefined();
    expect(live!.text).toContain("ds-stage-shell");
    // The reading column would cap the camera at 512–1152px in the middle of
    // an otherwise empty screen.
    expect(live!.text).not.toMatch(/className="[^"]*\bds-shell\b/);
  });
});

describe("live session overlay is legible from a distance", () => {
  const stageFiles = ["screens/LiveSessionScreen.tsx"];

  /**
   * The numbers the patient actually looks for mid-rep. If these stop using
   * the viewport-scaled classes they are back to a fixed pixel size, which on
   * a laptop across a room is a few millimetres tall.
   */
  it("sizes the rep count, score and coaching message from the viewport", () => {
    const live = FILES.find((f) => f.path === "screens/LiveSessionScreen.tsx")!;
    for (const cls of [
      "ds-stage-count",
      "ds-stage-score",
      "ds-stage-caption",
      "ds-stage-message",
      "ds-stage-title",
      "ds-stage-action"
    ]) {
      expect(live.text, `missing ${cls}`).toContain(cls);
    }
  });

  it("has no hardcoded small type left in the overlay", () => {
    const offenders: string[] = [];
    for (const file of FILES.filter((f) => stageFiles.includes(f.path))) {
      // Anything under 18px is unreadable at the distance this screen is used
      // from. The overlay should be asking the viewport, not guessing.
      for (const match of file.text.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        const px = Number(match[1]);
        if (px < 18) offenders.push(`${file.path}: text-[${match[1]}px]`);
      }
    }
    expect(
      offenders,
      `Fixed small type in the live overlay — use a ds-stage-* class:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("the design system stylesheet", () => {
  const css = readFileSync(join(SRC, "styles", "index.css"), "utf8");

  it("defines the responsive column and its breakpoints", () => {
    expect(css).toContain(".ds-shell");
    // iPad portrait, iPad landscape, desktop.
    for (const bp of ["768px", "1024px", "1440px"]) {
      expect(css, `missing breakpoint ${bp}`).toContain(bp);
    }
  });

  it("scales the overlay with vmin, not with the window width alone", () => {
    // `vw` would make the rep counter taller than the video on a wide, short
    // desktop window.
    for (const cls of ["ds-stage-count", "ds-stage-message"]) {
      const block = css.slice(css.indexOf(`.${cls}`), css.indexOf(`.${cls}`) + 200);
      expect(block, `${cls} should clamp on vmin`).toMatch(/clamp\([^)]*vmin/);
    }
  });
});
