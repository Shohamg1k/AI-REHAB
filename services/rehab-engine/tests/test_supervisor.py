"""
Every rule in supervisor.py gets a test proving it fires — the same
"no fixture, no merge" discipline packages/eval applies to E1, applied
here to E5. See CLAUDE.md §4.
"""
from app.models import SuperviseRequest
from app.supervisor import (
    CAUTION_PAIN_THRESHOLD,
    CONSECUTIVE_FAILED_REPS_TO_ESCALATE,
    STOP_PAIN_THRESHOLD,
    evaluate,
)


def make_request(**overrides) -> SuperviseRequest:
    defaults = dict(
        exercise_id="seated-knee-extension",
        target_regions=["knee"],
        intensity="low",
        patient_contraindicated_regions=[],
        recent_pain_severity=None,
        consecutive_failed_reps=0,
    )
    defaults.update(overrides)
    return SuperviseRequest(**defaults)


def test_allows_a_clean_request():
    decision = evaluate(make_request())
    assert decision.allowed is True
    assert decision.blocked is False
    assert decision.risk_level == "low"


def test_rest_is_always_allowed_even_with_every_other_red_flag():
    decision = evaluate(
        make_request(
            exercise_id="rest",
            target_regions=["knee"],
            patient_contraindicated_regions=["knee"],
            recent_pain_severity=0.99,
            consecutive_failed_reps=99,
        )
    )
    assert decision.allowed is True
    assert decision.blocked is False


def test_blocks_a_contraindicated_region():
    decision = evaluate(make_request(target_regions=["shoulder"], patient_contraindicated_regions=["shoulder"]))
    assert decision.blocked is True
    assert decision.risk_level == "high"
    assert "shoulder" in decision.reason


def test_blocks_at_the_stop_pain_threshold():
    decision = evaluate(make_request(recent_pain_severity=STOP_PAIN_THRESHOLD))
    assert decision.blocked is True
    assert decision.risk_level == "high"


def test_does_not_block_just_under_the_stop_threshold_without_other_flags():
    decision = evaluate(make_request(recent_pain_severity=STOP_PAIN_THRESHOLD - 0.2, intensity="low"))
    assert decision.blocked is False


def test_flags_caution_without_blocking_in_the_caution_band():
    decision = evaluate(make_request(recent_pain_severity=CAUTION_PAIN_THRESHOLD, intensity="low"))
    assert decision.allowed is True
    assert decision.blocked is False
    assert decision.risk_level == "medium"


def test_blocks_high_intensity_while_in_the_caution_band():
    decision = evaluate(make_request(recent_pain_severity=CAUTION_PAIN_THRESHOLD, intensity="high"))
    assert decision.blocked is True
    assert decision.risk_level == "high"


def test_allows_high_intensity_when_pain_is_below_caution():
    decision = evaluate(make_request(recent_pain_severity=CAUTION_PAIN_THRESHOLD - 0.1, intensity="high"))
    assert decision.blocked is False


def test_escalates_on_consecutive_failed_reps():
    decision = evaluate(make_request(consecutive_failed_reps=CONSECUTIVE_FAILED_REPS_TO_ESCALATE))
    assert decision.blocked is True
    assert decision.risk_level == "high"


def test_does_not_escalate_just_under_the_consecutive_fail_threshold():
    decision = evaluate(make_request(consecutive_failed_reps=CONSECUTIVE_FAILED_REPS_TO_ESCALATE - 1))
    assert decision.blocked is False


def test_contraindication_check_ignores_unrelated_regions():
    decision = evaluate(make_request(target_regions=["knee"], patient_contraindicated_regions=["shoulder"]))
    assert decision.blocked is False


def test_every_decision_carries_a_nonempty_reason():
    # CLAUDE.md invariant 4 — no verdict without a reason string, mirrored
    # from the TypeScript safety gate's own contract.
    for req in [
        make_request(),
        make_request(exercise_id="rest"),
        make_request(target_regions=["hip"], patient_contraindicated_regions=["hip"]),
        make_request(recent_pain_severity=STOP_PAIN_THRESHOLD),
        make_request(recent_pain_severity=CAUTION_PAIN_THRESHOLD),
        make_request(consecutive_failed_reps=CONSECUTIVE_FAILED_REPS_TO_ESCALATE),
    ]:
        assert len(evaluate(req).reason) > 0
