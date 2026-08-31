# ADR-0007 — Pose model tier and device floor

**Status:** OPEN — `heavy` measured on one desktop-class machine and clears the bar there; the multi-device spike (phones, dim room, real camera) is still outstanding · Raised 2026-08-27

## Interim decision (2026-08-29)

Shipped with `pose_landmarker_lite` hardcoded in `apps/patient/src/worker/poseWorker.ts` — the fastest tier, chosen as the safest default pending an actual device measurement. **This is not the M0 spike.** The agent session that built M0+M1 had no physical device access (no camera, no phone, no laptop to benchmark) and could not run it. The spike as specified below is still the open task; `lite` was a placeholder informed by "cheapest tier most likely to clear the floor," not a measurement.

## Revised for demo posture (2026-08-30)

Switched to `pose_landmarker_heavy` — the most accurate tier — at the product owner's explicit request, prioritising accuracy for a hackathon demo over the broad device floor `lite` was hedging for. This is a defensible default *for that context specifically*: a demo runs on one known machine, in controlled lighting, for a few minutes, not on an unknown patient's three-year-old Android phone in a dim room. It is not a claim that `heavy` is the right production default — the M0 spike's actual question (does the worst device we intend to support clear ~24fps) is unchanged and still unanswered.

Verified (not assumed) in a real ES-module worker, served from local assets: `heavy` loads and `detectForVideo` is present, ~5s cold load on this machine's hardware — see the PR history on `feature/camera-framing-ui-research`. Per-frame inference latency and sustained fps at 24fps intake have **not** been measured; that still needs a real camera stream, which this environment cannot provide.

If the demo hardware turns out to choke on `heavy`, drop to `full` first before falling back to `lite`. Swapping tiers is now one env var rather than three hand-synced constants:

```
POSE_TIER=full pnpm setup:pose
```

## First real inference measurements (2026-08-31)

Partially answers the spike. **One machine only** — a Windows dev laptop, Chrome, WebGL/GPU delegate, `heavy` tier, 1280×720 synthetic frames driven straight into the worker. Not a real camera, not a real body, and not the range of devices the spike actually calls for. Treat as an upper bound from favourable hardware, not as the spike being done.

| Measure | Result |
|---|---|
| Steady-state inference, median | **~29.5 ms** (~34fps headroom against the 24fps intake cap) |
| Steady-state range | 18–46 ms typical, occasional ~110–145 ms outliers |
| **First inference after load** | **~10,300 ms** |
| First inference, after warm-up fix | **~60–75 ms** |

Two things follow, both acted on in the same change:

1. **`heavy` clears the ≥24fps criterion on this class of hardware**, with real margin. That is genuine evidence for the interim default rather than the "cheapest tier most likely to clear the floor" reasoning it replaced — but on one favourable device, which is exactly the machine the spike was least worried about.
2. **The first inference costs ~10 seconds**, because MediaPipe compiles GPU shaders and sets up its graph lazily, *after* `createFromOptions` resolves. The app was reporting "ready" and dismissing its loading spinner before paying that cost, so the patient's first frame froze for ten seconds — indistinguishable from the app being broken. Fixed by running one throwaway inference during startup (`warmUp` in `poseWorker.ts`), which moves the cost inside the loading state the patient is already waiting through.

The remaining spike question is unchanged and still open: **a three-year-old Android phone and an iPhone, in good light and a dim room, with a real camera and a real body.** The app now reports `fps`, median inference, and tier on the camera setup screen, so running the rest of the spike is a matter of opening the app on each device and reading the number off the screen — no instrumentation work required.

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
