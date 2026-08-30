# Status

**Last updated:** 2026-08-30
**Milestone:** M0 + M1 shipped and merged. M2 (the data spine) built on a branch — auth, tenant-scoped Postgres, event sync, program assignment, an E5 session supervisor — pending merge.
**Phase:** M1's camera/framing rework is merged to `main` and was verified against a real MediaPipe load path (local assets, correct `useModule` flag, heavy tier). M2's application logic is integration-tested for real; its Postgres/RLS layer and the E5 service's integration into `apps/api` are the two things still genuinely open.

---

## Where we are

**M1 (the coached-session MVP) is merged to `main`.** A patient can open `apps/patient`, pick one of three exercises, see themselves on camera with exercise-specific framing guidance, do a coached set with live rep counting and corrective cues, bookmark a painful rep, report pain, and see a summary — all local-only by default, logged to an append-only IndexedDB event log.

**M2 (the data spine) exists on `feature/backend-data-spine`, not yet merged.** It adds a real, multi-tenant backend (`apps/api`, Postgres via Drizzle with row-level security), an optional account layer on top of the unchanged guest-first flow, and a Python session-safety supervisor (`services/rehab-engine`). See "M2 — the data spine" below for exactly what's built, tested, and still open.

**Run the patient app (unchanged, no server needed):**
```
pnpm install && pnpm --filter @ai-rehab/patient run dev
```

**Run the full stack (M2, once merged):**
```
cp .env.example .env   # fill in JWT_SECRET
docker compose up
```

## M1 — merged and verified

The camera/framing rework (previously tracked as an open PR in this file) merged to `main` after CI went green and the following was verified for real, not assumed:

