import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DisclaimerBar } from "./DisclaimerBar.js";

/**
 * E4 — non-diagnostic framing, snapshot-tested per docs/UX-SPEC.md §3
 * ("copy is snapshot-tested; do not edit without review") and CLAUDE.md §4
 * ("Non-diagnostic framing survives the change"). A failing snapshot here
 * means the disclaimer copy changed — that should be a deliberate, reviewed
 * edit, never an incidental one.
 */
describe("DisclaimerBar (E4)", () => {
  it("renders the non-diagnostic disclaimer", () => {
    const { container } = render(<DisclaimerBar />);
    expect(container).toMatchSnapshot();
  });

  it("states plainly that this is not a medical device", () => {
    const { getByText } = render(<DisclaimerBar />);
    expect(getByText(/not a medical device/i)).toBeInTheDocument();
  });

  it("never claims to diagnose", () => {
    const { container } = render(<DisclaimerBar />);
    expect(container.textContent?.toLowerCase()).not.toMatch(/\bdiagnos(is|e|es|ed)\b.*\byou\b/);
  });
});
