"""
Pydantic models for the E5 session supervisor. Mirrors the shape of
packages/contracts' SafetyThresholds/SafetyVerdict just enough for this
service's one job — this is NOT a generated client from those Zod
schemas (no such generator is wired up), so a change on either side needs
a human to keep them in sync. That coupling is accepted deliberately for
now; codegen is a fast-follow if this seam grows.
"""
from typing import Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["low", "medium", "high"]


class SuperviseRequest(BaseModel):
    exercise_id: str
    target_regions: list[str] = Field(default_factory=list)
    intensity: Literal["none", "low", "medium", "high"] = "low"
    patient_contraindicated_regions: list[str] = Field(default_factory=list)
    # 0.0-1.0, from the patient's own self-report (B2/B5) converted upstream
    # by the caller — never a value this service infers itself. See B6:
    # pain inference generates a question, never a verdict; this service
    # consumes an already-recorded self-report, it does not produce one.
    recent_pain_severity: float | None = Field(default=None, ge=0.0, le=1.0)
    consecutive_failed_reps: int = Field(default=0, ge=0)


class SafetyDecision(BaseModel):
    allowed: bool
    blocked: bool
    risk_level: RiskLevel
    reason: str
