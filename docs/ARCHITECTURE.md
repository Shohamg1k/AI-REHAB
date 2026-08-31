# Architecture

Companion to [PRD.md §8](PRD.md). This document covers the stack, the service boundary, and how we test. The typed seams are in [CONTRACTS.md](CONTRACTS.md); the open-source foundations are in [UPSTREAM.md](UPSTREAM.md).

---

## 1. The shape

Two runtimes, two clocks, one event log.

```
┌─ BROWSER ─────────────────────────────────────────────────┐
│  apps/patient (React + Vite)                              │
│     └── pose worker  ──▶ packages/core (pure TS)          │
│                            pose · reps · form · safety     │
│                                    │                       │
│                            packages/exercises (data)       │
│                                    │                       │
│                              IndexedDB event log ──────────┼──▶ sync
└───────────────────────────────────────────────────────────┘    │
                                                                  ▼
┌─ SERVER ──────────────────────────────────────────────────────────┐
│  apps/api (Fastify + TS)                                          │
│    · auth, tenancy, event ingest, projections                     │
│    · report renderer          · Claude proxy (guardrails, audit)  │
│                    │                                              │
│                    ▼  HTTP, internal only                         │
│  services/rehab-engine (Python + FastAPI) — vendored OpenRehabAgent│
│    · pain localisation  · session supervisor  · progression policy │
└───────────────────────────────────────────────────────────────────┘
                    │
              Postgres (append-only events + projections, RLS)
```

**Why two languages.** Not a preference — a consequence. The fast loop must run in the browser at 30fps, which means TypeScript. The slow loop is upstream OpenRehabAgent, which is Python and worth adopting rather than reimplementing (see UPSTREAM.md §1.2). The boundary between them is exactly the boundary between the two loops, so it costs us nothing we weren't already paying.

**Rule:** `apps/api` is the only thing that talks to `services/rehab-engine`. The browser never calls the Python service directly.

---

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Pose estimation | MediaPipe Tasks Vision `PoseLandmarker`, GPU delegate, Web Worker | World coordinates for real angles, per-landmark visibility for capture quality, first-party mobile SDK so I3 doesn't change the numbers |
| Core engine | Plain TypeScript, zero deps, zero DOM, zero network | The most important choice here. Testable in CI, reusable unchanged in React Native, replaceable piece by piece |
| Patient app | React + Vite + TypeScript, Tailwind | Fast dev loop; deployable as a link a clinician sends a patient |
| Clinician app | Same codebase, role-gated routes | Two apps means two auth flows and two design systems for a team of three. Split when it earns it — see ADR-0005 |
| API | Node + Fastify + TypeScript, Zod at every boundary | Shares `packages/contracts` with the frontend |
| Rehab engine | Python 3.11 + FastAPI, vendored upstream | See UPSTREAM.md |
| Database | Postgres + Drizzle, RLS, tenant-scoped from migration one | Retrofitting tenancy onto a clinical database is a rewrite |
| Local store | IndexedDB (via `idb`), event log mirrored | Makes G6 offline nearly free, and makes H7 guest sessions trivial |
| Conversation | `claude-sonnet-5` via server-side proxy, streamed | Never called from the browser. The proxy is where guardrails, rate limits, and audit logging live |
| Voice | Browser `SpeechSynthesis` + Web Speech API through M4 | Zero cost, zero latency, good enough to validate the interaction. Evaluate hosted TTS at M5 |
| Reports | Server-rendered HTML → PDF via headless Chromium | One template renders both the in-app trend view and the export |
| Telemetry | PostHog + Sentry, region-pinned | Health-adjacent data makes region a decision, not a default |

---

## 3. Package boundaries

```
packages/contracts   ← depends on nothing. Written first.
packages/core        ← depends on contracts only
packages/exercises   ← depends on contracts only (data files + a validator)
packages/eval        ← depends on core, exercises, fixtures
apps/patient         ← depends on contracts, core, exercises
apps/api             ← depends on contracts
services/rehab-engine← depends on nothing in this repo (HTTP boundary)
```

**Enforced by lint, not convention:**

1. `packages/core` may not import React, DOM types, `fetch`, or any package that performs I/O.
2. `packages/core/safety` may not import anything outside `contracts` — it is a leaf.
3. `apps/patient` may not import from `apps/api` or reach the Python service.
4. Nothing may import from `fixtures/raw`.

If a rule needs breaking, it needs an ADR.

---

## 4. The fast loop, concretely

Per frame, in a Web Worker, budget 33ms:

```
camera frame
  └─▶ PoseLandmarker.detectForVideo()          ~8–20ms depending on model tier
        └─▶ landmark smoothing (One Euro filter)      <1ms
              └─▶ joint angles + symmetry + trunk lean <1ms
                    ├─▶ rep segmentation FSM            <1ms
                    │     └─▶ on rep close: form scoring <1ms
                    │           └─▶ cue selection (cooldown-gated)
                    └─▶ realtime safety gate            <1ms
                          └─▶ verdict → may pre-empt any cue
```

