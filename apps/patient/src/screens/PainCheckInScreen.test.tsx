import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PainCheckInScreen } from "./PainCheckInScreen.js";

/**
 * B6 is the rule under test: the patient's own answer is what gets
 * recorded. These check that the screen cannot submit a severity the
 * patient did not choose, and that the region reaches the caller unchanged.
 */
describe("PainCheckInScreen (B2/B6)", () => {
  it("cannot continue until the patient has actually answered", async () => {
    render(<PainCheckInScreen bookmarked={false} onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("records exactly the region and severity chosen", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<PainCheckInScreen bookmarked={false} onSubmit={onSubmit} onSkip={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Knee", pressed: false }));
    await user.click(screen.getByRole("button", { name: /^3/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith("knee", 3);
  });

  it("asks about the region the patient picked, by name", async () => {
    const user = userEvent.setup();
    render(<PainCheckInScreen bookmarked={false} onSubmit={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "How did that feel?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Lower back", pressed: false }));
    expect(
      screen.getByRole("heading", { name: "How did that lower back feel?" })
    ).toBeInTheDocument();
  });

  it("flags a bookmarked rep, and says so only when there is one", () => {
    const { rerender } = render(
      <PainCheckInScreen bookmarked={false} onSubmit={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.queryByText(/rep flagged/i)).not.toBeInTheDocument();

    rerender(<PainCheckInScreen bookmarked onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/rep flagged/i)).toBeInTheDocument();
  });

  it("keeps the promise that nothing was kept to replay", () => {
    render(<PainCheckInScreen bookmarked onSubmit={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/because none was ever kept/i)).toBeInTheDocument();
  });

  it("offers a no-pain path that does not record a severity", async () => {
    const onSkip = vi.fn();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    render(<PainCheckInScreen bookmarked={false} onSubmit={onSubmit} onSkip={onSkip} />);
    await user.click(screen.getByRole("button", { name: "No pain to report" }));

    expect(onSkip).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
