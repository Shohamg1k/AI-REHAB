# ADR-0001 — Two-loop split

**Status:** Accepted · 2026-08-27

## Context

The product needs both sub-100ms corrective coaching during a rep and rich conversational engagement between sets. These have incompatible latency, cost, and reproducibility profiles.

## Decision

Two separate loops, never mixed.

- **Fast loop** — every frame, on-device, ≤33ms, deterministic pure functions. Pose, joint angles, rep segmentation, form scoring, real-time safety gating, cue selection.
- **Slow loop** — between sets and sessions, server-side, 0.5–4s. Pain inference, program adaptation, session supervision, narration, Q&A, explanations, reports.

No language model call may appear in the per-frame path. Cue text in the fast loop comes from the exercise spec's cue table.

## Consequences

- Corrective coaching arrives while the rep is happening, which is the entire product claim.
- Per-frame behaviour is reproducible and testable against recorded fixtures — a prerequisite for taking safety seriously.
- No per-frame inference cost.
- Two runtimes to maintain (see ADR-0003), and cue text is less flexible than generated text would be. Accepted: a cue table authored per exercise is also more reviewable by a clinician.

## Revisit if

On-device models become fast enough to run inside the frame budget *and* produce reproducible output. Reproducibility, not speed, is the binding constraint.
