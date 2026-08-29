import type { Landmark } from "@ai-rehab/contracts";
import { OneEuroFilter, DEFAULT_ONE_EURO_PARAMS, type OneEuroParams } from "./oneEuroFilter.js";

/**
 * Smooths a 33-landmark stream frame by frame — one One Euro filter per
 * (landmark index × axis), 99 filters total. `visibility` is passed through
 * unsmoothed; it is a per-frame detection confidence, not a position.
 *
 * Used on `PoseFrame.world` before joint-angle computation (ARCHITECTURE.md
 * §4). Raw landmark jitter is enough to create phantom rep boundaries and
 * false asymmetry if this step is skipped.
 */
export class LandmarkSmoother {
  private filters: Array<{ x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }> | null = null;

  constructor(private readonly params: OneEuroParams = DEFAULT_ONE_EURO_PARAMS) {}

  smooth(landmarks: readonly Landmark[], tMs: number): Landmark[] {
    if (!this.filters) {
      this.filters = landmarks.map(() => ({
        x: new OneEuroFilter(this.params),
        y: new OneEuroFilter(this.params),
        z: new OneEuroFilter(this.params)
      }));
    }

    return landmarks.map((lm, i) => {
      const f = this.filters![i];
      if (!f) return lm;
      return {
        x: f.x.filter(lm.x, tMs),
        y: f.y.filter(lm.y, tMs),
        z: f.z.filter(lm.z, tMs),
        visibility: lm.visibility
      };
    });
  }

  reset(): void {
    this.filters = null;
  }
}
