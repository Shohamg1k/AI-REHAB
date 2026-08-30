# Status

**Last updated:** 2026-08-31
**Milestone:** M0 + M1 + M2 merged to `main`, plus the clinician-UI/E5-wiring branch that followed it. This branch (`feature/history-consent-and-tests`) closes out the punch list that branch left behind: component tests for the two untested clinician screens, a real G2 ROM trend, H1/H2 milestones, and G5's other half — a data-sharing toggle that actually gates clinician access, not just an access log.
**Phase:** every patient- and clinician-facing screen the backend supports now exists and is tested. Live Postgres and a real camera remain the two things this environment cannot verify — everything else that was "backend only" or "verified once by hand" at the last update now has both a UI and a regression test.

---

## Where we are

A patient can do a full coached session guest-first, no account. Optionally, they can sign in; a clinician can invite them, assign a program (checked against E5), and see their history; the patient can see their own history, a real ROM trend, streak milestones, and exactly who's viewed their data — and can now turn that access off.

**This branch's work, all four items from the previous update's "still a gap" list:**

- **`PatientDetailScreen` and `ClinicianApp` now have component tests** (7 and 3 tests respectively) — the previous branch shipped them verified only by one manual browser walkthrough. That gap is closed: both are now regression-tested the same way `RosterScreen` and `HistoryScreen` already were.
- **G2's ROM trend is real**, not a placeholder. `computeRomTrend` (`apps/api/src/projections.ts`) is a genuine time series — one point per session, that session's best peak angle per (exercise, joint) — unlike `BaselineEntry`, which only ever kept a single first-ever reference point. `HistoryScreen` renders it as an inline SVG sparkline per joint with a "+N° since first session" delta. No charting dependency added.
- **H1/H2 milestones exist**: first session, 3/7/30-day streaks, 10/25 sessions, computed client-side from data already being fetched (no new endpoint). Explicitly not persisted or exposed to `apps/api` — these are gamification, not a clinical claim, so the server has no reason to know about them.
- **G5's consent control is real, not cosmetic.** A patient can flip `dataSharingEnabled` off (`PUT /me/data-sharing`), and `GET /patients/:patientId/sessions` now actually enforces it — a clinician gets a 403, not just a UI that hides the button. Being refused does **not** write an audit-log entry (nothing was viewed), which is itself tested. Turning sharing off does not remove the patient from the roster; joining a tenant via invite is a separate, deliberate act.

**Run it:**
```
pnpm install && pnpm --filter @ai-rehab/patient run dev   # guest-first, no server
cp .env.example .env && docker compose up                  # full stack, Postgres-backed
```

## What's built and tested (169 TS/JS tests + 12 Python tests + 11 eval fixtures, all passing; `pnpm run ci` green from a clean checkout)

- **`computeRomTrend`** — covered by a real integration test (`sync.test.ts`) that syncs two sessions with multiple reps each and asserts the trend picks each session's *best* rep, not its last or its average, and orders points by session time. `getRomTrend` added to both `MemoryStore` and `PostgresStore`, mirroring the existing `getBaseline` pattern exactly (same pure function shared by both, same "not run against live Postgres" caveat as everything else in that store).
- **`dataSharingEnabled`** — a new `boolean` on `User` (Drizzle migration `0004`), defaulting to `true`, patient-only, always `true` for a clinician. `consent.test.ts` (4 tests): default-enabled visibility, turning it off actually blocks the read (403, not just a client-side hide), turning it back on restores access, a clinician can't touch the flag (it isn't theirs), and — the one easy-to-get-wrong case — a *blocked* read does not get logged as a *view* in the patient's audit log.
- **`PatientDetailScreen.test.tsx`** (7 tests): renders history, empty state, error state, assigns a program and asserts the actual request body sent, requires at least one exercise selected, surfaces an E5 422 rejection's specific server-provided reason, and the back button. Writing this test surfaced a real UX bug: the checkbox and its exercise-name text were row siblings, not wrapped in a `<label>` — clicking the visible name did nothing, which would have surprised any clinician who tried it. Fixed in the component itself (wrapped in a proper `<label>`) rather than just worked around in the test.
- **`ClinicianApp.test.tsx`** (3 tests): renders the clinician's own name/role, selecting a patient switches to their detail screen and back returns to the roster, sign-out fires the callback.
- **`HistoryScreen`** grew from 3 to 5 tests: the two new ones cover the ROM trend delta rendering and the data-sharing toggle actually changing what's displayed after a round-trip through a mocked `PUT /me/data-sharing`.

## What's still a gap

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

1. **Run it with a real camera.** Still unchanged, still top priority — nothing else matters until a real skeleton tracks a real body.
2. **Merge this branch** once reviewed. CI-green; gaps documented above, none of them regressions.
3. **Get milestone thresholds and `contraindicatedRegions` verification reviewed by someone with clinical/product context** — both are currently engineering guesses.
4. **Set up a real Postgres role split**, **run the M0 device spike**, **get a physiotherapist's sign-off**, **answer the regulatory posture question** — all unchanged; see the blocked table below.
5. **Model accuracy and the voice assistant** — explicitly deferred to a later phase per the user's own sequencing; not started.

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

- **A "trend" has to actually be a time series.** `BaselineEntry` (a single first-ever point) was explicitly not reused or relabeled as a trend — `computeRomTrend` was written as new, separate logic rather than stretching an existing type to look like something it isn't.
- **Milestones are client-side only.** Thresholds are gamification, not a clinical claim, so `apps/api` was deliberately not given a new endpoint or table for them — computed from data already fetched for other reasons.
- **Being refused data does not count as viewing it.** The data-sharing enforcement in `routes/patients.ts` checks consent *before* calling `recordAccess` — a blocked attempt is not logged as a view, which would have been misleading in the patient's own audit log.
- **Turning off data sharing does not un-link the patient from their clinician's roster.** Those are two different consents (joining a tenant vs. an individual clinician reading session data) and conflating them would have been a bigger, unreviewed access-control change than this branch intended to make.

## Known risks being carried

- **The M0 spike still hasn't run** — unconfirmed on real hardware, more demanding now with `heavy` than `lite` was.
- **Every exercise spec is provisional** — unchanged since M1.
- **The Postgres role in `docker-compose.yml` bypasses its own RLS policies** — do not treat the local dev setup as a security reference for a real deployment.
- **`contraindicatedRegions` is unverified self-report data** — E5 checking it is real but its inputs are not clinically validated.
- **Milestone thresholds are unvalidated guesses** — new this branch; see "Next actions."
- **The joint-angle convention can't represent hyperextension** — unchanged since M1.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
