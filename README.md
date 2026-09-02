# AI Rehab Coach

**Camera-guided exercise coaching, movement-linked pain tracking, and clinician reporting for home rehabilitation.**

A patient does their prescribed exercises in front of a laptop, tablet or phone camera. The app tracks their movement at 24fps, counts reps, scores form against per-exercise criteria, speaks corrections in their language, records where and when pain actually occurred, and compiles a daily report their physiotherapist can open, read and download.

**Pose runs entirely in the browser. Video never leaves the device** — not to a server, not to us. What gets stored are joint angles and derived scores.

> **This is a coaching and monitoring aid, not a medical device.** It does not diagnose, prescribe, or replace a clinician. See [ADR-0006](docs/adr/0006-regulatory-posture.md).

---

## Run it

### 1. The patient app — no server, no account

```bash
pnpm install
pnpm --filter @ai-rehab/patient run dev
```

Open the printed URL in a browser with a camera. `pnpm install` downloads the 30MB MediaPipe pose model once and stages it locally, so **no CDN is contacted at runtime**.

Everything works offline and anonymously: exercises, rep counting, form scoring, spoken cues, pain logging, history. The event log lives in IndexedDB.

### 2. Optional — a Hindi voice that does not depend on the device

```bash
pnpm setup:tts
```

The Web Speech API can only use voices the operating system already has, and most machines have no Hindi one. This stages a neural voice (Piper: espeak-ng compiled to WASM, plus a 60MB VITS ONNX model) into the app's own origin, so **every visitor gets Hindi regardless of their device**. About 83MB, run once on whatever serves the app.

Skip it and the app falls back to device voices and says so. The bundled voice is **CC BY-NC-SA 4.0, non-commercial only** — see [ADR-0011](docs/adr/0011-bundled-neural-tts.md).

### 3. The full stack — accounts, sync, clinician side

```bash
cp .env.example .env
docker compose up
```

Set `JWT_SECRET` in `.env`; `GROQ_API_KEY` is optional. This starts Postgres, `apps/api` (Fastify), and `services/rehab-engine` (Python/FastAPI). Point the patient app at it with `VITE_API_URL`.

Signing in is **always optional** — it enables cross-device sync, clinician sharing and the AI coach. A full session never requires it.

### Checks

```bash
pnpm run ci      # boundaries, build, typecheck, lint, test, eval
pnpm run eval    # just the fixture replay report
```

**382 tests, 15/15 safety fixtures, ~24k lines across 195 source files.**

---

## What it does

| Feature | How it works |
|---|---|
| **Live pose + rep counting** | MediaPipe heavy-tier landmarker in a Web Worker. One Euro filtering, 14 joint angles, phase-based rep segmentation. |
| **Per-rep form scoring** | Each exercise declares criteria (range, tempo, trunk position) with target bands. Every rep gets a score, a per-criterion breakdown and a confidence. Low-confidence reps are counted but **not scored** — the app says "not enough signal" rather than guessing. |
| **Spoken coaching** | Corrective cues from the exercise's own cue table, in English or Hindi, with cooldowns. Never the only channel: everything spoken is also captioned. |
| **Hands-free voice control** | Say *"start"*, *"pause"*, *"continue"*, *"I'm done"*, or *"my shoulder hurts"*. Matched against per-locale phrase tables — no model in the loop. |
| **Movement-linked pain** | "That one hurt" tags the exact rep; a spoken report also captures the body region. Severity is always the patient's own answer on a 1–5 scale, **never inferred**. |
| **Daily clinician reports** | One per day, derived on read. Per-exercise breakdown, which criterion failed and by how much, compensation patterns, range-of-motion trend, adherence, data quality. Openable, printable, downloadable as `name_date.html`. |
| **AI coach (optional)** | Ask a question after a set; Groq answers from that set's real figures under six hard rules. Refuses to diagnose, refuses to push through pain. |
| **Clinician side** | Same codebase, different role. Roster, program assignment with contraindication checks, messaging, and an audit log of every data access. |
| **Two languages** | English and Hindi across cues, captions, safety copy and settings. |
| **Built for distance** | The patient is metres from the screen. In-session type scales with the viewport: the rep counter is 140px on a desktop, the cue 35px. |

