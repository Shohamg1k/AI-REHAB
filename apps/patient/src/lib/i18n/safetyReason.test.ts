import { describe, expect, it } from "vitest";
import {
  LOCALES,
  DEFAULT_LOCALE,
  type JointAngles,
  type JointName,
  type Locale,
  type SafetyVerdict
} from "@ai-rehab/contracts";
import { evaluateSafety } from "@ai-rehab/core";
import { localiseSafetyReason } from "./safetyReason.js";

const NON_DEFAULT: Locale[] = LOCALES.map((l) => l.code).filter((c) => c !== DEFAULT_LOCALE);

const angles = (
  measured: Partial<Record<JointName, number>>,
  trunkLean: number | null = null
): JointAngles => ({ t: 1000, angles: measured, confidence: {}, symmetry: {}, trunkLean });

const NO_ANGLES = angles({});

/**
 * Verdicts produced by the *real* gate, not hand-written fixtures. If the gate
 * starts emitting a shape this module does not handle, these fail — which is
 * the whole point. A localiser that only covers the verdicts its author
 * imagined is a localiser that goes silent on the one that matters.
 */
const REAL_VERDICTS: { label: string; verdict: SafetyVerdict }[] = [
  {
    label: "angle block (max)",
    verdict: evaluateSafety(
      { angles: angles({ left_knee: 178 }), consecutiveFailedReps: 0 },
      { maxAngle: { left_knee: 160 }, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "angle caution (max)",
    verdict: evaluateSafety(
      { angles: angles({ left_knee: 150 }), consecutiveFailedReps: 0 },
      { maxAngle: { left_knee: 160 }, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "angle block (min)",
    verdict: evaluateSafety(
      { angles: angles({ right_elbow: 10 }), consecutiveFailedReps: 0 },
      { minAngle: { right_elbow: 30 }, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "trunk lean block",
    verdict: evaluateSafety(
      { angles: angles({}, 40), consecutiveFailedReps: 0 },
      { maxTrunkLean: 25, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "trunk lean caution",
    verdict: evaluateSafety(
      { angles: angles({}, 24), consecutiveFailedReps: 0 },
      { maxTrunkLean: 25, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "instability escalate",
    verdict: evaluateSafety(
      { angles: NO_ANGLES, consecutiveFailedReps: 0, instabilityVelocity: 0.9 },
      { instabilityVelocity: 0.4, consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  },
  {
    label: "consecutive failed reps escalate",
    verdict: evaluateSafety(
      { angles: NO_ANGLES, consecutiveFailedReps: 4 },
      { consecutiveFailedRepsToBlock: 3 },
      null,
      1000
    )
  }
];

/** Every number the string contains, in order — "12.5" and "3" alike. */
const numbersIn = (s: string): string[] => s.match(/\d+(?:\.\d+)?/g) ?? [];

describe("localiseSafetyReason", () => {
  it("exercises a real verdict of every family", () => {
    // Guards the table above against silently degenerating to `allow` if a
    // threshold is edited — an `allow` verdict would make every assertion
    // below pass vacuously.
    for (const { label, verdict } of REAL_VERDICTS) {
      expect(verdict.verdict, label).not.toBe("allow");
      expect(verdict.ruleId, label).not.toBe("none");
    }
  });

  it("returns the canonical English reason verbatim for the default locale", () => {
    for (const { label, verdict } of REAL_VERDICTS) {
      expect(localiseSafetyReason(verdict, "en"), label).toBe(verdict.reason);
    }
  });

  it("produces non-empty, actually-translated text in every locale", () => {
    for (const { label, verdict } of REAL_VERDICTS) {
      for (const locale of NON_DEFAULT) {
        const text = localiseSafetyReason(verdict, locale);
        expect(text.trim(), `${label} / ${locale}`).not.toBe("");
        expect(text, `${label} / ${locale} fell back to English`).not.toBe(verdict.reason);
      }
    }
  });

  /**
   * The strongest guarantee here. The gate's numbers are what goes in the
   * patient's record; if the translated sentence quoted a different figure,
   * the patient and their clinician would be looking at two different events.
   */
  it("quotes exactly the numbers the gate reported", () => {
    for (const { label, verdict } of REAL_VERDICTS) {
      const expected = numbersIn(verdict.reason);
      for (const locale of NON_DEFAULT) {
        expect(numbersIn(localiseSafetyReason(verdict, locale)), `${label} / ${locale}`).toEqual(
          expected
        );
      }
    }
  });

  // CLAUDE.md §6 / feature E3: an escalation exists to route the patient to a
  // human. A translation that dropped that clause would still read fine.
  it("names the clinician in every escalation, in every locale", () => {
    const CLINICIAN_WORD: Record<string, string> = {
      es: "fisioterapeuta",
      hi: "फ़िज़ियोथेरेपिस्ट",
      fr: "kinésithérapeute"
    };
    const escalations = REAL_VERDICTS.filter(({ verdict }) => verdict.verdict === "escalate");
    expect(escalations.length).toBeGreaterThan(0);

    for (const { label, verdict } of escalations) {
      if (verdict.ruleId !== "consecutive_failed_reps") continue; // instability is a stop, not a referral
      for (const locale of NON_DEFAULT) {
        expect(localiseSafetyReason(verdict, locale), `${label} / ${locale}`).toContain(
          CLINICIAN_WORD[locale]
        );
      }
    }
  });

  it("does not mutate the verdict it was given", () => {
    for (const { verdict } of REAL_VERDICTS) {
      const before = JSON.stringify(verdict);
      for (const locale of NON_DEFAULT) localiseSafetyReason(verdict, locale);
      expect(JSON.stringify(verdict)).toBe(before);
    }
  });

  it("falls back to English rather than going silent on an unknown rule", () => {
    const future: SafetyVerdict = {
      t: 0,
      verdict: "block",
      ruleId: "a_rule_added_after_this_module_was_written",
      reason: "Something the gate knows about and this file does not.",
      threshold: { name: "whatever", limit: 1, observed: 2 },
      downgradeTo: null,
      source: "realtime_gate"
    };
    for (const locale of NON_DEFAULT) {
      expect(localiseSafetyReason(future, locale)).toBe(future.reason);
    }
  });

  it("falls back to English for an unmapped joint rather than reading out an identifier", () => {
    const odd: SafetyVerdict = {
      t: 0,
      verdict: "block",
      ruleId: "max_angle_left_pinky",
      reason: "left pinky angle (12.0°) crossed the safe max of 10°.",
      threshold: { name: "maxAngle.left_pinky", limit: 10, observed: 12 },
      downgradeTo: null,
      source: "realtime_gate"
    };
    for (const locale of NON_DEFAULT) {
      const text = localiseSafetyReason(odd, locale);
      expect(text).toBe(odd.reason);
      expect(text).not.toContain("left_pinky");
    }
  });
});
