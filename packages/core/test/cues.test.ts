import { describe, expect, it } from "vitest";
import type { CueTemplate, FormCriterion, FormScoreBreakdownItem } from "@ai-rehab/contracts";
import { selectCue } from "../src/index.js";

const criteria: FormCriterion[] = [
  {
    id: "peak-extension",
    label: "Peak extension",
    joint: "left_knee",
    measure: "peak_angle",
    target: { min: 165, max: 180 },
    tolerance: { warn: 5, fail: 15 },
    weight: 2
  },
  {
    id: "tempo",
    label: "Controlled tempo",
    joint: "left_knee",
    measure: "tempo_ms",
    target: { min: 800, max: 3000 },
    tolerance: { warn: 200, fail: 600 },
    weight: 1
  }
];

const cues: CueTemplate[] = [
  {
    id: "straighten-knee",
    triggerCriterion: "peak-extension",
    direction: "under",
    text: "Straighten your knee a little more.",
    cooldownMs: 5000,
    priority: 1
  },
  {
    id: "slow-down",
    triggerCriterion: "tempo",
    direction: "under",
    text: "Slow the movement down.",
    cooldownMs: 5000,
    priority: 2
  }
];

function breakdown(overrides: Partial<Record<string, FormScoreBreakdownItem>>): FormScoreBreakdownItem[] {
  const base: Record<string, FormScoreBreakdownItem> = {
    "peak-extension": {
      criterionId: "peak-extension",
      label: "Peak extension",
      value: 175,
      target: { min: 165, max: 180 },
      status: "ok",
      contribution: 67
    },
    tempo: {
      criterionId: "tempo",
      label: "Controlled tempo",
      value: 1200,
      target: { min: 800, max: 3000 },
      status: "ok",
      contribution: 33
    }
  };
  return Object.values({ ...base, ...overrides });
}

describe("selectCue", () => {
  it("returns no cue when everything is ok", () => {
    const { cue } = selectCue(breakdown({}), criteria, cues, {}, 0);
    expect(cue).toBeNull();
  });

  it("fires the matching cue for a failed criterion, under-direction", () => {
    const failing = breakdown({
      "peak-extension": {
        criterionId: "peak-extension",
        label: "Peak extension",
        value: 140,
        target: { min: 165, max: 180 },
        status: "fail",
        contribution: 0
      }
    });
    const { cue } = selectCue(failing, criteria, cues, {}, 0);
    expect(cue).not.toBeNull();
    expect(cue!.cueId).toBe("straighten-knee");
    expect(cue!.text).toBe("Straighten your knee a little more.");
    expect(cue!.urgency).toBe("correct");
    expect(cue!.source).toBe("form");
  });

  it("respects cooldownMs — does not re-fire the same cue too soon", () => {
    const failing = breakdown({
      "peak-extension": {
        criterionId: "peak-extension",
        label: "Peak extension",
        value: 140,
        target: { min: 165, max: 180 },
        status: "fail",
        contribution: 0
      }
    });
    const first = selectCue(failing, criteria, cues, {}, 0);
    expect(first.cue).not.toBeNull();

    const second = selectCue(failing, criteria, cues, first.cooldownState, 1000); // 1s < 5s cooldown
    expect(second.cue).toBeNull();

    const third = selectCue(failing, criteria, cues, first.cooldownState, 6000); // past cooldown
    expect(third.cue).not.toBeNull();
  });

  it("prefers the higher-priority cue when two criteria fail at once", () => {
    const bothFailing = breakdown({
      "peak-extension": {
        criterionId: "peak-extension",
        label: "Peak extension",
        value: 140,
        target: { min: 165, max: 180 },
        status: "fail",
        contribution: 0
      },
      tempo: {
        criterionId: "tempo",
        label: "Controlled tempo",
        value: 100,
        target: { min: 800, max: 3000 },
        status: "fail",
        contribution: 0
      }
    });
    const { cue } = selectCue(bothFailing, criteria, cues, {}, 0);
    expect(cue!.cueId).toBe("slow-down"); // priority 2 > priority 1
  });

  it("does not fire a cue for the wrong direction", () => {
    const overExtended = breakdown({
      "peak-extension": {
        criterionId: "peak-extension",
        label: "Peak extension",
        value: 200, // over target.max, not under
        target: { min: 165, max: 180 },
        status: "fail",
        contribution: 0
      }
    });
    const { cue } = selectCue(overExtended, criteria, cues, {}, 0);
    expect(cue).toBeNull(); // only an "under" cue is defined for this criterion
  });
});
