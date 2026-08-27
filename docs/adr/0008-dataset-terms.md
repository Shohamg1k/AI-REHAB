# ADR-0008 — Academic dataset terms for commercial CI use

**Status:** OPEN · Raised 2026-08-27

## Context

The evaluation harness (I2) is what makes form scoring iterable — without a fixture library, every scoring change is a guess. The two best available seeds are academic datasets:

- **UI-PRMD** — 10 rehab movements with correct *and intentionally incorrect* performances, plus a Vicon ground truth track.
- **KIMORE** — 5 exercises with clinician-assigned quality scores 0–50, across healthy, stroke, Parkinson's, and low-back-pain groups.

Both carry academic-use terms rather than open licences.

## The question

Do those terms permit use in a commercial product's CI pipeline, and do they permit committing *derived* landmark fixtures — not raw data — to a repository?

## Interim position

- `fixtures/raw/` is gitignored. No raw dataset files are committed under any circumstance.
- Derived fixtures are not committed until the terms have been read.
- Our own recordings, made with consent, are unencumbered and can seed the harness meanwhile — including the deliberately bad ones (dim room, camera on the floor, patient half out of frame), which the academic datasets do not provide anyway.

## What's needed

Someone reads both sets of terms before M1 ends. If they do not permit commercial CI use, the fallback is a purpose-recorded fixture library with consenting volunteers — slower, but unencumbered and arguably better matched to real home conditions than lab captures are.
