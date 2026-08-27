# ADR-0002 — Video never leaves the device

**Status:** Accepted · 2026-08-27

## Context

The product points a camera at people in their homes, often mid-rehabilitation, often partly undressed. Any architecture that transmits or stores frames carries proportionate privacy, security, and regulatory weight.

## Decision

Pose estimation runs entirely in the browser. Frames are never stored, never transmitted, and never buffered beyond the frame being processed. What persists is landmark-derived features, scores, and events. Session replay (A9) renders stored skeletons, not footage.

## Consequences

- Collapses most of the compliance surface before it exists.
- Makes the honest answer to "are you recording me?" a simple no.
- Makes offline mode (G6) nearly free, since the expensive computation is already local.
- Rules out server-side pose models and any future feature requiring frame review — including clinician video review, which some competitors offer. Accepted deliberately.
- Constrains device requirements: the client must be capable of real-time inference. See ADR-0007.

## Revisit if

A clinical partner requires video review as a condition of adoption. Even then, the answer is likely explicit per-session opt-in recording as a separate, clearly-labelled feature — not a change to this default.
