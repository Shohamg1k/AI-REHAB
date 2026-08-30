# Status

**Last updated:** 2026-08-29
**Milestone:** M0 + M1 built. The 15-feature MVP runs end to end. A follow-up branch (`feature/camera-framing-and-ui-improvements`, PR open) reworks the camera experience — see "In review" below.
**Phase:** implementation complete for the confirmed MVP scope; real-device validation and clinical sign-off are the two things still genuinely open, both flagged below rather than guessed at.

---

## Where we are

Everything in [`MVP-BUILD-PROMPT.md`](MVP-BUILD-PROMPT.md)'s 15-feature scope is implemented, tested, and wired together in one working app. A patient can open `apps/patient`, pick one of three exercises, go through camera setup, do a coached set with live rep counting and corrective cues, bookmark a painful rep, report pain, and see a summary — all local-only, all logged to an append-only IndexedDB event log.

**What shipped, package by package:**

| Package | What's in it | Tests |
|---|---|---|
| `packages/contracts` | Every type in `CONTRACTS.md` as TypeScript + Zod | 8 |
| `packages/core` | A1 pose smoothing/angles/capture-quality, A4 rep FSM, A2 form scoring, A3 cue selection, E1 safety gate (a dependency leaf, per ARCHITECTURE.md §3) | 42 |
| `packages/exercises` | A6 — three provisional `ExerciseSpec`s + a cross-field validator | 8 |
| `packages/eval` | I2 — synthetic fixture generation (exact geometric construction, not approximation) + replay harness + safety-rule coverage checker | 9 |
| `apps/patient` | The UI: welcome, exercise picker, camera setup, live session, pain check-in, summary. Pose worker running MediaPipe + the full core pipeline every frame. G1 event log. | 3 (+ 11 fixtures via `pnpm eval`) |

**70 unit/component tests + 11 fixture replays, all passing.** Full CI pipeline (`pnpm run ci`: boundaries → build → typecheck → lint → test → eval) verified green from a clean checkout (`rm -rf packages/*/dist apps/patient/dist`).

**Run it:** `pnpm install && pnpm --filter @ai-rehab/patient run dev` (or `pnpm run dev:patient` from root), then open the printed localhost URL in a browser with a camera. See [`README.md`](../README.md).

## In review — camera framing + live preview (PR open, not merged)

Branch `feature/camera-framing-and-ui-improvements`, developed in a separate
git worktree. **Not merged — awaiting teammate review.**

Three real defects found and fixed:

