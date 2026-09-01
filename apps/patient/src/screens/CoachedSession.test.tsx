import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import type { CaptureQuality, FormScore, RepEvent } from "@ai-rehab/contracts";

/**
 * A5/A7 session flow. Three behaviours are pinned here because all three were
 * reported from real use, and all three are invisible to a typecheck:
 *
 * 1. Reps must not be counted while the patient is framing the camera.
 * 2. There is a countdown between "start" and the first counted rep.
 * 3. The set ends itself once the target is reached.
 */

const liveState = {
  cameraStatus: "granted" as const,
  workerStatus: "ready" as const,
  errorMessage: null,
  landmarks: null,
  personDetected: true,
  // Typed as the real CaptureQuality rather than cast, so a field added to
  // the contract fails here instead of at render time.
  captureQuality: {
    score: 0.9,
    framing: "ok",
    lighting: "ok",
    missingJoints: [],
    missingLandmarks: [],
    landmarkChecks: [],
    guidance: [],
    requiredLandmarksOk: true
  } satisfies CaptureQuality,
  jointAngles: null,
  safetyVerdict: null,
  activeCue: null,
  reps: [] as Array<{ rep: RepEvent; score: FormScore }>,
  perf: null,
  videoSize: null
};

const setScoring = vi.fn();
const stop = vi.fn();
let currentReps: Array<{ rep: RepEvent; score: FormScore }> = [];

vi.mock("../hooks/useLiveSession.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useLiveSession: () => ({
      state: { ...liveState, reps: currentReps },
      start: vi.fn(),
      stop,
      setScoring,
      attachVideo: vi.fn()
    })
  };
});

vi.mock("../lib/db.js", () => ({ appendEvent: vi.fn() }));

const rep = (index: number) =>
  ({
    rep: { index, tStart: index * 1000, tEnd: index * 1000 + 800 } as unknown as RepEvent,
    score: { score: 90, confidence: 0.9, breakdown: [], reason: "ok" } as unknown as FormScore
  });

import { CoachedSession, COUNTDOWN_SECONDS, TARGET_REPS } from "./CoachedSession.js";

const renderSession = (onFinish = vi.fn()) => {
  // A *fresh* element every time. Passing the same element reference back to
  // `rerender` lets React bail out of the render entirely, so the updated
  // `currentReps` never reaches the component.
  const ui = () => (
    <CoachedSession
      exerciseId="seated-knee-extension"
      sessionId="s1"
      sessionT={() => 0}
      onFinish={onFinish}
      onCancel={vi.fn()}
    />
  );
  const { rerender } = render(ui());
  return { onFinish, rerender: () => rerender(ui()) };
};

/**
 * Advance a second at a time, each in its own `act`.
 *
 * The countdown schedules the next timeout from inside an effect, so a single
 * `advanceTimersByTime(10_000)` only ever fires the first tick — the timers
 * for seconds 2..10 do not exist yet when the queue is drained.
 */
const tick = (seconds: number) => {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
};

/** Walk from the intro screen to the live screen, as a patient would. */
const advanceToLive = () => {
  act(() => {
    screen.getByRole("button", { name: /set up camera/i }).click();
  });
  act(() => {
    screen.getByRole("button", { name: /start exercise/i }).click();
  });
};

describe("CoachedSession flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentReps = [];
    setScoring.mockClear();
    stop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  /**
   * The reported bug: the camera and pose model run during framing, so a
   * patient who tried the movement while checking their position arrived at
   * the live screen with reps already counted.
   */
  it("does not arm rep counting before the countdown finishes", () => {
    renderSession();
    advanceToLive();

    expect(setScoring).not.toHaveBeenCalledWith(true);

    // One tick short of zero: still disarmed.
    tick(COUNTDOWN_SECONDS - 1);
    expect(setScoring).not.toHaveBeenCalledWith(true);
  });

  it("arms rep counting exactly once, when the countdown reaches zero", () => {
    renderSession();
    advanceToLive();

    tick(COUNTDOWN_SECONDS);

    expect(setScoring.mock.calls.filter(([armed]) => armed === true)).toHaveLength(1);
  });

  it("counts the countdown down on screen", () => {
    renderSession();
    advanceToLive();

    expect(screen.getByText(String(COUNTDOWN_SECONDS))).toBeInTheDocument();
    tick(3);
    expect(screen.getByText(String(COUNTDOWN_SECONDS - 3))).toBeInTheDocument();
  });

  it("ends the set by itself once the target reps are reached", () => {
    const { onFinish, rerender } = renderSession();
    advanceToLive();
    tick(COUNTDOWN_SECONDS);

    currentReps = Array.from({ length: TARGET_REPS }, (_, i) => rep(i));
    act(rerender);
    expect(onFinish).not.toHaveBeenCalled(); // there is a beat first, not a jump cut

    tick(2);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });

  it("does not end the set early", () => {
    const { onFinish, rerender } = renderSession();
    advanceToLive();
    tick(COUNTDOWN_SECONDS);

    currentReps = Array.from({ length: TARGET_REPS - 1 }, (_, i) => rep(i));
    act(rerender);
    tick(5);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
