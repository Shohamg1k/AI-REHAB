# ADR-0004 — Deterministic progression policy before a learned one

**Status:** Accepted · 2026-08-27 · Supersedes PRD v1.0 §5.4 "reward-modeled progression"

## Context

PRD v1.0 specified a reward-modelled RL agent for deciding whether to progress, hold, or regress an exercise. Upstream OpenRehabAgent implements exactly this as Q-learning over a discrete state string.

A learned policy needs outcome data. At launch we have none, and we will not have a meaningful amount for months. Worse, a learned policy makes progression decisions non-reproducible at exactly the moment clinicians are deciding whether to trust the system at all — and "the model decided" is not an answer a physiotherapist accepts.

## Decision

Ship a deterministic rule table over pain burden × adherence × form trend, implemented behind the interface a learned policy would satisfy. Log every `(state, action, outcome)` tuple from the first adaptive session, using upstream's state encoding format.

Keep upstream's Q-learning agent in the tree as the reference implementation of the eventual replacement.

## Consequences

- Every progression decision can be explained to a clinician as a rule with a threshold.
- The dataset a learned policy would need accumulates from day one at no extra cost.
- The rule table needs a physiotherapist to author. That is a dependency, but also a feature — it makes the policy reviewable by the person whose judgment it is standing in for.
- We may find the rules are good enough and never replace them. That is a fine outcome.

## Revisit if

Six months of outcome data exists and offline evaluation shows a learned policy beats the rule table on a metric we can defend to a clinician.