1. **MediaPipe never loaded at all.** Two stacked bugs: the WASM CDN URL was
   pinned to 0.10.17 while the installed package was 0.10.35, and
   `FilesetResolver.forVisionTasks` was called without `useModule: true`, so
   MediaPipe fell back to `importScripts()` — unsupported in the ES module
   workers Vite always emits. Surfaced as an opaque "ModuleFactory not set".
   See [mediapipe#5257](https://github.com/google-ai-edge/mediapipe/issues/5257).
2. **The patient could not see themselves.** The `<video>` element was
   deliberately kept offscreen and only a skeleton was drawn, so there was no
   way to tell whether you were in frame. The camera is now visible with the
   skeleton as an overlay — the raw stream still never leaves the device.
3. **Framing demanded the whole body for every exercise.** Capture quality
   scored a bounding box over all 33 landmarks and required 70% of them
   visible, so correct upper-body-only framing failed. Framing is now driven
   by `ExerciseSpec.setup.requiredLandmarks`; irrelevant landmarks cannot
   fail it.

A fourth, subtler modelling bug fell out of the new validator:
`setup.requiredJoints` was being used for two different jobs — "joints this
exercise measures" and "landmarks the camera must see". Shoulder abduction
listed `right_hip` only because the shoulder *angle* is computed from the hip
*landmark*, which then dragged the knee into the framing requirement. The two
concerns are now separate fields.

Also added on the same branch (informed by a review of four reference
projects — see [`REFERENCE-ANALYSIS.md`](REFERENCE-ANALYSIS.md)):

4. **Reps are scored as trajectories, not poses.** `packages/core/reps/temporal.ts`
   computes range, velocity dispersion (smoothness), phase balance and trunk
   stability per rep, exposed as new `FormCriterion.measure` values so
   exercises opt in as data. Closed-form arithmetic, no model in the
   per-frame path — ADR-0001 holds.
5. **A scoring-dilution bug the new criteria exposed.** Adding secondary
   criteria let a rep that missed its primary target by 25 deg still score 68.
   Liao/Vakanski published the same compression (incorrect reps at 0.7-0.9).
   Fixed by weighting the criterion that *is* the exercise above the rest,
   and by replacing the `score <= 50` cutoff feeding the safety gate with
   `isFailedRep()` — "did any criterion fail outright", which is both truer
   and explainable.
6. **Session summary shows the set as a shape** — consistency, range trend
   sparkline, best rep, and the criterion that fell short most often.

Still unverified: **live pose tracking with a real camera.** This environment
has no camera, so the fixed MediaPipe load path, the video preview, and
framing against a real body have not been observed working. That remains the
first thing to check.

---

## What's genuinely verified vs. what isn't

Be precise about this — it's the difference between "built" and "trustworthy."

**Verified:**
- Every package's unit tests pass, including the safety gate's four-verdict-tier behavior and the rep segmenter's double-count guard.
- The eval harness's 11 fixtures replay through the *real* `packages/core` pipeline (not a mock) and every configured veto-tier safety rule fires at least once — mechanically enforced by `packages/eval/src/coverage.ts`, not just asserted in a commit message.
- The full app was run in a real browser (this session's sandboxed Browser tool): Welcome → exercise picker → camera setup all render correctly with zero console errors, and camera-permission denial is handled as the designed "we need your camera" state, not a crash.
- `pnpm run ci` passes end to end from a clean checkout, including in the order GitHub Actions will actually run it.

**Not verified — needs a human with real hardware:**
- **Live pose detection itself.** This sandbox has no camera. The MediaPipe worker code is written, typechecks, and bundles (205KB chunk, builds cleanly), but nobody has watched a real skeleton track a real body yet. This is the single most important thing to check first.
- **The M0 spike** (ADR-0007): fps and landmark jitter on a mid-range laptop, an older Android phone, and an iPhone, in good and poor light. Shipped `pose_landmarker_lite` as the safest default tier, but that's a guess informed by "cheapest tier," not a measurement. If it doesn't clear ~24fps on the worst device, the tier needs to change or the plan does (see ADR-0007's original contingency).
- **Whether the three exercises' rep-phase thresholds and target ranges actually feel right against a real body.** They're internally consistent (every fixture passes, the geometry is exact) but were tuned against synthetic trajectories, not a recorded human. Expect to retune after the first real session.

## Decisions made without a human, per the build prompt's own stated fallback

- **The three M1 exercises.** No physiotherapist was available (still true — see Blocked). Per `MVP-BUILD-PROMPT.md` §7, proceeded with the roadmap's suggested three — seated knee extension, standing shoulder abduction, sit-to-stand — using placeholder joint-angle ranges grounded in standard ROM references, cross-checked for plausibility (not copied) against a working MediaPipe rehab prototype ([RehabAR](https://github.com/Apoorva-Nayak07/RehabAR)). Every spec ships `provisional: true` with a `provisionalNote`, and the UI surfaces it (camera setup card, "why this exercise" card) — never presented as clinically validated. **Still needs a physiotherapist's sign-off before a real patient uses it.**
- **Pose model tier (ADR-0007).** No physical device to benchmark. Shipped `pose_landmarker_lite`, documented as an interim placeholder in the ADR, not a spike result.
- **MVP scope confirmation.** `docs/FEATURES.md`'s Pick column was empty (scope selection was step 1 of "Next actions"). Filled it in exactly per the doc's own "Recommended MVP" section — no features added or cut beyond what was already recommended there.

## What the upstream repos the user pointed to actually contributed

Per the request to draw on [STGCN-rehab](https://github.com/fokhruli/STGCN-rehab), [avakanski's rehab framework](https://github.com/avakanski/A-Deep-Learning-Framework-for-Assessing-Physical-Rehabilitation-Exercises), [RehabAR](https://github.com/Apoorva-Nayak07/RehabAR), and OpenRehabAgent: the first two are offline deep-learning *quality-score regressors* trained on UI-PRMD/KIMORE (TensorFlow/Keras, batch evaluation, no real-time path) — valuable as a future I2 benchmark (already noted in `UPSTREAM.md` §3) but structurally incompatible with ADR-0001 (no model call in the per-frame path) as a live scoring engine, so nothing was vendored from them into the fast loop. RehabAR is closest in shape to this product (browser MediaPipe, 3 exercises, voice feedback); its `pose_server.py` angle thresholds were a sanity check on the provisional ranges above, not a source of code. OpenRehabAgent remains correctly out of scope for the MVP per `FEATURES.md` (B1/D1/D2/E5 are all fast-follow) — nothing vendored yet; that work starts at M2/M3.

## A real bug the eval harness caught, worth knowing about

`packages/core/src/pose/landmarkAdapter.ts`'s joint-angle convention (the interior angle between two rays from a vertex) is **mathematically bounded to 0–180°** — it cannot represent "past straight" hyperextension. Two of the original exercise specs configured a `maxAngle` safety threshold *above* 180° for knee/hip, which is unreachable, dead configuration — caught only by empirically running the eval harness and seeing a fixture fail in a way hand-checking the math missed. Removed those thresholds (see the specs' inline comments); true hyperextension detection needs a signed-angle or velocity-based approach this MVP doesn't build. Worth remembering before configuring a `maxAngle` on any future knee/hip/elbow exercise.

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups, two-loop architecture, regulatory posture |
| `docs/FEATURES.md` | Scope confirmed — Pick column filled in (15 IN, 46 OUT) |
| `docs/ARCHITECTURE.md` | Stack, package boundaries, testing strategy |
| `docs/CONTRACTS.md` | Every shared type — implemented, not just specified |
| `docs/UPSTREAM.md` | OpenRehabAgent integration plan + datasets + licence obligations (not yet vendored — M2/M3 work) |
| `docs/ROADMAP.md` | M0–M6, exit criteria, workstream split |
| `docs/MVP-BUILD-PROMPT.md` | The prompt this session executed, close to verbatim |
| `NOTICE` | MediaPipe (Apache-2.0) attribution — added when `@mediapipe/tasks-vision` was added as a real dependency |
| `CLAUDE.md` | Agent working agreement |
| `packages/{contracts,core,exercises,eval}`, `apps/patient` | Code. See the table above. |

## Next actions

In order.

1. **Run it with a real camera.** Nothing else on this list matters until someone confirms the skeleton actually tracks a body and reps actually count. This is the single highest-value next step.
2. **Run the M0 device spike for real** (ADR-0007) — a mid-range laptop, an older Android phone, an iPhone, good and poor light. Confirms or changes the `pose_landmarker_lite` choice.
3. **Get a physiotherapist to review the three `ExerciseSpec`s** — reference ranges, phase thresholds, safety limits. Everything is marked `provisional` specifically so this review has something concrete to react to rather than a blank page.
4. **Retune against a real recorded session** once 1–3 are done — the rep-phase thresholds and target ranges were tuned against synthetic trajectories; expect them to need adjustment.
5. **Answer the regulatory posture question** (ADR-0006) — doesn't block anything else in the MVP (local-only, no server), but blocks M2's first database migration.
6. Once 1–4 are resolved, M2 (the data spine) is next per `ROADMAP.md` — but don't start it before someone has actually used M1.

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | M2 database migration, any production deployment | A jurisdiction-specific answer. Founder decision + possibly counsel. |
| Physiotherapist sign-off on the three `ExerciseSpec`s | Trusting the scores this MVP already produces | A physiotherapist. Everything needed for the review is already written — see Next action 3. |
| Real-device fps/jitter measurement | Confidence in the `lite` tier choice; ADR-0007 closing | Physical hardware — a laptop, an Android phone, an iPhone. |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. Start the conversation now; needed by week 8 of a from-scratch timeline. |
| Academic dataset terms (ADR-0008) | Using UI-PRMD/KIMORE as real (not synthetic) I2 fixtures | Read the terms. Determines whether they can seed a commercial product's CI. |

## Open decisions

See `docs/adr/`. ADR-0006 and 0008 are open. ADR-0007 has an interim default shipped (see its file) but is still open pending real measurement. 0001–0005 are accepted.

## Recently decided

- **Executed the MVP build in one session rather than staging scope confirmation as a separate step.** The build prompt already specified exactly what to do if the physiotherapist/exercise-choice blocker was still open when building started (`MVP-BUILD-PROMPT.md` §7: use plausible placeholder ranges, mark `provisional: true`, surface it in the UI) — so scope confirmation and M0+M1 build happened together instead of waiting on a human decision the doc had already anticipated.
- **Build on OpenRehabAgent** (MIT, Python) as the slow loop rather than reimplementing pain inference, session supervision, and progression — deferred to M2/M3, not started yet. → ADR-0003, `docs/UPSTREAM.md`
- **Two-loop split.** Fast deterministic TypeScript in the browser; slow generative Python + Claude on the server. No model call in the per-frame path. → ADR-0001
- **Deterministic progression before a learned policy.** → ADR-0004 (not yet built — D1/D2 are fast-follow)
- **Pain inference generates questions, not verdicts** (feature B6). B1 (inference) is not built in the MVP; B2/B5 (self-report + bookmarking) are, and are the whole pain-data story until B1 exists.
- **Fixtures store `world` (metric) landmarks only, not the full `PoseFrame`.** Sufficient to drive reps/form/safety, which is what I2's stated purpose covers; capture-quality already has direct unit coverage. See `packages/eval/src/fixture.ts`.

## Known risks being carried

- **The M0 spike hasn't actually run.** The browser-first bet is unconfirmed on real hardware. If `lite` can't clear ~24fps on the device floor, ADR-0007's original contingency applies: the mobile shell (I3) moves from Q2 to now.
- **Every exercise spec is provisional.** Scores this MVP produces are internally consistent but not clinically validated. Do not let this run in front of a real patient without the sign-off in Next action 3.
- **The joint-angle convention can't represent hyperextension** (see "A real bug the eval harness caught" above). Any future exercise needing that safety check needs a different approach, not just a `maxAngle` above 180.
- Upstream OpenRehabAgent's pain-localisation weights are invented, not fitted, and B1 isn't built yet regardless — re-weighting against KIMORE is B1's problem to solve when it's built, not before.
- The exercise catalogues in `UPSTREAM.md` §4 provide metadata but no reference ranges. Library size is still gated by physiotherapist time, not engineering — building more `ExerciseSpec`s is cheap; validating them is not.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
