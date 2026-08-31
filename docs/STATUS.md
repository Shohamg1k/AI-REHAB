# Status

**Last updated:** 2026-08-31
**Milestone:** M0 + M1 + M2 merged, plus clinician UI/E5 wiring, history/consent, and the pose latency pass. This branch (`feature/design-system-v2`) adopts the approved visual design: the token system, IBM Plex, the bottom navigation the app never had, and the first screens rebuilt against their artboards.
**Phase:** the app now *looks like* the approved design rather than approximating it. Screens M1/M2/M10 are rebuilt; M3–M9 have the correct palette and type but not yet their artboard structure. Live Postgres and a *real camera with a real body* remain the two things this environment cannot verify.

---

## This branch: design system v2

The design source of truth is `figma-svg/_source/v2.html` (the artboards the SVG exports were generated from) — richer than the SVGs, because it carries the actual CSS. `docs/DESIGN-SCREENS.md` is a new, literal spec of screens M1–M10 extracted from it: every string, gap, and component variant.

**The old palette was a near-miss of the real one** — Inter instead of IBM Plex, `#0F766E` instead of `#0D6E68`, `#F6F8FB` instead of `#ECF0F1`. Close enough to look deliberate, far enough never to match. Tokens are now transcribed from the design source and named after it (`ink`/`ink-2`/`ink-3`, `teal`, `sunk`, `line`), so a screen can be checked against its artboard by reading class names instead of translating a second vocabulary in between. ~270 token usages migrated across 22 files.

**IBM Plex is self-hosted** via `@fontsource`, not linked from Google Fonts as the design source does. A product whose pitch is "your video never leaves the device" should not announce every session start to `fonts.gstatic.com`, and the app has to keep working offline and behind a proxy that blocks it — the same reasoning that already applies to the pose assets.

