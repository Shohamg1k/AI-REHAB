/**
 * Temporal movement quality (A2, extended).
 *
 * A rep is a trajectory, not a pose. Scoring only the peak angle rewards a
 * patient who snaps to the target and drops back, and cannot distinguish a
 * controlled rep from a swung one that happened to touch the same number.
 * These metrics summarise the *shape* of the movement over the rep window.
 *
 * Everything here is closed-form arithmetic over a small angle series —
 * no model, no allocation beyond the sample buffer, safe for the per-frame
 * path (ADR-0001). Sophisticated ideas, cheap implementation: the intent is
 * to capture what a spatio-temporal model would look at (joint trajectory,
 * velocity profile, symmetry over time) without putting a network in the
 * 24fps loop, where reliability matters more than model capacity.
 */

export type AngleSample = { t: number; angle: number };

export type TemporalMetrics = {
  /** Peak-to-trough travel of the driving joint, in degrees. */
  rangeOfMotion: number;
  /**
   * Movement smoothness, 0..1 (1 = perfectly steady speed). Derived from the
   * dispersion of angular velocity: a jerky or swung rep has a spikier
   * velocity profile than a controlled one at the same average speed.
   */
  smoothness: number;
  /** Peak angular velocity, deg/s — flags a rep thrown with momentum. */
  peakVelocity: number;
  /**
   * Symmetry of the up phase vs the down phase, 0..1 (1 = equal duration).
   * Rehab reps are usually meant to be lowered as deliberately as they are
   * lifted; a fast eccentric is a common compensation.
   */
  phaseBalance: number;
  /** How steady the trunk was across the rep, 0..1 (1 = no wobble). */
  stability: number;
  /** Sample count the metrics were computed from — low counts are unreliable. */
  sampleCount: number;
};

export const EMPTY_TEMPORAL_METRICS: TemporalMetrics = {
  rangeOfMotion: 0,
  smoothness: 0,
  peakVelocity: 0,
  phaseBalance: 0,
  stability: 0,
  sampleCount: 0
};

/** Below this, the rep was observed too sparsely for temporal metrics to mean anything. */
export const MIN_TEMPORAL_SAMPLES = 6;

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/**
 * Maps a "lower is better" dispersion ratio onto 0..1 with a soft knee.
 * `scale` is the ratio at which the score reaches 0.5, so the curve is
 * defined by a meaningful quantity rather than a tuned magic constant.
 */
function dispersionScore(ratio: number, scale: number): number {
  if (!Number.isFinite(ratio) || ratio < 0) return 0;
  return 1 / (1 + ratio / scale);
}

/** Velocity coefficient-of-variation at which smoothness scores 0.5. */
const SMOOTHNESS_CV_HALF_POINT = 1.0;
/** Trunk-lean standard deviation (degrees) at which stability scores 0.5. */
const STABILITY_STDDEV_HALF_POINT = 6;

export function computeTemporalMetrics(
  samples: readonly AngleSample[],
  trunkLeanSamples: readonly number[]
): TemporalMetrics {
  if (samples.length < MIN_TEMPORAL_SAMPLES) {
    return { ...EMPTY_TEMPORAL_METRICS, sampleCount: samples.length };
  }

  const angles = samples.map((s) => s.angle);
  const rangeOfMotion = Math.max(...angles) - Math.min(...angles);

  const velocities: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    const dt = (curr.t - prev.t) / 1000;
    if (dt <= 0) continue;
    velocities.push((curr.angle - prev.angle) / dt);
  }

  if (velocities.length < 2) {
    return { ...EMPTY_TEMPORAL_METRICS, rangeOfMotion, sampleCount: samples.length };
  }

  const speeds = velocities.map(Math.abs);
  const meanSpeed = mean(speeds);
  const peakVelocity = Math.max(...speeds);
  // Coefficient of variation: dispersion relative to speed, so a slow
  // controlled rep and a fast controlled rep both score well.
  const cv = meanSpeed > 0 ? stdDev(speeds) / meanSpeed : 0;
  const smoothness = dispersionScore(cv, SMOOTHNESS_CV_HALF_POINT);

  // Phase balance from the sign of velocity: time spent going "up" vs "down".
  const risingMs = velocities.filter((v) => v > 0).length;
  const fallingMs = velocities.filter((v) => v < 0).length;
  const totalDirectional = risingMs + fallingMs;
  const phaseBalance =
    totalDirectional === 0 ? 0 : 1 - Math.abs(risingMs - fallingMs) / totalDirectional;

  const stability =
    trunkLeanSamples.length >= 2
      ? dispersionScore(stdDev(trunkLeanSamples), STABILITY_STDDEV_HALF_POINT)
      : 1;

  return {
    rangeOfMotion,
    smoothness,
    peakVelocity,
    phaseBalance,
    stability,
    sampleCount: samples.length
  };
}

/**
 * Rep-to-rep consistency across a set, 0..1. Computed over completed reps
 * rather than inside one, so it lives at the session level.
 *
 * Consistency is what separates "did ten reps" from "did ten of the same
 * rep" — a set that drifts is a fatigue signal a per-rep score cannot see.
 */
export function repConsistency(rangeOfMotionPerRep: readonly number[]): number {
  if (rangeOfMotionPerRep.length < 2) return 1;
  const m = mean(rangeOfMotionPerRep);
  if (m <= 0) return 0;
  return dispersionScore(stdDev(rangeOfMotionPerRep) / m, 0.25);
}
