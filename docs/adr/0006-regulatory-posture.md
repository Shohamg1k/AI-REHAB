# ADR-0006 — Regulatory posture and data residency

**Status:** OPEN — blocking · Raised 2026-08-27

## Context

The PRD states a "general wellness / coaching aid, not a medical device" posture (§13). That posture is currently an assertion, not a determination, and it has not been tested against any specific market.

Two questions are entangled:

1. **Device classification.** If clinicians prescribe through the product, or if it makes claims about treating a condition, it may fall under medical device regulation — FDA in the US, MDR in the EU, and equivalents elsewhere. This changes evidence requirements, timelines, and cost by an order of magnitude.
2. **Data residency and regime.** US HIPAA and EU GDPR special-category health data pull toward different hosts, different contracts (a BAA with the host and any model provider under HIPAA), different consent flows, and different retention rules.

## What it blocks

- The first production database migration (M2). Region is chosen at creation, not later.
- Consent copy (G5) and retention policy.
- Any production deployment carrying real patient data.
- Whether feature F6 — clinicians assigning programs through the product — is shippable as specified.

## What it does not block

M1. The MVP is local-only: no accounts, no server, no transmitted data. It can be built and tested with consenting volunteers while this is resolved.

## What's needed

A jurisdiction-specific answer for the first target market. Founder decision, likely with counsel. Until then: no production deployment, and no real patient data.