**Built:** `Icon` (11 inline line icons, no icon dependency), `Chip`, `Disclaimer` (the design's per-screen `.disc`), `BottomNav`, and `Button` rebuilt to the design's four variants with inset-shadow hairlines so secondary and primary buttons are the same height.

**Bottom navigation now exists** — Today / Progress / Program / Sharing, which the app simply did not have. It is deliberately hidden for the whole exercise flow (intro → camera → live → rest → summary): a way out of a running set should not sit next to the set.

**Screens rebuilt:** M1 Welcome (the three product promises, verbatim), M2 Today (program list with exactly one lifted "up next" card carrying its *why*), M3 Why this exercise (numbered technique steps, and the safety cap drawn from the exercise's *actual* thresholds rather than the artboard's named clinician), M8 Session summary (the design's 2×2 stat grid and observations list, fed by the set that was really performed), M9 Progress (seven-day streak strip from real adherence data), M10 Sharing & privacy (new screen).

**A duplication M3 exposed:** the reference-media card and the new numbered steps both render `keyPoints`, so every technique cue appeared twice. The card's existing `compact` flag now suppresses its copy on that screen.

**A duplication fixed on the way:** the data-sharing consent and access log lived at the bottom of Progress *and* now on Sharing. Progress rendered them even when signed out, showing a consent switch with nothing behind it. They now live only on Sharing, with their test coverage moved across rather than dropped.

### Where the design was deliberately not followed

Each of these is a case where reproducing the mock would have meant the app asserting something untrue:

- **The fake iOS status bar** (`9:41 · 5G ▮▮▮`) is an artboard convention for showing a phone screen. A web page drawing a counterfeit OS status bar would be lying about the time and the signal.
- **M1's hero** is a mocked camera view with a skeleton drawn on it. Shown before any camera is running, that is a picture of a result the app has not produced.
- **M2's daily check-in and streak chip** imply stored state with nowhere to go. A control that silently discards a patient's answer about their knee is worse than no control.
- **M10's caregiver and research-study consents** do not exist in this system. A consent toggle that controls nothing tells the patient their data is restricted when nothing is restricting it.
- **M10's "Download or delete everything"** has no endpoint behind it. Export and erasure are real obligations, not decoration.

All five are gaps to build, not decisions to keep — see "What's still a gap".

---

## Where we are

A patient can do a full coached session guest-first, no account. Optionally, they can sign in; a clinician can invite them, assign a program (checked against E5), and see their history; the patient can see their own history, a real ROM trend, streak milestones, and exactly who's viewed their data — and can now turn that access off.

## This branch: pose latency and accuracy

**The lag had four separate causes.** Found by reading the pipeline end to end and then measuring it in a browser, not by guessing:

1. **No backpressure — the dominant cause.** The capture loop posted a frame every 41.6ms regardless of whether the worker had finished the previous one. Inference is slower than that, so the worker's message queue grew without bound and the skeleton fell *further* behind the video the longer a session ran. It now sends a frame only when the worker is idle: lower frame rate, but pinned to the present.
2. **A ten-second freeze on the first frame.** MediaPipe compiles GPU shaders lazily on the first `detectForVideo`, *after* `createFromOptions` resolves — measured at **~10,300ms**, against ~30ms for every frame after. The app dismissed its "Loading on-device pose model…" spinner and *then* paid that cost, so the patient's first frame froze for ten seconds. One throwaway inference during startup moves it inside the loading state: **first real frame went from ~10,300ms to ~60–75ms.**
3. **A GPU→CPU stall every frame.** The A7 lighting check ran `getImageData` on every single frame to answer a question whose answer changes over seconds. Now sampled every 15th frame.
4. **The drawn skeleton was the only unsmoothed thing in the pipeline.** Raw landmarks went straight to the canvas, which reads as bad tracking. Now smoothed with a second One Euro filter tuned for lag rather than jitter — display and analysis genuinely want different trade-offs.

**A latent alignment bug, fixed.** The overlay mapped normalised landmarks onto the full canvas while the video is drawn with `object-cover`. Any camera whose aspect ratio didn't match the 4:3 stage — which `getUserMedia` constraints cannot guarantee, since they are a request, not a promise — had its video cropped but its skeleton not, landing every joint off the body. This would have looked exactly like bad tracking. The mapping now accounts for the crop, and the canvas sizes itself to its real box and device pixel ratio instead of a hardcoded 640×480.

**Accuracy changes.** Capture bumped from 480p to 720p (the landmark model works from a crop around the detected person, so a sharper source helps most in the full-body framing where 480p had least to work with). MediaPipe's presence and tracking confidences are now set explicitly at 0.65 rather than inherited from undocumented per-version defaults — a rehab patient is deliberately positioned, so a weak pose is more likely a mis-detection than the patient, and losing tracking is honestly reported while scoring a phantom pose is not.

**Model tier is now one env var.** It was hardcoded in three places that had to be hand-synced — which made comparing tiers on a real device, the thing ADR-0007 is waiting on, needlessly error-prone. Now `POSE_TIER=full pnpm setup:pose`.

## Measured, for the first time

One desktop-class Windows machine, Chrome, GPU delegate, `heavy` tier, 720p synthetic frames driven straight into the worker. **Not a real camera and not a real body** — see the gap list.

| Measure | Result |
|---|---|
| Steady-state inference, median | ~29.5 ms (~34fps of headroom against a 24fps intake cap) |
| Steady-state range | 18–46 ms, occasional 110–145 ms outliers |
| First inference, before the fix | ~10,300 ms |
| First inference, after the fix | ~60–75 ms |

`heavy` clears the ≥24fps criterion **on this class of hardware**, which is real evidence for the interim tier choice rather than the "cheapest tier most likely to clear the floor" reasoning it replaced. It says nothing yet about the phones the M0 spike actually cares about. The app now shows fps, median inference and tier on the camera setup screen, so the rest of the spike is "open the app on each device and read the number" rather than an instrumentation task.

## Earlier this session (already merged)

**Clinician UI + E5 wiring**, then **history/consent/tests**, all four items from that branch's gap list:

- **`PatientDetailScreen` and `ClinicianApp` now have component tests** (7 and 3 tests respectively) — the previous branch shipped them verified only by one manual browser walkthrough. That gap is closed: both are now regression-tested the same way `RosterScreen` and `HistoryScreen` already were.
- **G2's ROM trend is real**, not a placeholder. `computeRomTrend` (`apps/api/src/projections.ts`) is a genuine time series — one point per session, that session's best peak angle per (exercise, joint) — unlike `BaselineEntry`, which only ever kept a single first-ever reference point. `HistoryScreen` renders it as an inline SVG sparkline per joint with a "+N° since first session" delta. No charting dependency added.
- **H1/H2 milestones exist**: first session, 3/7/30-day streaks, 10/25 sessions, computed client-side from data already being fetched (no new endpoint). Explicitly not persisted or exposed to `apps/api` — these are gamification, not a clinical claim, so the server has no reason to know about them.
- **G5's consent control is real, not cosmetic.** A patient can flip `dataSharingEnabled` off (`PUT /me/data-sharing`), and `GET /patients/:patientId/sessions` now actually enforces it — a clinician gets a 403, not just a UI that hides the button. Being refused does **not** write an audit-log entry (nothing was viewed), which is itself tested. Turning sharing off does not remove the patient from the roster; joining a tenant via invite is a separate, deliberate act.

**Run it:**
```
pnpm install && pnpm --filter @ai-rehab/patient run dev   # guest-first, no server
cp .env.example .env && docker compose up                  # full stack, Postgres-backed
```

## What's built and tested (178 TS/JS tests + 12 Python tests + 11 eval fixtures, all passing; `pnpm run ci` green from a clean checkout)

- **`coverMapper`** (4 tests) — the object-cover landmark mapping, including the 16:9-into-4:3 case that was silently wrong, a portrait source, and the pre-metadata fallback that must not divide by zero.
- **`computePerf`** (5 tests) — fps from intervals rather than sample count, median-not-mean so one GC pause doesn't read as a slow device, and the same-timestamp case.

- **`computeRomTrend`** — covered by a real integration test (`sync.test.ts`) that syncs two sessions with multiple reps each and asserts the trend picks each session's *best* rep, not its last or its average, and orders points by session time. `getRomTrend` added to both `MemoryStore` and `PostgresStore`, mirroring the existing `getBaseline` pattern exactly (same pure function shared by both, same "not run against live Postgres" caveat as everything else in that store).
- **`dataSharingEnabled`** — a new `boolean` on `User` (Drizzle migration `0004`), defaulting to `true`, patient-only, always `true` for a clinician. `consent.test.ts` (4 tests): default-enabled visibility, turning it off actually blocks the read (403, not just a client-side hide), turning it back on restores access, a clinician can't touch the flag (it isn't theirs), and — the one easy-to-get-wrong case — a *blocked* read does not get logged as a *view* in the patient's audit log.
- **`PatientDetailScreen.test.tsx`** (7 tests): renders history, empty state, error state, assigns a program and asserts the actual request body sent, requires at least one exercise selected, surfaces an E5 422 rejection's specific server-provided reason, and the back button. Writing this test surfaced a real UX bug: the checkbox and its exercise-name text were row siblings, not wrapped in a `<label>` — clicking the visible name did nothing, which would have surprised any clinician who tried it. Fixed in the component itself (wrapped in a proper `<label>`) rather than just worked around in the test.
- **`ClinicianApp.test.tsx`** (3 tests): renders the clinician's own name/role, selecting a patient switches to their detail screen and back returns to the roster, sign-out fires the callback.
- **`HistoryScreen`** grew from 3 to 5 tests: the two new ones cover the ROM trend delta rendering and the data-sharing toggle actually changing what's displayed after a round-trip through a mocked `PUT /me/data-sharing`.

## What's still a gap

- **Screens M4–M7 are not yet rebuilt to their artboards** (camera setup, live session, safety block, rest check-in). They pick up the new palette, type and components automatically, so the app is visually coherent, but their structure and copy still differ from the designs. `docs/DESIGN-SCREENS.md` has the literal spec for each; this is continuation work, not a blocker. M5/M6 are the most involved: the design makes them full-bleed camera screens with everything absolutely positioned, unlike every other screen.
- **M9's form-score chart and left-vs-right symmetry card are not built.** Neither a cross-session score series nor a per-side comparison is computed anywhere yet, and drawing the artboard's sample curve would show the patient a trend that is not theirs.
- **The five deliberate omissions above** (check-in, streak, caregiver/study consents, data export/erasure, camera hero) are unbuilt features, and two of them — export and erasure — are likely legal obligations rather than nice-to-haves.
- **`Program` in the bottom nav routes to Today.** There is no separate program screen yet; today's list is the program. Better than a stub, but it is not what the tab implies.
- **No screen has been compared side by side against its artboard by eye.** The rebuild followed a written spec and was verified through the DOM (computed colours, fonts, type sizes, copy) because the Browser pane in this environment renders hidden. Spacing and optical alignment need a human to look at them.
- **No frame of real video has ever gone through this pipeline.** Every measurement above used synthetic canvas frames, and the crude shapes drawn were never recognised as a person, so *landmark accuracy itself is still completely unverified* — only the plumbing and the timing around it. This remains the single highest-value unverified thing in the project.
- **The perf readout has not been seen rendering.** The Browser pane in this environment is hidden to the renderer, so `requestAnimationFrame` never fires and the capture loop cannot run; the worker was driven directly instead. The pipeline, timings and worker protocol are verified; `CameraSetupScreen`'s readout markup and the backpressure loop itself are verified only by unit tests and reading.
- **The display-smoothing constants are reasoned, not tuned.** `minCutoff: 1.7, beta: 0.9` is a defensible starting point for "prioritise lag over jitter", not a measured optimum. The instrumentation added here is what would let someone tune it against a real body.
- **720p capture is an inference from how MediaPipe works, not a measured accuracy win.** The mechanism is sound (sharper ROI crop) but nobody has compared landmark error at 480p vs 720p.
- **Milestone thresholds are arbitrary and unvalidated** — nobody with product or clinical context has confirmed 3/7/30-day streaks or 10/25 sessions are the right cadence to encourage adherence rather than discourage it after a missed day. Flagged, not decided.
- **`contraindicatedRegions` is still unverified self-/clinician-declared data** — unchanged; E5 checking it is better than checking nothing, but it is not clinical-grade contraindication management.
- **Still no live Postgres, still no real camera** — unchanged; see the M0/M2 history below. `getRomTrend` and `updateDataSharing`'s Postgres implementations follow the exact pattern already used elsewhere in `postgresStore.ts` but share that file's blanket caveat: reviewed, not run against a real database.

## M0 + M1 — merged and verified

- MediaPipe loads correctly (a version-mismatch bug and a module-worker/`useModule` bug, both fixed and verified); pose assets are served from the app's own origin, not a CDN.
- The patient can see themselves on camera; the raw stream still never leaves the device (mechanically checked by `privacy.test.ts`).
- Framing is exercise-specific, not whole-body. Reps are scored as trajectories (`packages/core/reps/temporal.ts`).
- Pose tier is `heavy`, chosen for demo accuracy over broad device support, per explicit request — see `docs/adr/0007-pose-model-tier.md`.
- **Still unverified: live pose tracking against a real camera and a real body.** This remains the single highest-value thing nobody has confirmed yet.

## M2 + the clinician-UI/E5-wiring branch — merged

- G3/G4 (auth, roles, tenancy), tenant isolation, G6 (idempotent sync), A9 (re-scoped to angle replay, never skeletons — this codebase never persists a landmark array past the pose worker, on-device or off).
- F6 program assignment: E5-checked (`rehabEngineClient.ts`, fails open if the supervisor is unreachable or unconfigured) and has UI (`PatientDetailScreen`).
- G5/F5 audit trail: has UI, and as of this branch, the consent control that actually backs it.
- G2: session list, adherence calendar, and now a real ROM trend, not just a one-time baseline.
- H1/H2: streak, calendar, and now milestones.
- **Known, documented infrastructure gap, unchanged:** no live Postgres exists in this environment to verify the RLS policies against, and `docker-compose.yml`'s Postgres role bypasses its own RLS policies by Postgres's default table-owner behaviour — the application-layer tenant scoping (which *is* fully tested) is what's actually protecting tenant isolation today. A real deployment needs a separate, non-owner runtime role.
- `apps/api/src/devMemoryServer.ts` — a `MemoryStore`-backed dev server for exercising the full stack without Docker/Postgres. `pnpm --filter @ai-rehab/api run dev:memory`. This is how the previous branch's real end-to-end browser walkthrough (clinician signup → invite → patient join → roster → assign program → patient sees it in history) was verified.

## What the upstream repos the user pointed to actually contributed

STGCN-rehab and avakanski's framework: structurally incompatible with ADR-0001 as live scoring engines (offline batch regressors) — nothing vendored; `packages/core/reps/temporal.ts` is this project's own closed-form answer to the same problem. RehabAR: a sanity check on provisional exercise ranges, not a source of code. OpenRehabAgent: E5's supervisor pattern is built and actually called — see `services/rehab-engine/UPSTREAM_DIVERGENCE.md` for exactly what carried over and what was deliberately left out (B1's pain heuristic, D1/D2's Q-learning policy).

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups |
| `docs/FEATURES.md` | M1 scope confirmed (15 IN, 46 OUT); M2+ progress tracked in this file |
| `docs/ARCHITECTURE.md` | Stack, package boundaries — 5 mechanically-enforced boundary rules |
| `docs/CONTRACTS.md` | Every shared type — `identity.ts` now also carries `dataSharingEnabled`; `sync.ts` now also carries `RomTrendPoint`/`RomTrendSeries` |
| `docs/UPSTREAM.md` | `supervisor_agent.py`'s row says "Built" with a real integration |
| `NOTICE`, `.env.example`, `CLAUDE.md` | Unchanged |
| `packages/{contracts,core,exercises,eval}`, `apps/{patient,api}`, `services/rehab-engine` | Code |

## Next actions

In order.

1. **Run it with a real camera and a real body.** Unchanged and now more pointed than ever: this branch made the pipeline measurably faster and fixed a mapping bug that would have looked like bad tracking, but *landmark accuracy itself has still never been observed*. Open the app, stand in front of it, and read the fps/latency line on the setup screen — that single act both validates the tracking and finishes most of the M0 spike.
2. **Merge this branch** once reviewed. CI-green; gaps documented above, none of them regressions.
3. **Tune the display-smoothing constants and confirm the 720p bump** against that real body — both are currently reasoned rather than measured.
4. **Get milestone thresholds and `contraindicatedRegions` verification reviewed by someone with clinical/product context** — both are engineering guesses.
5. **Set up a real Postgres role split**, **finish the M0 device spike on phones**, **get a physiotherapist's sign-off**, **answer the regulatory posture question** — see the blocked table below.
6. **The voice assistant** — still deferred per the stated sequencing; not started. (Model accuracy work has now begun, this branch being the first pass.)

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | Any production deployment carrying real patient data | A jurisdiction-specific answer. |
| Physiotherapist sign-off on the three `ExerciseSpec`s, on `contraindicatedRegions` verification, and on milestone thresholds | Trusting the scores, safety checks, and gamification this app already produces | A physiotherapist. |
| Real-device fps/jitter measurement | Confidence in the `heavy` tier choice; ADR-0007 closing | Physical hardware. |
| A live Postgres to test against | Confidence in the RLS policies' actual runtime behaviour | Docker, or a hosted Postgres instance. |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. |

## Open decisions

See `docs/adr/`. ADR-0006 and 0008 are open. ADR-0007 has an interim default (`heavy`) pending real measurement. 0001-0005 are accepted.

## Recently decided

- **Backpressure over a fixed send rate.** When inference can't keep up, dropping frames is strictly better than queueing them: a queue converts a fixed cost into an unbounded, growing one, and the patient experiences that as the overlay drifting away from their body. Frame rate is the right thing to sacrifice.
- **The pose worker stays network-free, even for a cosmetic label.** Reading the model tier from a manifest at runtime would have been the obvious implementation, and ADR-0002's mechanical guard correctly refused it. The tier is passed in as data instead. The allowlist was not widened — that guard exists precisely to make this kind of casual addition fail review.
- **Build-time config reaches the worker as a message, not a bundler constant.** Vite's two mechanisms each work in only one mode — `define` is skipped for workers in dev, and workers are bundled in a separate Rollup pass that can't see a custom virtual module in production. Both failure modes were hit and observed here. Passing the value from the main thread sidesteps the split entirely.
- **A "trend" has to actually be a time series.** `BaselineEntry` (a single first-ever point) was explicitly not reused or relabeled as a trend — `computeRomTrend` was written as new, separate logic rather than stretching an existing type to look like something it isn't.
- **Milestones are client-side only.** Thresholds are gamification, not a clinical claim, so `apps/api` was deliberately not given a new endpoint or table for them — computed from data already fetched for other reasons.
- **Being refused data does not count as viewing it.** The data-sharing enforcement in `routes/patients.ts` checks consent *before* calling `recordAccess` — a blocked attempt is not logged as a view, which would have been misleading in the patient's own audit log.
- **Turning off data sharing does not un-link the patient from their clinician's roster.** Those are two different consents (joining a tenant vs. an individual clinician reading session data) and conflating them would have been a bigger, unreviewed access-control change than this branch intended to make.

## Known risks being carried

- **The M0 spike is only part-run** — `heavy` now has real numbers on one desktop-class machine and clears the bar there, but nothing has been measured on a phone, in a dim room, or against a real body.
- **Pose accuracy is still entirely unobserved.** The pipeline has been timed, not validated. No real person has ever been tracked by this app.
- **Every exercise spec is provisional** — unchanged since M1.
- **The Postgres role in `docker-compose.yml` bypasses its own RLS policies** — do not treat the local dev setup as a security reference for a real deployment.
- **`contraindicatedRegions` is unverified self-report data** — E5 checking it is real but its inputs are not clinically validated.
- **Milestone thresholds are unvalidated guesses** — new this branch; see "Next actions."
- **The joint-angle convention can't represent hyperextension** — unchanged since M1.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
