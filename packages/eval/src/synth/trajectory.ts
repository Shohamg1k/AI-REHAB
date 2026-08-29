import { smoothstep } from "./vec3.js";

export type RepCycleSpec = {
  restValue: number;
  peakValue: number;
  riseMs: number;
  holdMs: number;
  fallMs: number;
  gapMs: number;
};

export function cycleDurationMs(spec: RepCycleSpec): number {
  return spec.riseMs + spec.holdMs + spec.fallMs + spec.gapMs;
}

/** Value of a repeating rise/hold/fall/gap cycle at elapsed time `t` (ms), eased with smoothstep. */
export function cycleValueAt(spec: RepCycleSpec, t: number): number {
  const duration = cycleDurationMs(spec);
  const pos = ((t % duration) + duration) % duration;

  if (pos < spec.riseMs) {
    return spec.restValue + (spec.peakValue - spec.restValue) * smoothstep(0, spec.riseMs, pos);
  }
  if (pos < spec.riseMs + spec.holdMs) {
    return spec.peakValue;
  }
  const fallPos = pos - spec.riseMs - spec.holdMs;
  if (fallPos < spec.fallMs) {
    return spec.peakValue - (spec.peakValue - spec.restValue) * smoothstep(0, spec.fallMs, fallPos);
  }
  return spec.restValue;
}

export type TimelineOptions = {
  reps: number;
  frameIntervalMs: number;
  cycle: Omit<RepCycleSpec, "restValue" | "peakValue">;
};

/** Frame timestamps covering `reps` full cycles plus a trailing rest frame. */
export function frameTimestamps(opts: TimelineOptions): number[] {
  const duration = cycleDurationMs({ restValue: 0, peakValue: 0, ...opts.cycle });
  const totalMs = duration * opts.reps + opts.cycle.gapMs;
  const timestamps: number[] = [];
  for (let t = 0; t <= totalMs; t += opts.frameIntervalMs) {
    timestamps.push(t);
  }
  return timestamps;
}
