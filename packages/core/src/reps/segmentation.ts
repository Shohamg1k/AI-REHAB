import type { ExerciseSpec, JointAngles, JointName, RepEvent, RepPhase } from "@ai-rehab/contracts";
import {
  computeTemporalMetrics,
  EMPTY_TEMPORAL_METRICS,
  type AngleSample,
  type TemporalMetrics
} from "./temporal.js";

/**
 * Rep segmentation FSM (A4). A rep is one traversal of `ExerciseSpec.phases`
 * in order; completing the last phase's entry condition closes the rep.
 * Two-phase specs (`concentric` then `eccentric`) are the common case for
 * the MVP's three exercises — see packages/exercises.
 *
 * Explicit-state, pure-function design (no hidden class state) so it is
 * trivially replayable by packages/eval: same (state, angles) in, same
 * (state, repEvent) out, every time.
 *
 * Auxiliary metrics (peak trunk lean, peak symmetry) are returned alongside
 * the persisted `RepEvent` rather than folded into it — `RepEvent` must stay
 * exactly the shape in docs/CONTRACTS.md, since that is what SessionEvent
 * persists. `RepAuxMetrics` is scoring-internal, not persisted.
 */

export type RepAuxMetrics = {
  peakTrunkLean: number;
  peakSymmetry: Partial<Record<"shoulder" | "elbow" | "hip" | "knee", number>>;
  /** Trajectory-shape metrics for the rep just closed. See ./temporal.ts. */
  temporal: TemporalMetrics;
};

export type RepSegmenterState = {
  cursor: number;
  phaseEnteredAt: number | null;
  repStartT: number | null;
  peakAngles: Partial<Record<JointName, number>>;
  minAngles: Partial<Record<JointName, number>>;
  confidenceSamples: number[];
  /** Driving-joint angle series for the in-progress rep, for temporal metrics. */
  angleSamples: AngleSample[];
  trunkLeanSamples: number[];
  auxMetrics: RepAuxMetrics;
  repIndex: number;
};

export function createRepSegmenterState(): RepSegmenterState {
  return {
    cursor: 0,
    phaseEnteredAt: null,
    repStartT: null,
    peakAngles: {},
    minAngles: {},
    confidenceSamples: [],
    angleSamples: [],
    trunkLeanSamples: [],
    auxMetrics: { peakTrunkLean: 0, peakSymmetry: {}, temporal: EMPTY_TEMPORAL_METRICS },
    repIndex: 0
  };
}

function crosses(phase: RepPhase, angle: number): boolean {
  return phase.enter.direction === "above" ? angle >= phase.enter.angle : angle <= phase.enter.angle;
}

function accumulate(
  state: RepSegmenterState,
  angles: JointAngles,
  drivingJoint: JointName
): RepSegmenterState {
  const peakAngles = { ...state.peakAngles };
  const minAngles = { ...state.minAngles };
  for (const [joint, value] of Object.entries(angles.angles) as Array<[JointName, number]>) {
    peakAngles[joint] = Math.max(peakAngles[joint] ?? -Infinity, value);
    minAngles[joint] = Math.min(minAngles[joint] ?? Infinity, value);
  }

  const drivingAngle = angles.angles[drivingJoint];
  const angleSamples =
    drivingAngle === undefined
      ? state.angleSamples
      : [...state.angleSamples, { t: angles.t, angle: drivingAngle }];

  const confidenceValues = Object.values(angles.confidence) as number[];
  const confidenceSamples =
    confidenceValues.length > 0
      ? [...state.confidenceSamples, confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length]
      : state.confidenceSamples;

  const peakSymmetry = { ...state.auxMetrics.peakSymmetry };
  for (const [group, value] of Object.entries(angles.symmetry) as Array<
    [keyof RepAuxMetrics["peakSymmetry"], number]
  >) {
    peakSymmetry[group] = Math.max(peakSymmetry[group] ?? 0, value);
  }

  return {
    ...state,
    peakAngles,
    minAngles,
    confidenceSamples,
    angleSamples,
    // Frames where the torso was not visible contribute nothing rather than
    // contributing a zero. Averaging in a 0 for "unknown" would drag the
    // rep's trunk-lean statistics toward "upright" precisely when the
    // evidence for uprightness is missing.
    trunkLeanSamples:
      angles.trunkLean === null
        ? state.trunkLeanSamples
        : [...state.trunkLeanSamples, angles.trunkLean],
    auxMetrics: {
      ...state.auxMetrics,
      peakTrunkLean:
        angles.trunkLean === null
          ? state.auxMetrics.peakTrunkLean
          : Math.max(state.auxMetrics.peakTrunkLean, angles.trunkLean),
      peakSymmetry
    }
  };
}

