# AI Rehab Coach

Camera-guided exercise coaching, movement-linked pain tracking, and clinician reporting for home rehabilitation.

A patient performs their prescribed exercises in front of a laptop or phone camera. The system tracks their movement in real time, corrects their form as they go, records where and when pain actually occurred, adapts the program session to session, and compiles a report their physiotherapist can use.

**This is a coaching and monitoring aid, not a medical device.** It does not diagnose, prescribe, or replace a clinician. See [PRD §13](docs/PRD.md#13-regulatory-posture).

---

## Status

**Pre-M0 — planning complete, no code yet.** Read [`docs/STATUS.md`](docs/STATUS.md) for the current position and next actions.

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

- **[OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent)** (MIT) — the slow loop. Pain localisation, session supervision, progression policy, feedback tracking. Vendored and extended.
- **[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)** (Apache-2.0) — on-device pose landmarking.
- **[UI-PRMD](https://webpages.uidaho.edu/ui-prmd/)** and **[KIMORE](https://vrai.dii.univpm.it/content/kimore-dataset)** — rehabilitation movement datasets with correct/incorrect pairs and clinician-scored quality, seeding the evaluation fixture library.

Full attribution and licence obligations in [`docs/UPSTREAM.md`](docs/UPSTREAM.md).

---

## Contributing

Read [`CLAUDE.md`](CLAUDE.md). It applies to humans too.

The short version: branch per feature ID, keep `packages/core` pure, a new safety rule needs a fixture, and update `docs/STATUS.md` before you stop.

---

## Licence

MIT — see [`LICENSE`](LICENSE). Incorporates OpenRehabAgent, also MIT.
