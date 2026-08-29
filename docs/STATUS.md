# Status

**Last updated:** 2026-08-29
**Milestone:** M0 → M1, in progress (building the MVP directly, single agent session)
**Phase:** scope confirmed as the recommended 15-feature MVP; `packages/contracts` implemented and merged; core engine, exercises, eval, and the patient app are being built on top of it in this same session.

---

## Where we are

MVP scope is confirmed as the recommended 15-feature set in [`FEATURES.md`](FEATURES.md#recommended-mvp--15-features), unchanged from the recommendation. [`docs/MVP-BUILD-PROMPT.md`](MVP-BUILD-PROMPT.md) is being executed close to verbatim, with two blockers resolved by its own stated fallback (see "Decisions made without a human" below) rather than left open.

`packages/contracts` is implemented — every type in [`CONTRACTS.md`](CONTRACTS.md) as TypeScript + Zod, one file per domain, barrel export, 8 passing tests. Two small additions beyond the paper spec (`ExerciseSpec.provisional`/`provisionalNote`, a concrete `CompensationRule` shape, and a `mostSevere()` helper for `SafetyVerdict`) are documented inline in CONTRACTS.md where they appear.

## Decisions made without a human, per the build prompt's own fallback

- **The three M1 exercises.** No physiotherapist was available (still true — see Blocked below). Per `MVP-BUILD-PROMPT.md` §7, proceeded with the roadmap's suggested three — seated knee extension, standing shoulder abduction, sit-to-stand — using placeholder joint-angle ranges grounded in standard ROM references and cross-checked against a working MediaPipe rehab prototype ([RehabAR](https://github.com/Apoorva-Nayak07/RehabAR)) for plausibility, not copied from it. Every spec is marked `provisional: true` with a `provisionalNote`, and the UI surfaces that badge — it is never presented as clinically validated. **This still needs a physiotherapist's sign-off before any real patient uses it.**
- **Pose model tier (ADR-0007).** Cannot physically benchmark a three-year-old Android phone or an iPhone from this environment. Shipped `pose_landmarker_lite` as the default (fastest, most likely to clear 24fps on the low end) with the tier trivially swappable, and left the spike's actual device measurement as an open task for a human running the app. See ADR-0007.

## What upstream repos actually contributed

Per the user's request to draw on [STGCN-rehab](https://github.com/fokhruli/STGCN-rehab), [avakanski's rehab framework](https://github.com/avakanski/A-Deep-Learning-Framework-for-Assessing-Physical-Rehabilitation-Exercises), [RehabAR](https://github.com/Apoorva-Nayak07/RehabAR), and OpenRehabAgent: the first two are offline deep-learning *quality-score regressors* trained on UI-PRMD/KIMORE (TensorFlow/Keras, batch evaluation, no real-time path) — valuable as the eventual I2 fixture-scoring benchmark (already noted in UPSTREAM.md §3) but incompatible with ADR-0001 (no model call in the per-frame path) as a live scoring engine, so no code was vendored from them for the fast loop. RehabAR is closest in shape to this product (browser MediaPipe, 3 exercises, voice feedback) and its `pose_server.py` angle thresholds informed the provisional ranges above as a sanity check. OpenRehabAgent remains correctly out of scope for the MVP per FEATURES.md (B1/D1/D2/E5 are all fast-follow, not MVP) — nothing from it is vendored yet.

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups, two-loop architecture, regulatory posture |
| `docs/FEATURES.md` | The selection sheet. Effort, dependencies, recommendation per feature |
| `docs/ARCHITECTURE.md` | Stack, package boundaries, testing strategy |
| `docs/CONTRACTS.md` | Every shared type, specified but not implemented |
| `docs/UPSTREAM.md` | OpenRehabAgent integration plan + datasets + licence obligations |
| `docs/ROADMAP.md` | M0–M6, exit criteria, workstream split |
| `docs/MVP-BUILD-PROMPT.md` | The handoff prompt for whoever builds M0+M1 |
| `docs/source/AI_Rehab_Coach_PRD.docx` | The original v1.0 document, preserved unchanged |
| `CLAUDE.md` | Agent working agreement |

**No code.** No `packages/`, no `apps/`, no `services/`. First commit of code is `packages/contracts`.

## Next actions

In order. The first two are not engineering.

1. **Confirm MVP scope** — mark the Pick column in `docs/FEATURES.md`, then regenerate `docs/MVP-BUILD-PROMPT.md` to match.
2. **Choose the three M1 exercises** with a physiotherapist. Suggested: seated knee extension, standing shoulder abduction, sit-to-stand — two of which appear in UI-PRMD, giving us fixtures for free.
3. **Answer the regulatory posture question** well enough to pick a database region. Does not block M1 (local-only, no server), but blocks M2.
4. **Scaffold the monorepo** and land `packages/contracts` — see `docs/CONTRACTS.md`.
5. **Run the M0 pose spike.** MediaPipe in a Web Worker, measured fps and jitter on a mid-range laptop, an older Android phone, and an iPhone, in poor lighting. This is a genuine go/no-go on browser-first.

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | M2 database migration, any production deployment | A jurisdiction-specific answer. Founder decision + possibly counsel. |
| The three M1 exercises | All of Stream A's M1 work | A physiotherapist |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. Start the conversation now; needed by week 8. |
| Academic dataset terms (ADR-0008) | I2 fixture library from UI-PRMD/KIMORE | Read the terms. Determines whether they can seed a commercial product's CI. |

## Open decisions

See `docs/adr/`. ADR-0006, 0007, and 0008 are open; 0001–0005 are accepted.

## Recently decided

- **Build on OpenRehabAgent** (MIT, Python) as the slow loop rather than reimplementing pain inference, session supervision, and progression. Its `PoseAgent.process_landmarks()` accepts external landmark arrays, which is a clean seam. Vendored, not depended on — upstream has 4 commits and won't move. → ADR-0003, `docs/UPSTREAM.md`
- **Two-loop split.** Fast deterministic TypeScript in the browser; slow generative Python + Claude on the server. No model call in the per-frame path. → ADR-0001
- **Deterministic progression before a learned policy.** Upstream's Q-learning agent is kept as the reference implementation of the eventual replacement; we ship a rule table and log `(state, action, outcome)` from day one. → ADR-0004
- **Pain inference generates questions, not verdicts** (feature B6). No ground truth exists for movement-based pain estimation; the inference's job is to make the right check-in question get asked, and the patient's answer is what gets recorded.

## Known risks being carried

- The M0 spike may show the browser can't hit the frame budget on the target device floor. Contingency: mobile shell (I3) moves from Q2 to now.
- Upstream's pain-localisation weights (`pose 0.65 / self_report 0.35`, and the per-region coefficients) are invented, not fitted. They need re-weighting against KIMORE before B1 ships — or B1 ships as a question generator only, which is the plan anyway.
- The exercise catalogues in §4 of `docs/UPSTREAM.md` provide metadata but **no reference ranges**. Every supported exercise needs a physiotherapist to author its `ExerciseSpec`. This is the real constraint on library size, not engineering.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
