# Status

**Last updated:** 2026-08-27
**Milestone:** pre-M0
**Phase:** planning complete, scope selection pending, no code written

---

## Where we are

The product is fully specified and the repository is documented, but **nothing has been built**. The PRD has been rewritten to v2.0 with fourteen new features, the open-source foundations are chosen, and the interface contracts are specified on paper.

The immediate gate is **MVP scope selection** — which of the 61 features in [`FEATURES.md`](FEATURES.md) are in. A recommended 15-feature MVP is on the table (FEATURES.md §Recommended MVP) but has not been confirmed.

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
