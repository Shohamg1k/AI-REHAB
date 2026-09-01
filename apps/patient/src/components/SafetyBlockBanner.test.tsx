import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SafetyVerdict } from "@ai-rehab/contracts";
import { SafetyBlockBanner } from "./SafetyBlockBanner.js";
import { saveSpeechPrefs } from "../lib/speech.js";

/**
 * CLAUDE.md invariant 3: "Nothing may soften a `block` or `escalate`
 * verdict downstream." That is a claim about the UI, so it deserves a test
 * in the UI — a redesign is exactly the kind of change that could
 * accidentally reintroduce a "continue anyway" button while everything
 * still typechecks.
 */

function verdict(overrides: Partial<SafetyVerdict> = {}): SafetyVerdict {
  return {
    t: 1000,
    verdict: "block",
    reason: "Knee bend passed its cap on three reps in a row.",
    threshold: { name: "Right knee", observed: 96, limit: 90 },
    ...overrides
  } as SafetyVerdict;
}

/** Anything that would read as "keep going" to a patient mid-set. */
const CONTINUE_WORDS =
  /continue|carry on|resume|keep going|push through|ignore|dismiss|anyway|next set/i;

describe("SafetyBlockBanner (E1/E3)", () => {
  it("offers no way to continue the set", () => {
    render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent ?? "").not.toMatch(CONTINUE_WORDS);
    }
  });

  it("never tells the patient to push through", () => {
    render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);
    expect(document.body.textContent).toMatch(/We will not ask you to carry on/i);
    expect(document.body.textContent).not.toMatch(/push through/i);
  });

  it("states the reason and the numbers behind it", () => {
    render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);
    expect(screen.getByText(/passed its cap on three reps/i)).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("gives an escalation path when the verdict escalates", () => {
    render(<SafetyBlockBanner verdict={verdict({ verdict: "escalate" })} onEndExercise={vi.fn()} />);
    expect(screen.getByText(/check in with your clinician/i)).toBeInTheDocument();
    expect(screen.getByText(/emergency services/i)).toBeInTheDocument();
  });

  it("tells the patient the block was written to their log", () => {
    render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);
    expect(screen.getByText(/written to your log/i)).toBeInTheDocument();
    expect(screen.getByText(/visible to your clinician/i)).toBeInTheDocument();
  });

  it("renders nothing for a verdict that is not a block", () => {
    const { container } = render(
      <SafetyBlockBanner verdict={verdict({ verdict: "allow" })} onEndExercise={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * H9. The safety sheet is the one screen a patient must understand on sight,
 * so it is the one place a language fallback is least acceptable. These
 * assertions are about the *safety-critical* clauses specifically: the title,
 * the escalation path, and the promise not to ask them to carry on.
 */
describe("SafetyBlockBanner in the patient's language", () => {
  afterEach(() => {
    saveSpeechPrefs({ locale: "en" });
    cleanup();
  });

  it("renders the block sheet in Hindi, numbers included", () => {
    saveSpeechPrefs({ locale: "hi" });
    render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);

    expect(screen.getByText("हमने यह सेट रोक दिया है")).toBeInTheDocument();
    expect(document.body.textContent).toContain("हम आपसे जारी रखने के लिए नहीं कहेंगे");
    // The design's mono numerals must survive interpolation into a sentence
    // whose word order differs from English.
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("keeps the escalation route to a clinician in every locale", () => {
    const CLINICIAN = { es: /fisioterapeuta/, hi: /फ़िज़ियोथेरेपिस्ट/, fr: /kinésithérapeute/ } as const;
    for (const [locale, pattern] of Object.entries(CLINICIAN)) {
      saveSpeechPrefs({ locale: locale as "es" | "hi" | "fr" });
      render(<SafetyBlockBanner verdict={verdict({ verdict: "escalate" })} onEndExercise={vi.fn()} />);
      expect(document.body.textContent, locale).toMatch(pattern);
      cleanup();
    }
  });

  it("still offers no way to continue the set once translated", () => {
    for (const locale of ["es", "hi", "fr"] as const) {
      saveSpeechPrefs({ locale });
      render(<SafetyBlockBanner verdict={verdict()} onEndExercise={vi.fn()} />);
      // Only one action, and it ends the exercise — the invariant is about the
      // shape of the sheet, so it must hold whatever language it is in.
      expect(screen.getAllByRole("button"), locale).toHaveLength(1);
      for (const button of screen.getAllByRole("button")) {
        expect(button.textContent ?? "").not.toMatch(CONTINUE_WORDS);
      }
      cleanup();
    }
  });
});
