# CLAUDE.md — agent working agreement

You are working on **AI Rehab Coach**: a camera-based rehabilitation coaching app that watches a patient perform prescribed exercises, corrects their form in real time, records movement-linked pain data, and reports to their clinician.

This file is the contract for how work happens here. Read it before touching anything.

---

## 1. Orient before you build

**Every session, in this order:**

1. **[`docs/STATUS.md`](docs/STATUS.md)** — where the project actually is, what's in flight, what's blocked, what to do next. Always read this first. It is the working memory.
2. **[`docs/FEATURES.md`](docs/FEATURES.md)** — the 61-feature catalogue with stable IDs. Every piece of work maps to a feature ID.
3. **[`docs/ROADMAP.md`](docs/ROADMAP.md)** — which milestone the current work belongs to and its exit criterion.

**Then, depending on what you're doing:**

| If you're... | Read |
|---|---|
| Changing product scope | [`docs/PRD.md`](docs/PRD.md) |
| Touching a package boundary or the stack | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Changing a type used across packages | [`docs/CONTRACTS.md`](docs/CONTRACTS.md) |
| Working on the Python engine or a dependency | [`docs/UPSTREAM.md`](docs/UPSTREAM.md) |
| Wondering why something is the way it is | [`docs/adr/`](docs/adr/) |

Do not infer the project state from the code alone, and do not infer it from conversation history you weren't part of. The documents are the state.

---

## 2. The four invariants

These are not style preferences. Breaking one requires an ADR and a human's agreement.

1. **No model call in the per-frame path.** `packages/core` runs at 30fps and must stay deterministic and offline. Conversation, pain inference, and adaptation live in the slow loop, between sets. See ADR-0001.
2. **Video never leaves the device.** Pose runs in the browser. Persist landmark-derived features, scores, and events — never frames, never a video file. See ADR-0002.
3. **The safety layer is a pure function with veto.** `packages/core/safety` has no I/O, no clock, no randomness, no model. Everything else may suggest; only safety may block. Nothing may soften a `block` or `escalate` verdict downstream.
4. **Every decision carries a `reason` string.** No score, block, or recommendation is persisted as a bare number.

---

## 3. Maintain the docs — this is part of the work, not after it

The docs are how the next agent picks up where you left off. **A pull request that changes behaviour without updating the docs is incomplete.**

| You changed... | Update, in the same commit |
|---|---|
| Anything at all | `docs/STATUS.md` — what happened, what's next |
| A feature's scope or status | `docs/FEATURES.md` |
| What ships in which milestone | `docs/ROADMAP.md` |
| Product scope, a new feature, a boundary | `docs/PRD.md` (source of truth — propagate outward from here) |
| A shared type | `docs/CONTRACTS.md` + the Zod schema + every consumer |
| Stack, package boundary, service topology | `docs/ARCHITECTURE.md` + a new ADR |
| Vendored upstream code | `services/rehab-engine/UPSTREAM_DIVERGENCE.md` |
| A new open-source dependency | `docs/UPSTREAM.md` — licence and adopt/adapt/replace decision, **before** the first import |

**Feature IDs are permanent.** `A1`, `B5`, `F7` and the rest are referenced from commits, issues, and every document. Add new ones at the end of their group. Never renumber.

**Ending a session:** update `docs/STATUS.md` before you stop. State what you did, what works, what doesn't, and the single next action. Write it for someone with no memory of this session — because that is who reads it.

---

## 4. Definition of done

- Types come from `packages/contracts`. Never redeclare a shared shape locally.
- New safety rule → a fixture in `packages/eval` proving it fires. **No fixture, no merge.**
- Scoring change → replay the fixture library, post the accuracy diff to the PR. A change that moves rep-count accuracy is a conversation, not a merge.
- `packages/core` stays pure — enforced by dependency lint, not by good intentions.
- Non-diagnostic framing (E4) survives the change. It is snapshot-tested for a reason.
- Cue text has a caption; spoken output is never the only channel.

---

## 5. Working style here

- **Small, feature-scoped commits.** `A4: fix rep double-count on slow eccentric` — lead with the feature ID.
- **Branch per feature ID**, e.g. `a7-camera-setup-coach`.
- **Never commit to `main` directly.** Never push without being asked.
- **Never commit dataset raw files.** `fixtures/raw/` is gitignored; UI-PRMD and KIMORE have their own terms (see `docs/UPSTREAM.md` §5).
- **No secrets in the repo.** `.env.example` documents the shape; `.env` is ignored.
- Match the surrounding code. Comment density, naming, and idiom included.

---

## 6. What this product is not

Say it in the code, in the copy, and in every report: **this is a coaching and monitoring aid, not a medical device.** It does not diagnose, does not prescribe, does not manage acute pain, and does not replace a clinician.

Concretely, when you write anything user-facing:

- Never present inferred pain as a fact. It generates a *question*; the patient's answer is what gets recorded. (Feature B6.)
- Never tell a patient to push through pain. Escalate to their clinician. (Feature E3.)
- Never imply a form score is a clinical assessment.
- If you're unsure whether copy crosses the line, it does. Flag it for human review.

---

## 7. Current blockers

Two decisions gate real work and neither is yours to make. If they're still open in `docs/STATUS.md`, build against stated assumptions and flag them — don't guess quietly.

1. **Regulatory posture and data residency** — gates the first production migration.
2. **The three M1 exercises** — needs a physiotherapist. Everything in Stream A's first month depends on it.

---

*Maintained document. If the working agreement changes, it changes here.*