- **MediaPipe now actually loads.** Two stacked bugs, both fixed: a WASM/JS version mismatch (`ModuleFactory not set`), and `FilesetResolver.forVisionTasks` needing `useModule: true` in an ES-module worker — [mediapipe#5257](https://github.com/google-ai-edge/mediapipe/issues/5257). The wasm runtime and pose model are now served from the app's own origin (`scripts/fetch-pose-assets.mjs`) rather than a third-party CDN, removing a real reliability failure mode (a proxy or VPN blocking jsDelivr/storage.googleapis.com took the app down with nothing but "Failed to fetch" to diagnose) and two unnecessary third-party requests per session.
- **The patient can see themselves.** The camera preview is visible with the skeleton drawn as an overlay; the raw stream still never leaves the device (`apps/patient/src/lib/privacy.test.ts` asserts this by source inspection, not by promise).
- **Framing is exercise-specific**, not whole-body. Driven by `ExerciseSpec.setup.requiredLandmarks` (a field distinct from `requiredJoints`, which the fix separated out — see the commit history on this if the distinction seems subtle, it was a real modelling bug).
- **Reps are scored as trajectories** (`packages/core/reps/temporal.ts` — range, smoothness, phase balance, trunk stability), which also exposed and fixed a scoring-dilution bug matching a pattern Liao/Vakanski published independently (incorrect reps still scoring 0.7-0.9).
- **Pose tier is now `heavy`**, not `lite` — changed at the product owner's explicit request, prioritising accuracy for a demo on known hardware over the broad device floor `lite` was hedging for. Verified loading in a real module worker (~5s cold load); sustained fps under real camera load is still unmeasured. See `docs/adr/0007-pose-model-tier.md`.

**Still unverified: live pose tracking against a real body.** This environment has no camera. The load path, the preview, and framing are all fixed and independently verified as far as this environment allows; nobody has watched a real skeleton track a real person doing a real rep. That remains the single highest-value next action.

## M2 — the data spine (branch, not yet merged)

Built per the topology already specified in `docs/ARCHITECTURE.md` — `apps/api` (Fastify + TS + Zod), Postgres + Drizzle with RLS tenant-scoped from migration one, `services/rehab-engine` (Python) for the slow-loop safety layer. Not a scope invention: this is M2 from `docs/ROADMAP.md`, built in response to an explicit request for "a full functioning scalable and multi-user usable app."

**What's built and genuinely verified** (137 TS/JS tests + 12 Python tests, all passing; full `pnpm run ci` green from a clean checkout including `apps/api`):

- **G3/G4 — auth, roles, tenancy.** Signup (standalone patient tenant-of-one, clinician tenant, or patient-via-invite-code joining a specific clinician's tenant), login, JWT. 9 tests.
- **Tenant isolation**, tested directly: two patients cannot see each other's sessions; a clinician cannot see a patient who never joined their tenant; a patient cannot read another patient's program. 4 tests specifically targeting this, on top of every route's own scoping.
- **G6 — sync**, idempotent on `(userId, sessionId, seq)`: a retried batch upserts, never duplicates. 4 tests.
- **G2 (partial) — projections.** Session list with rep count/average score (excluding low-confidence reps) and an adherence calendar, both computed from stored events on read. **Not built: a per-joint ROM *trend*** — what exists is a one-time baseline (see A8 below), not a time series.
- **A8 (re-scoped) — ROM baseline.** Computed from the first synced session's peak angles rather than a dedicated capture flow.
- **A9 (re-scoped) — session replay.** `GET /sessions/:id/events` replays the stored *angles*, not skeletons. `ROADMAP.md`'s original wording ("replay from stored skeletons") doesn't fit this codebase's stricter invariant: no landmark array is ever persisted past the pose worker, on-device or off. Worth knowing before anyone reuses that phrasing.
- **F6 (partial) — program assignment.** A clinician can assign exercises/sets/reps to a linked patient via `POST /programs`; the patient reads it via `GET /programs/mine`. **No clinician-facing UI** — this is API-only today.
- **G5 (partial) / F5 — audit trail.** Every clinician read of a patient's session list writes an entry the patient can read back via `GET /audit-log`. **No consent-management UI** (opt-in/opt-out, data-sharing controls) — only the access log half of G5 is built.
- **Not built at all: H1/H2** (streaks, calendar, milestones) — no UI, no dedicated logic, though the adherence data that would feed it already exists.
- **E5 — session supervisor**, adapted from upstream OpenRehabAgent's `supervisor_agent.py` *pattern* (not vendored code — see `services/rehab-engine/UPSTREAM_DIVERGENCE.md`). Pain thresholds, contraindicated-region matching, an intensity ceiling, an always-allow-rest fallback. 12 tests (one per rule) plus a real `TestClient` boot-and-respond check. **Not wired up** — no `apps/api` route calls it yet.
- **Patient-side (`apps/patient`).** An optional account layer strictly on top of the unchanged guest-first flow — `WelcomeScreen`'s "Sign in" link only appears when `VITE_API_URL` is configured; a full session still requires zero taps here. `lib/sync.ts` flushes unsynced sessions opportunistically (on session end and on next app load), tracked via a new IndexedDB `syncedSessions` store added through a proper versioned schema migration.
- **`apps/patient/src/lib/privacy.test.ts` updated, not weakened**, for the new sync capability: the old "no network calls at all" assertion is now "no network calls anywhere except the one reviewed sync client," plus a new test that that file's request bodies can never carry a landmark, bitmap, or pixel. 8/8 privacy tests pass. The entire pose/camera/worker pipeline remains exactly as fetch-free as it was in M1 — this is mechanically checked, not just described here.

**What's built but NOT verified against real infrastructure — read this before trusting it further:**

- **No live Postgres exists in this environment** (checked: no Docker, no local install). The Drizzle schema, the RLS policies, and the migration were reviewed carefully and the migration SQL was generated by `drizzle-kit` (not hand-written) against the schema — but never actually applied to a running database. `apps/api`'s route/auth/tenancy/sync logic *is* verified for real, via Fastify's `.inject()` against `MemoryStore` — a complete, correct second implementation of the same `Store` interface, not a stub (see its doc comment in `apps/api/src/store/types.ts`). What specifically remains unverified is the SQL itself and whether the RLS policies behave as intended against a live Postgres.
- **`docker-compose.yml`'s Postgres role bypasses its own RLS policies.** The `rehab` role owns every table it creates, and Postgres table owners always bypass RLS by default — so the policies in `migrations/0001_rls.sql` exist and run correctly during migration, but the *runtime* connection isn't actually protected by them; only the application-layer `tenantId` scoping is (which is itself fully tested — see "Tenant isolation" above). A real deployment needs a second, non-owner role for the runtime connection. Documented in the compose file and here, not silently left as a false sense of security.
- **Two RLS bootstrapping bugs were found and fixed while *writing* the migration**, before ever needing a live database to catch them: invite-code redemption and login-by-email both have to look a row up *before* the caller's tenant is known, which a blanket tenant-scoped `SELECT` policy makes structurally impossible. Both tables now have split per-command policies — see the reasoning written inline in `migrations/0001_rls.sql`.

## What's genuinely verified vs. what isn't — the short version

**Verified, for real, in this environment:**
- Every package's unit/integration tests pass — 137 TS/JS + 12 Python.
- The eval harness's 11 fixtures replay through the real `packages/core` pipeline; every configured veto-tier safety rule fires at least once, mechanically checked (`packages/eval/src/coverage.ts`).
- MediaPipe genuinely initialises from local assets in a real ES-module worker (`detectForVideo` present) — this was empirically tested, including deliberately reproducing the original bug by flipping `useModule` back to confirm the diagnosis.
- `apps/api`'s full route layer, auth flow, tenant isolation, and sync idempotency — against `MemoryStore`, via real HTTP requests through Fastify's `.inject()`.
- `services/rehab-engine`'s FastAPI layer actually boots and responds correctly (`TestClient`, not just the pure Python logic).
- `pnpm run ci` passes end to end from a clean checkout, in CI's actual step order.

**Not verified — needs a human with real hardware or infrastructure:**
- **Live pose detection against a real camera and a real body.** Top of the list, unchanged from M1.
- **The M0 device fps/jitter spike** (ADR-0007) — still not run; `heavy` tier is a deliberate choice for a demo, not a measured one.
- **Postgres/RLS in production** — see above.
- **The exercise thresholds against a real recorded human**, and a **physiotherapist's sign-off** on all three `ExerciseSpec`s — unchanged blockers from M1.

## Decisions made without a human, per stated fallbacks

- **The three M1 exercises and the pose model tier** — unchanged reasoning from the original M1 build; see `docs/adr/0007-pose-model-tier.md` for the tier's history including the M2-era switch to `heavy`.
- **Building M2 in this session at all**, rather than waiting for M1 to be used by a real person first (M1's own "Next actions" list had said so). Done because it was explicitly requested ("a full functioning scalable and multi-user usable app"), and because the architecture doc's own reasoning for building tenancy in from migration one — avoiding a retrofit rewrite — holds regardless of sequencing.
- **Not vendoring OpenRehabAgent's pain-localisation or Q-learning code for E5.** Per `docs/UPSTREAM.md`'s own pre-existing adopt/adapt/replace decision (not a new judgement call this session): only the supervisor pattern was worth adopting; B1 and D1/D2 need real data and are separately scoped milestones. See `services/rehab-engine/UPSTREAM_DIVERGENCE.md`.
- **A patient's account layer stays strictly optional.** Given H7's own rationale (a full demo before any signup form) and given ADR-0006 is still open, making an account mandatory would have both undermined an existing, deliberate UX decision and outrun the regulatory answer this project doesn't have yet.

## A real git-staging incident, worth remembering

While preparing the M2 commit, `git add -A` staged a Python virtualenv (thousands of files) despite `.venv/` matching a pattern in `.gitignore` that `git check-ignore` independently confirmed as matching. The discrepancy between the two commands was not fully root-caused. Resolved practically: unstaged it, then verified via `git diff --cached --name-only | grep -c venv` (zero) immediately before committing, rather than trusting the ignore pattern alone. Worth an explicit re-check next time a `.venv` or similar large generated directory appears near a commit on Windows in this environment.

## What the upstream repos the user pointed to actually contributed

Per the request to draw on [STGCN-rehab](https://github.com/fokhruli/STGCN-rehab), [avakanski's rehab framework](https://github.com/avakanski/A-Deep-Learning-Framework-for-Assessing-Physical-Rehabilitation-Exercises), [RehabAR](https://github.com/Apoorva-Nayak07/RehabAR), and OpenRehabAgent: the first two are offline deep-learning *quality-score regressors*, structurally incompatible with ADR-0001 as a live scoring engine — nothing vendored into the fast loop; `packages/core/reps/temporal.ts` is this project's own closed-form answer to the same problem. RehabAR's angle thresholds were a sanity check on the provisional exercise ranges, not a source of code. OpenRehabAgent's contribution is now real, not just planned: E5's supervisor pattern is adapted (not vendored) into `services/rehab-engine`, per the file-by-file decision already recorded in `docs/UPSTREAM.md` §1.2.

## A real bug the eval harness caught, still worth knowing

`packages/core/src/pose/landmarkAdapter.ts`'s joint-angle convention (interior angle between two rays) is **mathematically bounded to 0-180°** — it cannot represent "past straight" hyperextension. A `maxAngle` safety threshold above 180° for knee/hip is unreachable, dead configuration. This was already fixed in M1; still worth remembering before configuring a `maxAngle` on any future knee/hip/elbow exercise.

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups, two-loop architecture, regulatory posture |
| `docs/FEATURES.md` | M1 scope confirmed (15 IN, 46 OUT); M2's partial/complete state is tracked in this file, not by flipping Pick cells for a later milestone |
| `docs/ARCHITECTURE.md` | Stack, package boundaries, testing strategy — M2 matches the topology already specified here |
| `docs/CONTRACTS.md` | Every shared type — implemented, extended this session with `identity.ts`/`program.ts`/`sync.ts` |
| `docs/UPSTREAM.md` | OpenRehabAgent integration plan — E5's slice now actually built, see `services/rehab-engine/UPSTREAM_DIVERGENCE.md` |
| `docs/ROADMAP.md` | M0-M6, exit criteria, workstream split |
| `NOTICE` | MediaPipe (Apache-2.0) attribution |
| `.env.example` | Shape of the secrets `apps/api` and `docker-compose.yml` need — `.env` itself is gitignored |
| `CLAUDE.md` | Agent working agreement |
| `packages/{contracts,core,exercises,eval}`, `apps/patient`, `apps/api`, `services/rehab-engine` | Code. |

## Next actions

In order.

1. **Run it with a real camera.** Unchanged top priority from M1 — nothing else matters until a real skeleton tracks a real body.
2. **Merge `feature/backend-data-spine`** once reviewed — it's tested and CI-green; the open gaps (Postgres/RLS live verification, E5 integration) are documented, not blocking, the same way M1 shipped with device validation still open.
3. **Wire E5 into `apps/api`** — call `POST /supervise` before returning success from program assignment or session start. The service exists and is tested standalone; the integration point is the actual gap.
4. **Set up a real Postgres role split** before any real deployment — the runtime connection must not be the table-owning role. See the RLS section above.
5. **Run the M0 device spike for real** (ADR-0007) and **get a physiotherapist to review the three `ExerciseSpec`s** — unchanged from M1.
6. **Answer the regulatory posture question** (ADR-0006) — still doesn't block building, but blocks pointing any of this at real patient data.

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | Any production deployment carrying real patient data | A jurisdiction-specific answer. Founder decision + possibly counsel. |
| Physiotherapist sign-off on the three `ExerciseSpec`s | Trusting the scores this app already produces | A physiotherapist. |
| Real-device fps/jitter measurement | Confidence in the `heavy` tier choice for non-demo use; ADR-0007 closing | Physical hardware. |
| A live Postgres to test against | Confidence in the RLS policies' actual runtime behaviour | Docker, or a hosted Postgres instance, in an environment that has one. |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. |

## Open decisions

See `docs/adr/`. ADR-0006 and 0008 are open. ADR-0007 has an interim default (`heavy`, for demo posture) but is still open pending a real device measurement. 0001-0005 are accepted.

## Recently decided

- **Built M2 (the data spine) in response to an explicit request for a scalable, multi-user backend**, rather than treating "wait until M1 has real users" as a hard gate — see "Decisions made without a human" above.
- **Kept the account layer optional, never required.** H7's guest-first rationale still holds; ADR-0006 being open is a second, independent reason not to make an account mandatory yet.
- **Did not vendor OpenRehabAgent's pain/RL code for E5** — adapted the supervisor pattern only, per the pre-existing decision in `docs/UPSTREAM.md`, not a new call.
- **MediaPipe pose assets are served from the app's own origin, not a CDN** — a reliability fix (a blocked/intercepted CDN request took the whole app down) that's also a privacy improvement (two fewer third-party requests per session).
- **Pose tier switched from `lite` to `heavy`** for the demo posture, at explicit request, with the tradeoff (accuracy over broad device support) documented in ADR-0007 rather than silently applied.

## Known risks being carried

- **The M0 spike still hasn't run.** Unconfirmed on real hardware, now doubly so with the `heavy` tier — it demands more than `lite` did.
- **Every exercise spec is provisional** — unchanged since M1.
- **The Postgres role in `docker-compose.yml` bypasses its own RLS policies** — see above. Do not treat the local dev setup as a security reference for a real deployment.
- **E5 exists but enforces nothing yet** — no route calls it. A safety feature that's built but not wired in provides zero actual protection; don't describe M2 as having "session-level safety" until this is fixed.
- **The joint-angle convention can't represent hyperextension** — unchanged since M1.
- **The exercise catalogues in `UPSTREAM.md` §4 provide metadata but no reference ranges** — unchanged; library size is gated by physiotherapist time, not engineering.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
