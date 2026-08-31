import { describe, expect, it } from "vitest";
import type { Landmark } from "@ai-rehab/contracts";
import { coverMapper } from "./SkeletonOverlay.js";

const at = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 });

/**
 * The skeleton is drawn over a video the browser crops with `object-cover`.
 * If the mapping ignores that crop the joints land off the body — subtly in
 * the middle of frame, badly at the edges — which reads as bad tracking
 * rather than as a rendering bug, so it is worth pinning down directly.
 */
describe("coverMapper", () => {
  it("maps corner-to-corner when the source and canvas already agree", () => {
    const map = coverMapper(400, 300, 800, 600); // both 4:3

    // x is mirrored: normalised x=0 is the right edge on screen.
    expect(map(at(0, 0))).toEqual([400, 0]);
    expect(map(at(1, 1))).toEqual([0, 300]);
    expect(map(at(0.5, 0.5))).toEqual([200, 150]);
  });

  it("crops the overflowing axis when a 16:9 stream fills a 4:3 stage", () => {
    // Cover scales to the taller axis, so the extra width spills off both
    // sides equally: 1280*(300/720) = 533.3 drawn into 400px of canvas.
    const map = coverMapper(400, 300, 1280, 720);

    const [centreX, centreY] = map(at(0.5, 0.5));
    expect(centreX).toBeCloseTo(200, 5); // centre still maps to centre
    expect(centreY).toBeCloseTo(150, 5);

    // The frame's own left/right edges now sit outside the visible canvas —
    // which is exactly what the viewer sees, and what the old mapping got
    // wrong by squeezing them to 0 and 400.
    const [leftEdgeX] = map(at(0, 0.5));
    const [rightEdgeX] = map(at(1, 0.5));
    expect(leftEdgeX).toBeGreaterThan(400);
    expect(rightEdgeX).toBeLessThan(0);
  });

  it("crops vertically when the stream is taller than the stage", () => {
    const map = coverMapper(400, 300, 480, 640); // portrait source, landscape stage

    const [, centreY] = map(at(0.5, 0.5));
    expect(centreY).toBeCloseTo(150, 5);

    const [, topY] = map(at(0.5, 0));
    const [, bottomY] = map(at(0.5, 1));
    expect(topY).toBeLessThan(0);
    expect(bottomY).toBeGreaterThan(300);
  });

  it("falls back to a plain stretch rather than dividing by zero before metadata arrives", () => {
    const map = coverMapper(400, 300, 0, 0);
    expect(map(at(0.5, 0.5))).toEqual([200, 150]);
  });
});