Everything after the landmarker is single-digit microseconds of arithmetic. **The entire budget is the model.** That is what the M0 spike measures, and it is why model tier is the one stack choice left open. First real measurement (one desktop-class machine, `heavy` tier): ~29.5ms median — see ADR-0007.

**The capture loop applies backpressure.** The main thread sends a frame only when the worker is idle, never on a fixed interval. Posting on a timer regardless of whether the previous frame had finished let the worker's message queue grow without bound whenever inference was slower than the send interval, so the skeleton fell further behind the video the longer a session ran. Dropping frames while busy trades frame rate for staying in the present, which is the right trade for an overlay a patient is watching themselves in.

**The model is warmed up before the session reports ready.** MediaPipe compiles GPU shaders lazily on first inference, not during `createFromOptions` — measured at ~10s against ~30ms for every frame after. One throwaway inference during startup keeps that cost inside the loading state instead of freezing the patient's first frame.

**Smoothing matters more than it sounds.** Raw MediaPipe output jitters enough to produce false rep boundaries and phantom asymmetry. A One Euro filter (low latency at low speed, low lag at high speed) is the right default; a plain moving average adds lag that shows up as late cues. Display and analysis run separate filters at different settings: for the drawn skeleton, lag is what a patient notices; for joint angles, jitter is what corrupts the measurement.

---

## 5. Safety, in two places

| | E1 real-time gate | E5 session supervisor |
|---|---|---|
| Where | `packages/core/safety`, browser | `services/rehab-engine`, upstream `SupervisorAgent` |
| When | Every frame | Before each exercise is offered |
| Input | Joint angles, instability velocity, consecutive failed reps, per-exercise thresholds | Region-level pain burden, contraindications, intensity ceiling |
| Output | `block` / `downgrade` / `escalate` on the current movement | Filtered set of allowed exercises |
| Latency | Sub-frame | Seconds is fine |

Both emit `SafetyVerdict`. Both log to the event stream. **Neither can be overridden by the recommendation engine** — upstream already enforces this by construction (the RL agent only ever selects from `decision.allowed_actions`), and our E1 pre-empts cue delivery at the source.

---

## 6. Testing strategy

The thing that makes this product possible to iterate on.

**Fixture replay (I2).** A fixture is a recorded landmark stream plus expected outputs. `packages/eval` replays the whole library against the current engine and reports:

- rep-count accuracy vs ground truth
- form-score distribution shift vs the previous commit
- every safety `ruleId` that fired, and every one that did not

CI posts the diff to the pull request. **A scoring change that moves accuracy is a conversation, not a merge.**

**Fixture sources:** UI-PRMD correct/incorrect pairs, KIMORE clinician-scored samples, plus our own recordings — including deliberately bad ones (dim room, phone on the floor, patient half out of frame, a cat walking through).

**Unit tests.** `packages/core` is pure functions; test them as such. `core/safety` requires 100% branch coverage and one fixture per rule.

**Snapshot tests.** Report templates and model system prompts are snapshot-tested for the non-diagnostic framing (E4) — that is the claim most likely to erode quietly across a hundred small copy edits.

**Performance test.** A CI benchmark asserts the fast loop stays inside the frame budget on reference hardware. Regressions fail the build.

---

## 7. Data handling

- **No video, ever.** Not stored, not transmitted, not buffered beyond the frame being processed.
- **Landmarks stay local** except for a downsampled skeleton track kept for A9 replay.
- **What syncs:** `SessionEvent` records — derived scores, angles, pain reports, verdicts, decisions.
- **Tenancy:** every row carries a tenant. RLS on. No query path bypasses it.
- **Consent (G5):** sharing is per-recipient, revocable, and every access is logged where the patient can read it.
- **Retention:** to be set by the ADR on regulatory posture. Until then, nothing production-grade ships.

---

## 8. Standing decisions

Recorded as ADRs in [`adr/`](adr/). Current set:

| ADR | Decision | Status |
|---|---|---|
| 0001 | Two-loop split — no model in the per-frame path | Accepted |
| 0002 | Video never leaves the device | Accepted |
| 0003 | Vendor OpenRehabAgent rather than depend on it | Accepted |
| 0004 | Deterministic progression policy before a learned one | Accepted |
| 0005 | One codebase for patient and clinician through M5 | Accepted |
| 0006 | Regulatory posture and data residency | **Open — blocking** |
| 0007 | Pose model tier and device floor | Open — settled by M0 spike |
| 0008 | Academic dataset terms for commercial CI use | Open |

---

*Maintained document. Structural changes land here and as an ADR in the same pull request.*
