# AI Rehab Coach

Camera-guided exercise coaching, movement-linked pain tracking, and clinician reporting for home rehabilitation.

A patient performs their prescribed exercises in front of a laptop or phone camera. The system tracks their movement in real time, corrects their form as they go, records where and when pain actually occurred, adapts the program session to session, and compiles a report their physiotherapist can use.

**This is a coaching and monitoring aid, not a medical device.** It does not diagnose, prescribe, or replace a clinician. See [PRD §13](docs/PRD.md#13-regulatory-posture).

---

## Status

**M0 + M1 built — the 15-feature MVP runs end to end.** A patient can pick an exercise, get camera setup coaching, do a coached set with live rep counting and corrective cues, bookmark a painful rep, and see a summary — all local-only. Read [`docs/STATUS.md`](docs/STATUS.md) for exactly what's verified vs. still needs a human with real hardware (short version: nobody has pointed a real camera at it yet, and no physiotherapist has reviewed the three exercises).

### Run it

```bash
pnpm install
pnpm --filter @ai-rehab/patient run dev
```

Open the printed URL in a browser with a camera. Everything runs client-side — no server, no account, nothing leaves the device.

```bash
pnpm run ci      # boundaries, build, typecheck, lint, test, eval — what CI runs
pnpm run eval    # just the I2 fixture replay report
```

---

## Documentation

Start with **[`CLAUDE.md`](CLAUDE.md)** if you are an agent, or **[`docs/STATUS.md`](docs/STATUS.md)** if you are a human catching up.

| Document | What's in it |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Where we are, what's next, what's blocked. **Working memory — read first.** |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements v2.0. 61 features, personas, metrics, architecture, regulatory posture. |
| [`docs/FEATURES.md`](docs/FEATURES.md) | The 61-feature catalogue with effort, dependencies, and MVP selection. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | M0–M6 with exit criteria and the workstream split. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, package boundaries, the two-loop model, testing strategy. |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Every type crossing a package boundary. Written before the code that uses it. |
| [`docs/UPSTREAM.md`](docs/UPSTREAM.md) | OpenRehabAgent integration, datasets, licence obligations. |
| [`docs/MVP-BUILD-PROMPT.md`](docs/MVP-BUILD-PROMPT.md) | Self-contained handoff prompt for building M0 + M1. |
| [`docs/adr/`](docs/adr/) | Architecture decision records. Why things are the way they are. |
| [`docs/source/`](docs/source/) | The original v1.0 PRD, preserved unchanged. |

---

## Repository layout

```
packages/
  contracts/   Shared types + Zod schemas. Depends on nothing. Everything else depends on this.
  core/        The fast loop: pose smoothing, joint angles, rep segmentation,
               form scoring, cue selection, the safety gate. Pure TypeScript —
               no DOM, no network, no I/O (enforced by scripts/lint-boundaries.mjs).
  exercises/   The exercise DSL (A6) — three ExerciseSpecs as data, plus a validator.
  eval/        I2 — the fixture replay harness. `pnpm eval` runs it.
apps/
  patient/     The React app. src/worker/ runs MediaPipe + the whole core
               pipeline in a Web Worker; src/screens/ is the patient-facing
               flow; src/lib/db.ts is the local IndexedDB event log (G1).
docs/          Product, architecture, contracts, ADRs. Read CLAUDE.md first.
design/        UX spec + Figma-exported screen artboards.
```

Each package's `package.json` `description` field says what it owns in one line — worth skimming before adding a file to make sure it's going in the right place.

---

## The idea in one diagram

```
  ON DEVICE — fast loop, ≤33ms/frame, deterministic, no network
  ┌──────────────────────────────────────────────────────────┐
  │  camera ─▶ pose ─▶ joint angles ─▶ rep segmentation       │
  │                          │              │                 │
  │                    safety gate    form scoring ─▶ live cue │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
                  append-only session event log
                             │   landmark-derived features only, never video
                             ▼
  SERVER — slow loop, 0.5–4s, between sets and sessions
  ┌──────────────────────────────────────────────────────────┐
  │  pain inference ─▶ supervisor ─▶ progression policy       │
  │  conversation ─▶ explanations ─▶ clinician report         │
  └──────────────────────────────────────────────────────────┘
```

The split is the whole design. A model call in the per-frame path would make corrective coaching arrive seconds after the rep it was about. Keeping the loops apart is what lets the fast one be tested to a clinical standard while the slow one stays free to be conversational.

---

## Built on

- **[OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent)** (MIT) — the slow loop this project will build on: pain localisation, session supervision, progression policy, feedback tracking. Planned integration, not yet vendored — the MVP has no server or slow loop (B1/D1/D2/E5 are fast-follow, not MVP scope). See `docs/UPSTREAM.md`.
- **[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)** (Apache-2.0) — on-device pose landmarking. In active use, via `@mediapipe/tasks-vision` — see `NOTICE`.
- **[UI-PRMD](https://webpages.uidaho.edu/ui-prmd/)** and **[KIMORE](https://vrai.dii.univpm.it/content/kimore-dataset)** — rehabilitation movement datasets with correct/incorrect pairs and clinician-scored quality, seeding the evaluation fixture library.

Full attribution and licence obligations in [`docs/UPSTREAM.md`](docs/UPSTREAM.md).

---

## Contributing

Read [`CLAUDE.md`](CLAUDE.md). It applies to humans too.

The short version: branch per feature ID, keep `packages/core` pure, a new safety rule needs a fixture, and update `docs/STATUS.md` before you stop.

---

## Licence

MIT — see [`LICENSE`](LICENSE). Uses MediaPipe (Apache-2.0, see [`NOTICE`](NOTICE)); plans to incorporate OpenRehabAgent (also MIT) once the slow loop is built.
