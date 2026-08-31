import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SafetyVerdict } from "@ai-rehab/contracts";
import { SafetyBlockBanner } from "./SafetyBlockBanner.js";

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
