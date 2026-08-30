# Status

**Last updated:** 2026-08-31
**Milestone:** M0 + M1 + M2 merged to `main`. This branch (`feature/clinician-ui-and-e5-wiring`) closes the gap M2 shipped with: E5 is now actually called, and both sides of the backend (clinician roster/program-assignment, patient history/audit) have real UI instead of API-only endpoints.
**Phase:** the full loop — clinician invites a patient, patient joins, clinician assigns a program (checked against E5), patient's data and the audit trail are visible to them — is built and verified end-to-end against a real (in-memory) server in a real browser. Live Postgres and a real camera are still the two things this environment cannot verify.

---

## Where we are

**M0, M1, and M2 are all merged to `main`.** A patient can do a full coached session guest-first, no account. Optionally, they can sign in; a clinician can invite them, assign a program, and see their history; the patient can see their own history and exactly who has looked at their data.

**This branch adds the UI that was missing** — M2 shipped `apps/api`'s clinician/history endpoints with zero screens consuming them (API-only, curl-testable but not usable). That's fixed now:

- **E5 is wired in.** `POST /programs` calls the session supervisor for every exercise being assigned; a contraindicated one is rejected with a 422 naming which exercise and why, and the program is not partially created.
- **Clinician UI** (`apps/patient/src/clinician/`): a roster screen, invite-code generation, and a patient detail screen with session history and a program-assignment form.
- **Patient history UI** (`HistoryScreen.tsx`): synced session list, a 4-week adherence calendar, a day-streak counter, and the "who's viewed your data" access log — G2/H1/H2/G5's patient-facing half, previously API-only.

**Run it:**
```
pnpm install && pnpm --filter @ai-rehab/patient run dev   # guest-first, no server
cp .env.example .env && docker compose up                  # full stack, Postgres-backed
```

## Verified for real, in a real browser, this session

Previous sessions' UI work was verified by unit/integration tests plus manual reasoning about what a browser *would* do. This session went further where it could: `apps/api/src/devMemoryServer.ts` (a new, clearly-labelled dev-only entry point — `MemoryStore`-backed, no Postgres needed, data lost on restart) was booted alongside the patient app, and the entire loop was driven through a real browser:

