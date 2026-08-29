/**
 * One Euro Filter (Casiez, Roussel, Vogel — CHI 2012).
 *
 * Chosen over a moving average per ARCHITECTURE.md §4: low lag at high
 * speed, low jitter at low speed. A plain moving average adds lag that
 * shows up downstream as late cues — this is why the filter exists.
 *
 * Stateful by design (each instance tracks the previous sample and its
 * derivative) but performs no I/O, no clock reads beyond the `t` passed in,
 * and no randomness — it satisfies "packages/core stays pure" in the sense
 * ARCHITECTURE.md §6 means it: deterministic function of its inputs.
 */

export type OneEuroParams = {
  /** Minimum cutoff frequency (Hz-ish). Lower = smoother but more lag at low speed. */
  minCutoff: number;
  /** Speed coefficient. Higher = cuts lag more aggressively as speed increases. */
  beta: number;
  /** Cutoff frequency for the derivative estimate. */
  dCutoff: number;
};

export const DEFAULT_ONE_EURO_PARAMS: OneEuroParams = {
  minCutoff: 1.0,
  beta: 0.3,
  dCutoff: 1.0
};

function alpha(cutoff: number, dtSeconds: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSeconds);
}

function lowPass(value: number, prev: number | null, a: number): number {
  if (prev === null) return value;
  return a * value + (1 - a) * prev;
}

export class OneEuroFilter {
  private lastValue: number | null = null;
  private lastDerivative: number | null = null;
  private lastT: number | null = null;

  constructor(private readonly params: OneEuroParams = DEFAULT_ONE_EURO_PARAMS) {}

  /** @param x raw sample @param tMs monotonic milliseconds (not wall clock) */
  filter(x: number, tMs: number): number {
    if (this.lastT === null) {
      this.lastValue = x;
      this.lastDerivative = 0;
      this.lastT = tMs;
      return x;
    }

    const dtSeconds = Math.max((tMs - this.lastT) / 1000, 1 / 240); // guard div-by-zero on duplicate t
    this.lastT = tMs;

    const dx = (x - (this.lastValue ?? x)) / dtSeconds;
    const aD = alpha(this.params.dCutoff, dtSeconds);
    const dHat = lowPass(dx, this.lastDerivative, aD);

    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dHat);
    const aV = alpha(cutoff, dtSeconds);
    const xHat = lowPass(x, this.lastValue, aV);

    this.lastValue = xHat;
    this.lastDerivative = dHat;
    return xHat;
  }

  reset(): void {
    this.lastValue = null;
    this.lastDerivative = null;
    this.lastT = null;
  }
}
