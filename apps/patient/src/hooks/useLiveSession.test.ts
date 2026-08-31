import { describe, expect, it } from "vitest";
import { computePerf } from "./useLiveSession.js";

/**
 * These are the numbers ADR-0007 will be closed with and that the M0 exit
 * criterion is stated in, so they should not be the one part of the change
 * nobody checked.
 */
describe("computePerf", () => {
  it("reports null until two frames have completed", () => {
    expect(computePerf([], [], "heavy")).toBeNull();
    expect(computePerf([50], [1000], "heavy")).toBeNull();
  });

  it("derives fps from the gaps between completions, not the count of them", () => {
    // 5 completions spanning 400ms = 4 intervals of 100ms = 10fps.
    const perf = computePerf([50, 50, 50, 50, 50], [0, 100, 200, 300, 400], "heavy");
    expect(perf?.fps).toBe(10);
  });

  it("uses the median inference time so one stall doesn't dominate", () => {
    // A single 900ms GC pause among otherwise-40ms frames: the mean would be
    // 212ms and read as a much slower device than this actually is.
    const perf = computePerf([40, 40, 900, 40, 40], [0, 100, 200, 300, 400], "heavy");
    expect(perf?.inferenceMsP50).toBe(40);
  });

  it("carries the tier through, since a latency figure means nothing without it", () => {
    expect(computePerf([30, 30], [0, 100], "lite")?.tier).toBe("lite");
  });

  it("does not divide by zero when every completion lands on the same timestamp", () => {
    const perf = computePerf([40, 40], [500, 500], "full");
    expect(perf?.fps).toBe(0);
    expect(perf?.inferenceMsP50).toBe(40);
  });
});