---

## Architecture

### The two-loop split — the decision everything else follows

```
ON DEVICE — fast loop — under 40ms per frame — deterministic — offline — no model calls
+------------------------------------------------------------------------+
|  camera -> MediaPipe pose -> One Euro smoothing -> 14 joint angles      |
|                                     |                                   |
|                  +------------------+------------------+                |
|                  v                  v                  v                |
|          rep segmentation     safety gate       capture quality         |
|                  |             (pure fn)         (gates scoring)        |
|                  v                                                      |
|          form scoring -> cue selection -> spoken + captioned cue         |
+-------------------------------+----------------------------------------+
                                v
                append-only session event log (IndexedDB)
                                |  joint angles and scores only, never frames
                                v  optional, only if signed in
SERVER — slow loop — between sets and sessions — may be conversational
+------------------------------------------------------------------------+
|  event sync -> projections (adherence, ROM trend, daily reports)        |
|  program assignment -> E5 contraindication supervisor (Python)          |
|  AI coach (Groq) -> non-diagnostic answers from that set's real figures  |
+------------------------------------------------------------------------+
```

**Why the split matters:** a model call inside the per-frame path would make a correction arrive seconds after the rep it was about. Keeping the loops apart lets the fast one be deterministic and testable to a clinical standard, while the slow one stays free to be conversational. This is [ADR-0001](docs/adr/0001-two-loop-split.md), and it is enforced rather than merely documented.

### Packages

```
packages/
  contracts/    Zod schemas and types. Depends on nothing. The source of
                truth for every shape crossing a boundary.
  core/         The fast loop: pose adapter, One Euro smoothing, joint
                angles, rep segmentation, form scoring, cue selection,
                safety gate. Pure TypeScript — no DOM, no network, no
                clock, no model.
  exercises/    The exercise DSL. Six ExerciseSpecs as data, a validator
                that runs at import time, and the Hindi cue catalogue.
  eval/         Fixture replay harness. Synthesises movement, replays it
                through core, asserts rep counts, scores, safety rules.
apps/
  patient/      React 18 + Vite. Web Workers for pose and TTS. IndexedDB
                event log. Optional API client. Patient and clinician UIs.
  api/          Fastify 5 + Drizzle + Postgres with row-level security.
                Auth, event sync, projections, programs, messages, audit.
services/
  rehab-engine/ Python + FastAPI. Session-level safety supervisor (E5), a
                coarser second layer above the frame-level gate.
```

### Boundaries are enforced by a build step, not by convention

`scripts/lint-boundaries.mjs` fails the build if:

1. `packages/core` imports React, DOM types, `fetch`, or anything that does I/O
2. `packages/core/safety` imports anything outside `contracts` — it is a dependency leaf
3. `apps/patient` imports `apps/api` or `services/rehab-engine`
4. Anything imports from `fixtures/raw`
5. `apps/api` depends on any workspace package other than `contracts`

> *"`packages/core` stays pure" is only true if something fails the build when it stops being true.*

### The four invariants ([CLAUDE.md](CLAUDE.md))

1. **No model call in the per-frame path.** 30fps must stay deterministic and offline.
2. **Video never leaves the device.** Persist landmark-derived features, never frames. Enforced by a source-inspection test that fails if any file outside the reviewed network client touches `fetch`.
3. **The safety layer is a pure function.** No I/O, no clock, no randomness, no model, and nothing may rewrite a verdict. *(The in-session veto is currently suspended — see Known limits.)*
4. **Every decision carries a `reason` string.** No score or block is persisted as a bare number.

---

## Testing

