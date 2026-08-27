# ADR-0007 — Pose model tier and device floor

**Status:** OPEN — settled by the M0 spike · Raised 2026-08-27

## Context

MediaPipe `PoseLandmarker` ships in three tiers: `lite`, `full`, and `heavy`. Accuracy and cost rise together. The fast loop's entire 33ms budget is effectively the model — everything downstream of it is single-digit microseconds of arithmetic (see ARCHITECTURE.md §4).

The choice is therefore a straight trade between landmark accuracy and the device floor we can support.

## What's needed

The M0 spike: measure fps and landmark jitter for each tier on a mid-range laptop, a three-year-old Android phone, and an iPhone, in good light and in a dim room.

## Decision criteria

- ≥24fps on the worst device we intend to support, at the chosen tier.
- Jitter low enough that One Euro smoothing produces stable rep boundaries. This, not raw landmark accuracy, is what breaks rep counting.

## If it fails

If no tier clears the bar in the browser, the mobile shell (I3) moves from Q2 to now, and the web app becomes the clinician surface plus a demo rather than the primary patient experience. That is a significant plan change and needs to surface in week 1, not at M1's end.
