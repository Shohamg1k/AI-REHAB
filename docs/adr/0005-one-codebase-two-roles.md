# ADR-0005 — One codebase for patient and clinician through M5

**Status:** Accepted · 2026-08-27

## Context

The patient app and the clinician dashboard have different users, different devices, and different interaction models. The obvious instinct is two applications.

## Decision

One React codebase with role-gated routes through M5. Split only when it earns it.

## Consequences

- One auth flow, one design system, one build pipeline, one deploy. For a team of two to four, this is the difference between shipping M5 and not.
- Bundle size grows for both audiences; clinician code ships to patient devices. Mitigated by route-level code splitting.
- The split, when it comes, is a mechanical extraction rather than a rewrite, because the shared types already live in `packages/contracts`.

## Revisit at the end of M5

If the clinician surface has its own release cadence, its own designer, or a bundle that meaningfully slows the patient app, extract it.
