# ADR-0007 — Pose model tier and device floor

**Status:** OPEN — interim default shipped, real measurement still pending · Raised 2026-08-27

## Interim decision (2026-08-29)

Shipped with `pose_landmarker_lite` hardcoded in `apps/patient/src/worker/poseWorker.ts` — the fastest tier, chosen as the safest default pending an actual device measurement. **This is not the M0 spike.** The agent session that built M0+M1 had no physical device access (no camera, no phone, no laptop to benchmark) and could not run it. The spike as specified below is still the open task; `lite` is a placeholder informed by "cheapest tier most likely to clear the floor," not a measurement.

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