1. Signed up a clinician account → routed to `ClinicianApp` (not the patient flow) — confirms the role-based app-shell branch in `App.tsx` actually works, not just typechecks.
2. Generated an invite code → **hit a real bug**: `POST /invites` sends no body, but the client always set `Content-Type: application/json`, which Fastify rejects for zero bytes ("Body cannot be empty..."). Fixed in `lib/api.ts` (only set that header when a body is actually present) and re-verified — the fix works.
3. Signed up a second account as a patient with that invite code → correctly joined the clinician's tenant, correctly routed to the patient flow (not clinician), and immediately appeared on the clinician's roster.
4. Opened the patient's `HistoryScreen` → correct empty states ("No synced sessions yet", "No clinician has viewed your data").
5. From the clinician side, opened that patient's detail screen (which itself writes a G5 audit entry on load) and assigned a program → "Program assigned." confirmed against the real E5 fail-open path (no `services/rehab-engine` process was running in this smoke test, so `REHAB_ENGINE_URL` was unset — confirms the fail-open behaviour under exactly the condition it exists for, not just in a unit test).
6. Signed back in as the patient → their `HistoryScreen` now correctly showed "Dr. Alex Rivera — view sessions — [timestamp]" from step 5. (It appeared twice — React 18 StrictMode double-invokes effects in dev; expected, not a bug, doesn't happen in a production build.)

This is the first time in this project that a multi-user flow — two separate accounts, a real invite/join cycle, one account's action becoming visible to the other — was exercised end-to-end rather than assembled from separately-tested pieces and trusted to compose.

## What's built and tested (152 TS/JS tests + 12 Python tests + 11 eval fixtures, all passing; `pnpm run ci` green from a clean checkout)

- **E5 integration** (`apps/api/src/rehabEngineClient.ts`, wired into `routes/programs.ts`): 7 new tests, all against a mocked `fetch` standing in for the Python service (its own decision logic has its own 12 tests — deliberately not duplicated). Covers: a blocked exercise rejects the whole program and nothing is partially created; contraindications are actually sent in the request; fails open (doesn't block assignment) both when unreachable and when unconfigured.
- **A new `contraindicatedRegions` field on `User`** (patient-only, self-declared via `PUT /me/contraindications`) — this is what E5 checks a program against. A real, if thin, clinical-accuracy gap: neither self- nor clinician-declaration is verified against an actual medical record. It exists so E5 has something concrete to evaluate rather than nothing.
- **Two new Drizzle migrations** (`0002`, `0003`) for the above plus snapshotting `targetRegions`/`intensity` onto `program_exercises` — the client supplies these at program-creation time since `apps/api` still may not depend on `@ai-rehab/exercises` (a new, mechanically-enforced boundary rule, `scripts/lint-boundaries.mjs` rule 5).
- **Clinician UI**: `RosterScreen` (5 tests, mocked fetch), `PatientDetailScreen` (exercised live in the browser walkthrough above, not yet unit-tested — see gaps below).
- **Patient `HistoryScreen`**: 3 tests (mocked fetch) plus the live browser walkthrough.
- **`apps/api/src/devMemoryServer.ts`**: a genuinely useful addition, not a throwaway — lets anyone exercise the full API-backed flow locally without Docker/Postgres. `pnpm --filter @ai-rehab/api run dev:memory`.

## What's still a gap — read this before calling M2/this branch "done"

- **`PatientDetailScreen` and `ClinicianApp` have no automated component tests** — only `RosterScreen` and `HistoryScreen` do. They were verified once, manually, in the browser walkthrough above; that is real but not regression-proof. Adding tests for these is the most valuable next testing task on this branch's own code.
- **G5's consent-management half is still missing.** The access log (who viewed your data) is built and UI'd; opt-in/opt-out and data-sharing controls are not.
- **H1/H2 milestones are not built.** Streak count and a 4-week calendar are; badges/milestones are not.
- **G2's ROM *trend* is still not built.** `HistoryScreen` shows sessions and adherence, not a per-joint range-of-motion chart over time — `getBaseline`/`BaselineEntry` exist server-side but nothing on the client calls or renders them yet.
- **`contraindicatedRegions` is unverified data** — self- or clinician-declared, not checked against anything. E5 checking it is better than E5 checking nothing, but this is not clinical-grade contraindication management.
- **Still no live Postgres, still no real camera** — unchanged from before this branch; see the M0/M2 history below.

## M0 + M1 — merged and verified (unchanged from before this branch)

- MediaPipe loads correctly (a version-mismatch bug and a module-worker/`useModule` bug, both fixed and verified); pose assets are served from the app's own origin, not a CDN.
- The patient can see themselves on camera; the raw stream still never leaves the device (mechanically checked by `privacy.test.ts`).
- Framing is exercise-specific, not whole-body.
- Reps are scored as trajectories (`packages/core/reps/temporal.ts`), which also caught and fixed a scoring-dilution bug.
- Pose tier is `heavy`, chosen for demo accuracy over broad device support, per explicit request — see `docs/adr/0007-pose-model-tier.md`.
- **Still unverified: live pose tracking against a real camera and a real body.** This remains the single highest-value thing nobody has confirmed yet.

## M2 — merged (auth, tenancy, sync, the data spine)

- G3/G4 (auth, roles, tenancy), tenant isolation (directly tested — two patients/clinicians in different tenants cannot see each other's data), G6 (idempotent sync), G2 session list + adherence (partial — no ROM trend, see above), A8 (re-scoped to a computed baseline), A9 (re-scoped to angle replay, never skeletons — this codebase never persists a landmark array past the pose worker, on-device or off), F6 program assignment (now E5-checked, now has UI), G5/F5 audit trail (now has UI).
- **Known, documented infrastructure gap, unchanged:** no live Postgres exists in this environment to verify the RLS policies against, and `docker-compose.yml`'s Postgres role bypasses its own RLS policies by Postgres's default table-owner behaviour — the application-layer tenant scoping (which *is* fully tested) is what's actually protecting tenant isolation today. A real deployment needs a separate, non-owner runtime role.
- Two real RLS bootstrapping bugs (invite redemption, login-by-email both need to look a row up before the caller's tenant is known) were found and fixed while *writing* the migration — see the reasoning inline in `apps/api/migrations/0001_rls.sql`.

## What the upstream repos the user pointed to actually contributed

STGCN-rehab and avakanski's framework: structurally incompatible with ADR-0001 as live scoring engines (offline batch regressors) — nothing vendored; `packages/core/reps/temporal.ts` is this project's own closed-form answer to the same problem. RehabAR: a sanity check on provisional exercise ranges, not a source of code. OpenRehabAgent: E5's supervisor *pattern* is now actually built (this session added the calling code; the decision logic itself was already built and tested) — see `services/rehab-engine/UPSTREAM_DIVERGENCE.md` for exactly what carried over and what was deliberately left out (B1's pain heuristic, D1/D2's Q-learning policy).

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups |
| `docs/FEATURES.md` | M1 scope confirmed (15 IN, 46 OUT); M2+ progress tracked in this file, not by retroactively flipping Pick cells |
| `docs/ARCHITECTURE.md` | Stack, package boundaries — now with 5 mechanically-enforced boundary rules, not 4 |
| `docs/CONTRACTS.md` | Every shared type — `identity.ts` extended with `contraindicatedRegions`, `program.ts` extended with `targetRegions`/`intensity` |
| `docs/UPSTREAM.md` | `supervisor_agent.py`'s row now says "Built" with a real integration, not just "Built (standalone)" |
| `NOTICE`, `.env.example`, `CLAUDE.md` | Unchanged |
| `packages/{contracts,core,exercises,eval}`, `apps/{patient,api}`, `services/rehab-engine` | Code. `apps/api/src/devMemoryServer.ts` is new and worth knowing about for local dev. |

## Next actions

In order.

1. **Run it with a real camera.** Still unchanged, still top priority — nothing else matters until a real skeleton tracks a real body.
2. **Merge this branch** once reviewed. CI-green; gaps documented above, none of them regressions from what M2 shipped.
3. **Add component tests for `PatientDetailScreen`/`ClinicianApp`** — the one piece of this branch's own work that's verified only manually, not by a regression-proof test.
4. **Build G5's consent UI, G2's ROM trend, and H1/H2's milestones** — the three remaining patient-facing gaps this branch didn't close. None are blocked on anything; they're scoping decisions about how much UI to build in one pass.
5. **Set up a real Postgres role split**, **run the M0 device spike**, **get a physiotherapist's sign-off**, **answer the regulatory posture question** — all unchanged from before this branch; see the ADR/blocked table below.

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | Any production deployment carrying real patient data | A jurisdiction-specific answer. |
| Physiotherapist sign-off on the three `ExerciseSpec`s, and on how `contraindicatedRegions` should actually be verified | Trusting the scores and safety checks this app already produces | A physiotherapist. |
| Real-device fps/jitter measurement | Confidence in the `heavy` tier choice; ADR-0007 closing | Physical hardware. |
| A live Postgres to test against | Confidence in the RLS policies' actual runtime behaviour | Docker, or a hosted Postgres instance. |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. |

## Open decisions

See `docs/adr/`. ADR-0006 and 0008 are open. ADR-0007 has an interim default (`heavy`) pending real measurement. 0001-0005 are accepted.

## Recently decided

- **Closed the M2 UI gap in the same session M2 merged**, rather than treating "backend exists, no UI" as acceptable for "complete the entire project" — an API only a developer can exercise isn't a finished feature for a clinician or patient user.
- **`apps/api` stays exercise-catalogue-agnostic even for E5's contraindication check** — the client (which has `@ai-rehab/exercises`) snapshots `targetRegions`/`intensity` into the program-creation request rather than the server importing the catalogue. Keeps the boundary rule real instead of carving an exception into it the first time it was inconvenient.
- **Added a MemoryStore-backed dev server** specifically to make real-browser verification possible without Docker/Postgres — paid for itself immediately by surfacing the empty-body Content-Type bug that no unit test caught.
- **Contraindications are self-/clinician-declared, not verified.** A known, stated limitation rather than a claim of clinical accuracy E5 doesn't actually have.

## Known risks being carried

- **The M0 spike still hasn't run** — unconfirmed on real hardware, more demanding now with `heavy` than `lite` was.
- **Every exercise spec is provisional** — unchanged since M1.
- **The Postgres role in `docker-compose.yml` bypasses its own RLS policies** — do not treat the local dev setup as a security reference for a real deployment.
- **`contraindicatedRegions` is unverified self-report data** — E5 checking it is real but its inputs are not clinically validated.
- **The joint-angle convention can't represent hyperextension** — unchanged since M1.
- **`PatientDetailScreen`/`ClinicianApp` have no regression tests** — a future change to either could break the one flow that was manually verified end-to-end, with nothing to catch it automatically.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
