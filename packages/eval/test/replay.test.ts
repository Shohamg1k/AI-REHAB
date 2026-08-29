import { describe, expect, it } from "vitest";
import { EXERCISES } from "@ai-rehab/exercises";
import { FIXTURES } from "../src/synth/fixtures.js";
import { replayAll } from "../src/replay.js";
import { checkSafetyRuleCoverage } from "../src/coverage.js";

describe("I2 fixture replay", () => {
  const results = replayAll(FIXTURES);

  it("every fixture passes its own expectations", () => {
    const failing = results.filter((r) => !r.passed);
    if (failing.length > 0) {
      const detail = failing.map((f) => `${f.fixtureId}: ${f.failures.join("; ")}`).join("\n");
      throw new Error(`${failing.length} fixture(s) failed:\n${detail}`);
    }
    expect(failing).toHaveLength(0);
  });

  it("covers every configured veto-tier safety rule across all exercises (CLAUDE.md §4)", () => {
    const firedRuleIds = new Set(results.flatMap((r) => r.firedRuleIds));
    const { missing } = checkSafetyRuleCoverage(EXERCISES, firedRuleIds);
    expect(missing).toEqual([]);
  });

  it("fixture ids are unique", () => {
    const ids = FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every fixture references a real exercise id", () => {
    const exerciseIds = new Set(EXERCISES.map((e) => e.id));
    for (const fixture of FIXTURES) {
      expect(exerciseIds.has(fixture.exerciseId)).toBe(true);
    }
  });
});