export type RepSegmenterResult = {
  state: RepSegmenterState;
  closedRep: { rep: RepEvent; aux: RepAuxMetrics } | null;
};

/**
 * Advance the FSM by one frame. Call on every JointAngles sample.
 * `setIndex` is supplied by the caller (application-level set tracking is
 * out of this module's concern) and stamped onto any rep closed this call.
 */
export function stepRepSegmenter(
  state: RepSegmenterState,
  angles: JointAngles,
  spec: ExerciseSpec,
  setIndex: number
): RepSegmenterResult {
  const phase = spec.phases[state.cursor];
  if (!phase) {
    // Malformed spec (empty phases) — nothing to do; validated at author time.
    return { state, closedRep: null };
  }

  const angle = angles.angles[phase.joint];
  if (angle === undefined) {
    return { state, closedRep: null };
  }

  const started = accumulate(
    state.repStartT === null ? { ...state, repStartT: angles.t } : state,
    angles,
    phase.joint
  );

  if (!crosses(phase, angle)) {
    return { state: started, closedRep: null };
  }

  // Debounce: require the phase to have been "waiting" for at least
  // minDurationMs since the previous transition before honouring this one —
  // guards the double-count-on-slow-eccentric failure mode called out in
  // docs/ROADMAP.md M1. maxDurationMs is accepted by the type but not
  // enforced here; it is reserved for a future stall/timeout feature (E2 is
  // fast-follow), not required for correct rep counting.
  const dwellStart = started.phaseEnteredAt ?? started.repStartT ?? angles.t;
  const dwellMs = angles.t - dwellStart;
  if (phase.minDurationMs !== undefined && dwellMs < phase.minDurationMs) {
    return { state: started, closedRep: null };
  }

  const isLastPhase = state.cursor === spec.phases.length - 1;

  if (!isLastPhase) {
    return {
      state: { ...started, cursor: started.cursor + 1, phaseEnteredAt: angles.t },
      closedRep: null
    };
  }

  // Last phase's entry condition just fired — close the rep.
  const confidenceSamples = started.confidenceSamples;
  const meanConfidence =
    confidenceSamples.length > 0
      ? confidenceSamples.reduce((a, b) => a + b, 0) / confidenceSamples.length
      : 0;

  const endAngles: Partial<Record<JointName, number>> = { ...angles.angles };

  const rep: RepEvent = {
    t: angles.t,
    repIndex: started.repIndex,
    setIndex,
    phaseTimings: {
      // Coarse: we only track cursor transitions, not per-phase start/end
      // wall time beyond dwell — sufficient for the MVP's tempo criterion.
      [phase.name]: { startMs: dwellStart, endMs: angles.t }
    },
    peakAngles: started.peakAngles,
    endAngles,
    tempoMs: angles.t - (started.repStartT ?? angles.t),
    meanConfidence
  };

  const aux: RepAuxMetrics = {
    ...started.auxMetrics,
    temporal: computeTemporalMetrics(started.angleSamples, started.trunkLeanSamples)
  };

  const nextState: RepSegmenterState = {
    cursor: 0,
    phaseEnteredAt: null,
    repStartT: null,
    peakAngles: {},
    minAngles: {},
    confidenceSamples: [],
    angleSamples: [],
    trunkLeanSamples: [],
    auxMetrics: { peakTrunkLean: 0, peakSymmetry: {}, temporal: EMPTY_TEMPORAL_METRICS },
    repIndex: started.repIndex + 1
  };

  return { state: nextState, closedRep: { rep, aux } };
}