| Layer | What it proves |
|---|---|
| **Unit** (382 tests) | Angles, smoothing, segmentation, scoring, cue cooldowns, the safety gate, projections, auth, tenant-scoped queries. |
| **Fixture replay** (15/15) | Synthesised movement replayed through the real pipeline. Every configured safety rule fires in at least one fixture — **no fixture, no merge**. |
| **Source inspection** | Privacy (a `fetch` allowlist, no `toDataURL` / `MediaRecorder`), layout (no fixed phone-width columns, no sub-18px type in the live overlay), cue-translation coverage. |
| **Contract-typed fixtures** | Report fixtures are typed as `ProgressReport`, so a contract change fails at compile time instead of at runtime in seven tests. |

---

## Known limits — read before believing anything above

These are real, and stated deliberately.

- **No physiotherapist has reviewed any exercise.** All six specs are marked `provisional`; the reference ranges are reasoned from ordinary clinical norms, not signed off. The UI says so next to every score.
- **The in-session safety block is suspended** ([ADR-0012](docs/adr/0012-safety-block-suspended.md)). The gate fired on a *single* noisy frame against *unreviewed* thresholds, so it produced false positives — and a wrong stop teaches a patient to ignore the app. The gate still runs and still logs; it just does not interrupt, and its verdicts are kept out of the clinician's report. Reinstating it needs reviewed thresholds, a persistence window, and a fixture proving a one-frame spike does not fire.
- **Nobody has pointed a real camera at a real body.** Every pipeline number comes from synthetic fixtures or a canvas stand-in.
- **The Hindi translations have not been checked by a fluent speaker**, and the bundled Hindi voice has not been listened to by one. Both are labelled unreviewed in the app.
- **No live Postgres has tested the row-level security policies.**
- **Voice recognition sends audio to the browser vendor** (Google, in Chrome). Off by default, disclosed in plain language above the switch, and the microphone is only live during an exercise. [ADR-0010](docs/adr/0010-voice-session-control.md).

---

## Documentation

| Document | What is in it |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Where the project is, what is next, what is blocked. **Read first.** |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, boundaries, the two-loop model, testing strategy. |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Every type crossing a boundary. Written before the code using it. |
| [`docs/FEATURES.md`](docs/FEATURES.md) | 62-feature catalogue with stable IDs, effort and dependencies. |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, personas, metrics, regulatory posture. |
| [`docs/UPSTREAM.md`](docs/UPSTREAM.md) | Every dependency's licence and adopt/adapt/replace decision. |
| [`docs/adr/`](docs/adr/) | Twelve architecture decision records — why things are the way they are. |
| [`CLAUDE.md`](CLAUDE.md) | The working agreement. It applies to humans too. |

---

## Built on

- **[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)** (Apache-2.0) — on-device pose landmarking. In active use; see [`NOTICE`](NOTICE).
- **[Piper](https://github.com/rhasspy/piper)** (MIT engine) and espeak-ng compiled to WASM — the bundled neural voice. Voice models carry their own licences; see [`docs/UPSTREAM.md`](docs/UPSTREAM.md) section 7.
- **[onnxruntime-web](https://onnxruntime.ai/)** (MIT) — runs the TTS model in a worker.
- **[Groq](https://groq.com/)** — hosted inference for the between-sets coach ([ADR-0009](docs/adr/0009-llm-coaching-assistant.md)).
- **[OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent)** (MIT) — the slow-loop design this builds toward.
- **[UI-PRMD](https://webpages.uidaho.edu/ui-prmd/)** and **[KIMORE](https://vrai.dii.univpm.it/content/kimore-dataset)** — rehabilitation datasets seeding the fixture library.

Full attribution and licence obligations in [`docs/UPSTREAM.md`](docs/UPSTREAM.md).

---

## Contributing

Read [`CLAUDE.md`](CLAUDE.md). Short version: branch per feature ID, keep `packages/core` pure, a new safety rule needs a fixture, and update `docs/STATUS.md` before you stop.

## Licence

MIT — see [`LICENSE`](LICENSE). Bundled assets carry their own terms; the Hindi TTS voice is **non-commercial**.
