# ADR-0003 — Vendor OpenRehabAgent rather than depend on it

**Status:** Accepted · 2026-08-27

## Context

[OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent) (MIT, Python, ~1,050 LOC) implements the PRD's slow loop almost one-to-one: heuristic pain localisation, a rule-based session supervisor, a Q-learning recommender with a reward model, feedback tracking, and an explainer. It is pose-agnostic — `PoseAgent.process_landmarks()` accepts external landmark arrays — which is exactly the seam we need.

It also has 4 commits, no open issues, and reads as a stable research prototype rather than a maintained library.

## Decision

Copy the source into `services/rehab-engine/` with upstream's MIT notice retained. Record every divergence in `services/rehab-engine/UPSTREAM_DIVERGENCE.md`, updated in the same commit as the change.

Adopt the supervisor near-verbatim; adapt pain localisation and the recommender; replace the knowledge base and the template explainer.

## Consequences

- We skip writing the slow loop from scratch, and inherit a structure that already logs a reason for every decision.
- Python enters the stack alongside TypeScript. Justified because the loop boundary and the language boundary are the same line — see ADR-0001.
- We own the code: no upstream release cadence to track, no dependency risk, and no automatic upstream fixes. Given 4 commits, the last of these costs approximately nothing.
- Upstream's pain-localisation weights (`pose 0.65 / self_report 0.35`, and the per-region coefficients) are invented rather than fitted. They must be re-weighted against KIMORE before feature B1 ships.

## Revisit if

Upstream becomes actively maintained, at which point a fork with periodic merges beats a vendored copy.
