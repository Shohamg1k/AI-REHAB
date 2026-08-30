"""
E5 — the session-level safety supervisor. Adapted from upstream
OpenRehabAgent's supervisor_agent.py per docs/UPSTREAM.md §1.2 ("Adopt.
Clean, deterministic, already returns a reason string.") — the pattern is
kept, not the file. Nothing here is vendored verbatim.

This is a SECOND, coarser safety layer than packages/core/safety's
real-time frame-level gate (E1). E1 runs client-side, every frame, on raw
joint angles, and can veto mid-rep. This runs server-side, once per
session-start or program-assignment decision, on session-level signals
(self-reported pain, contraindications, a rep-failure streak) that E1
structurally cannot see because it only ever looks at one frame at a time.
Neither layer may soften the other's verdict — this module never overrides
an E1 block, and nothing downstream of this module may treat "allowed"
here as license to ignore a later E1 block.

Pure function, same spirit as packages/core/safety/gate.ts: no I/O, no
clock, no randomness, deterministic given its inputs.
"""

from .models import SafetyDecision, SuperviseRequest

# Upstream's own thresholds (docs/UPSTREAM.md §1.2), kept as the values
# rather than re-derived — they were already a defensible, if unvalidated,
# starting point, and changing them silently would be a scope creep this
# module doesn't need. Re-validate against real data before relying on them
# clinically, same caveat as every provisional exercise range elsewhere in
# this codebase.
CAUTION_PAIN_THRESHOLD = 0.55
STOP_PAIN_THRESHOLD = 0.75
CONSECUTIVE_FAILED_REPS_TO_ESCALATE = 5

REST_EXERCISE_ID = "rest"


def evaluate(request: SuperviseRequest) -> SafetyDecision:
    # Always-allow-`rest` fallback (upstream's own safety valve) — whatever
    # else is happening, resting is never the wrong recommendation.
    if request.exercise_id == REST_EXERCISE_ID:
        return SafetyDecision(
            allowed=True, blocked=False, risk_level="low", reason="Rest is always available."
        )

    contraindicated = set(request.target_regions) & set(request.patient_contraindicated_regions)
    if contraindicated:
        region = sorted(contraindicated)[0]
        return SafetyDecision(
            allowed=False,
            blocked=True,
            risk_level="high",
            reason=f"This exercise targets {region.replace('_', ' ')}, which is marked contraindicated for this patient.",
        )

    pain = request.recent_pain_severity
    if pain is not None and pain >= STOP_PAIN_THRESHOLD:
        return SafetyDecision(
            allowed=False,
            blocked=True,
            risk_level="high",
            reason=f"Recent self-reported pain ({pain:.2f}) is at or above the stop threshold ({STOP_PAIN_THRESHOLD}).",
        )

    # Intensity ceiling: a high-intensity exercise is blocked outright while
    # in the caution band, rather than merely flagged — the two conditions
    # compound, they don't average out.
    if pain is not None and pain >= CAUTION_PAIN_THRESHOLD and request.intensity == "high":
        return SafetyDecision(
            allowed=False,
            blocked=True,
            risk_level="high",
            reason=(
                f"High-intensity exercise is not recommended while recent pain "
                f"({pain:.2f}) is in the caution range (>= {CAUTION_PAIN_THRESHOLD})."
            ),
        )

    if request.consecutive_failed_reps >= CONSECUTIVE_FAILED_REPS_TO_ESCALATE:
        return SafetyDecision(
            allowed=False,
            blocked=True,
            risk_level="high",
            reason=(
                f"{request.consecutive_failed_reps} consecutive reps missed target form — "
                "stop and check in with a clinician before continuing."
            ),
        )

    if pain is not None and pain >= CAUTION_PAIN_THRESHOLD:
        return SafetyDecision(
            allowed=True,
            blocked=False,
            risk_level="medium",
            reason=f"Recent pain ({pain:.2f}) is in the caution range — proceed, but watch closely.",
        )

    return SafetyDecision(allowed=True, blocked=False, risk_level="low", reason="Within safe thresholds.")
