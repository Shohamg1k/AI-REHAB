# Feature catalogue and MVP selection sheet

**61 features** across nine groups. Every feature in the PRD appears here exactly once, with a stable ID.

This is the working document for scoping. Mark your MVP selection in the **Pick** column, then regenerate `docs/MVP-BUILD-PROMPT.md` from the result.

> **Scope confirmed 2026-08-29.** The **Pick** column below is filled in — `IN` for the 15 recommended MVP features (unchanged from the recommendation below), `OUT` for everything else — and M0+M1 have been built against it in a single session per `docs/MVP-BUILD-PROMPT.md`. See `docs/STATUS.md` for what shipped and what's still open.

**Legend**

| Column | Meaning |
|---|---|
| **Loop** | `fast` = on-device, per-frame, ≤33ms · `slow` = server-side, between sets/sessions · `plat` = platform/data · `—` = not runtime |
| **Effort** | `S` ≤ 2 days · `M` ≤ 1 week · `L` ≤ 3 weeks · `XL` > 3 weeks (for one builder) |
| **Rec** | My recommendation: **MVP** · **FF** (fast follow, M2–M3) · **Later** (M4+) |
| **New** | ● = added in PRD v2.0, not in the original document |
| **Pick** | Yours. `IN` / `OUT` / `?` |

---

## A · Motion capture and form analysis

The camera layer. Nothing else in the product works if this doesn't.

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **A1** | Live pose tracking — full-body skeleton, single camera, no wearables | fast | M | — | | **MVP** | IN |
| **A2** | Per-rep form scoring — joint angles, ROM, tempo, symmetry vs reference ranges | fast | L | A1, A6 | | **MVP** | IN |
| **A3** | Live corrective coaching — visual + spoken cues mid-exercise, with cooldowns | fast | M | A2 | | **MVP** | IN |
| **A4** | Automatic rep and set counting | fast | M | A1 | Armed by an explicit start, not by the camera opening: 10s countdown in, auto-end at target out | **MVP** | IN |
| **A5** | Compensation pattern detection — back instead of knee, favouring one side | fast | L | A2 | | FF | OUT |
| **A6** | Exercise library with reference models (the exercise DSL) | — | M | — | | **MVP** | IN |
| **A7** | Camera setup coach + persistent capture-quality score | fast | M | A1 | ● | **MVP** | IN |
| **A8** | Personal ROM baseline — score against this patient, not a population average | fast | M | A2, G1 | ● | FF | OUT |
| **A9** | Session replay with skeleton scrub (no video — rendered from stored landmarks) | plat | M | G1 | ● | FF | OUT |
| **A10** | Bilateral comparison — injured vs uninjured as a headline metric | slow | S | A2, A8 | ● | FF | OUT |

> **A1–A4 + A6 + A7 are the product.** A demo without live corrective coaching is a rep counter. A7 is not optional polish: every score downstream inherits the capture quality, and without the setup ritual most home sessions produce data we shouldn't trust.

---

## B · Pain localisation and inference

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **B1** | Movement-based pain estimation from pose deviations, guarding, asymmetry | slow | L | A2 | | FF | OUT |
| **B2** | Self-report fusion — 1–5 scale + tap-to-point body map | slow | S | — | | **MVP** | IN |
| **B3** | Region-level pain mapping, per rep and per session | slow | M | B1, B2, G1 | | FF | OUT |
| **B4** | Pain trend visualisation across sessions | slow | M | B3 | | FF | OUT |
| **B5** | Pain-linked rep bookmarking — one button: *that one hurt* | fast | S | A4, G1 | ● | **MVP** | IN |
| **B6** | Inference as question generator, never a standalone verdict | slow | S | B1 | ● | FF | OUT |

> **B2 and B5 are cheap and give the best data in the system.** B5 is one button that anchors a pain report to an exact rep and its skeleton — better data than any inference will produce. **B1 without B6 should not ship**; they are one feature in two parts, and shipping the estimate without the reframing is the risk flagged in PRD §10.

---

## C · Conversational engagement

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **C1** | Session narration and encouragement | slow | M | G1 | | FF | OUT |
| **C2** | Rest-period check-ins — "how did that set feel?" | slow | S | C1 | | FF | OUT |
| **C3** | Voice Q&A — plain-language, non-diagnostic answers | slow | M | C1, E4 | | Later | OUT |
| **C4** | Adjustable coaching persona — encouraging / clinical / concise | slow | S | C1 | | Later | OUT |
| **C5** | Difficulty-aware tone shifts on frustration or fatigue | slow | M | C1, A2 | | Later | OUT |
| **C6** | "Why this exercise" rationale cards | — | S | A6 | ● | **MVP** | IN |
| **C7** | Hands-free session control — spoken start/pause/resume/end and "it hurts here" | fast | M | A4, B5, H9 | ● | **MVP** | IN |

> **C6 is a text field in the exercise spec** and one of the better-supported adherence levers. It is in the MVP because it costs almost nothing. The rest of group C is where the LLM budget goes — worth doing properly at M4 rather than badly at M1.

---

## D · Adaptive recommendation

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **D1** | Session-to-session adaptation of intensity, selection, pacing | slow | L | G1, B3, E5 | | FF | OUT |
| **D2** | Progression policy — deterministic rule table now, learned policy later | slow | M | D1 | | FF | OUT |
| **D3** | Plateau and regression detection | slow | M | D1, G2 | | Later | OUT |
| **D4** | Pre-session readiness check that adjusts today's intensity | slow | S | D1 | | FF | OUT |

> **Upstream OpenRehabAgent already implements D1/D2** as a Q-learning agent over a 7-exercise catalogue. We adopt the structure, ship the deterministic rule table first, and log `(state, action, outcome)` so a learned policy has a dataset waiting. See PRD §5.4.

---

## E · Safety supervision

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **E1** | Real-time safety gating — frame-level block/downgrade | fast | M | A2 | Gate runs and logs; **in-session block suspended** pending reviewed thresholds + debounce (ADR-0012) | **MVP** | IN |
| **E2** | Fall / instability detection during standing exercises | fast | M | A1, E1 | | FF | OUT |
| **E3** | Escalation guidance — contact your clinician / emergency services | — | S | E1 | | **MVP** | IN |
| **E4** | Non-diagnostic framing throughout, snapshot-tested | — | S | — | | **MVP** | IN |
| **E5** | Session-level supervisor — filters the allowed exercise set | slow | S | B3 | | FF | OUT |
| **E6** | Per-patient clinician threshold overrides | slow | M | E1, F6 | ● | Later | OUT |

> **E1, E3, and E4 are not negotiable at any scope.** A camera app that tells someone to push through a movement, with no gate and no escalation path and no framing about what it is, should not be put in front of a patient. E5 is upstream's `SupervisorAgent`, adoptable roughly as-is.

---

## F · Clinician reporting and tools

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **F1** | Automated session and weekly reports | slow | L | G1, G2 | | FF | OUT |
| **F2** | Exportable clinician packet (PDF) | slow | M | F1 | | FF | OUT |
| **F3** | Multi-session trend view — progressing / plateaued / regressing | slow | M | F1, G2 | | Later | OUT |
| **F4** | Plain-language explanations of movement and pain data | slow | M | F1 | | Later | OUT |
| **F5** | Full audit trail, traceable end to end | plat | S | G1 | | FF | OUT |
| **F6** | Program builder + one-click assign, with template library | plat | L | G3, A6 | ● | Later | OUT |
| **F7** | Flag triage inbox — ranked daily worklist across the caseload | plat | L | F1, G3 | ● | Later | OUT |
| **F8** | Rep-anchored clinician annotations | plat | M | A9, F9 | ● | Later | OUT |
| **F9** | Clinician-to-patient messaging | plat | M | G3 | | Later | OUT |

> **F7 is the clinician retention feature** — without it the dashboard is an archive visited before appointments, not a tool opened every morning. It is Later only because it needs F1 and a real caseload to rank. **F6 matters more than it looks:** without it the clinician reads reports about a program they had no hand in.

---

## G · Data, platform, and trust

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **G1** | Structured append-only session event log | plat | M | — | | **MVP** | IN |
| **G2** | Shared state and projections over the event log | plat | M | G1 | | FF | OUT |
| **G3** | Auth and roles — patient / clinician / caregiver | plat | M | — | | FF | OUT |
| **G4** | Multi-tenancy and row-level security | plat | M | G3 | | FF | OUT |
| **G5** | Consent and data-sharing control centre with patient-visible access log | plat | M | G3 | ● | FF | OUT |
| **G6** | Offline / local-first with deferred sync | plat | L | G1 | | FF | OUT |
| **G7** | Confidence gating — low-confidence sessions marked, not averaged in | plat | S | A7, G1 | ● | FF | OUT |

> **G1 in the MVP means local-only** (IndexedDB), no server. That is enough to prove the log shape and get replay for free later. **G4 must land before the first production migration** — retrofitting tenancy onto a clinical database is a rewrite, not a refactor.

---

## H · Engagement and retention

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **H1** | Streaks and session history calendar | plat | S | G1 | | FF | OUT |
| **H2** | Milestone and progress celebrations | plat | S | A8, G2 | | FF | OUT |
| **H3** | Gentle re-engagement nudges after a missed session | plat | M | G3 | | Later | OUT |
| **H4** | Post-session summary card | — | S | G1 | | **MVP** | IN |
| **H5** | Caregiver / family visibility (opt-in) | plat | M | G3, G5 | | Later | OUT |
| **H6** | Drop-out risk scoring — nudge before they quit, not after | slow | M | G2, H3 | ● | Later | OUT |
| **H7** | Guest session without an account | plat | S | G1 | ● | FF | OUT |
| **H8** | Gamified variety packs — reach-based mini-games | fast | L | A1, A6 | | Later | OUT |
| **H9** | Multi-language, large text, high contrast, cue captions | — | L | — | Multi-language **partial**: 4 locales across spoken cues, captions, safety sheet and voice settings, plus a bundled Hindi neural voice (ADR-0011) for devices with none. Large text and high contrast not started. | Later | OUT |
| **H10** | Wearable integration for heart rate / recovery context | plat | L | G3 | | Later | OUT |

> **H9's multi-language half was pulled forward** ahead of the rest of the accessibility programme, on the principle that a patient who cannot read the safety sheet is worse served than one who cannot enlarge it. Large text and high contrast remain Later.
>
> **H4 is in the MVP because a session needs an ending.** **H7 is nearly free** once G1 is local-first, and it removes the signup form standing between a first-time visitor and the only demo that matters. **H9 accessibility is Later as a full programme, but cue captions ship with A3** — a patient who cannot hear the coach still needs the coaching.

---

## I · Internal tooling and scale

| ID | Feature | Loop | Effort | Depends on | New | Rec | Pick |
|---|---|---|---|---|:--:|:--:|:--:|
| **I1** | Exercise authoring studio — record, auto-derive ranges, tune, publish | — | L | A2, A6 | ● | Later | OUT |
| **I2** | Evaluation harness + fixture replay in CI | — | M | A2 | ● | **MVP** | IN |
| **I3** | Mobile shell (React Native) reusing the TypeScript core | — | L | A1–A4 | ● | Later | OUT |

> **I2 is in the MVP and it is the least negotiable item on this page.** Without a fixture library and a replay harness, every change to form scoring is a guess, and there is no way to know whether a tweak that fixed one person's squat broke everyone else's. It is also what turns UI-PRMD and KIMORE from interesting datasets into a regression suite. **I1 decides whether the catalogue reaches 20 exercises or 200** — but only after the scoring engine has stabilised enough to be worth authoring against.

---

## Recommended MVP — 15 features

The smallest set where a real patient can do a real session, get real coaching, log real pain, and end with something to look at — and where we can tell whether a change made it better.

```
A1  Live pose tracking              E1  Real-time safety gating
A2  Per-rep form scoring            E3  Escalation guidance
A3  Live corrective coaching        E4  Non-diagnostic framing
A4  Rep and set counting            G1  Session event log (local-only)
A6  Exercise library / DSL          H4  Post-session summary card
A7  Camera setup + quality score    I2  Eval harness + fixtures
B2  Self-report pain check-in
B5  Pain-linked rep bookmarking
C6  "Why this exercise" cards
```

**Scope notes.** Three exercises, not ten. No accounts, no server, no clinician side — everything local. Browser speech synthesis for spoken cues, no hosted TTS. No LLM in the MVP at all: cue text comes from the exercise spec's cue table, which is what the fast loop requires anyway.

**What this deliberately leaves out, and why it's survivable:** no pain *inference* (B1) — B2 and B5 collect better data with zero model risk; no conversation (C1–C5) — it needs a real session loop to be worth writing prompts against; no clinician side (all of F) — there is nothing worth reporting until the scores are trustworthy; no adaptation (D) — it needs session history that doesn't exist yet.

**Estimated:** 4–6 weeks for two builders, tracking M0 + M1 in `docs/ROADMAP.md`.

---

## Dependency-ordered build sequence

Any feature can be pulled forward, but these orderings are structural:

```
A6 ──▶ A2 ──▶ A3 ──▶ A5          exercise specs before scoring before cueing
A1 ──▶ A4 ──▶ B5
A1 ──▶ A7 ──▶ G7                 capture quality gates every downstream score
G1 ──▶ G2 ──▶ F1 ──▶ F2/F3/F7    log before projections before reports
G1 ──▶ A9 ──▶ F8                 replay before rep-anchored annotation
G3 ──▶ G4/G5 ──▶ F6/F9/H5        identity before tenancy before sharing
B1 ──▶ B6                        never ship the estimate without the reframing
A2 ──▶ I2                        harness needs something to score
D1 ──▶ D2 ──▶ D3
```

---

*Maintained document. Update the Pick column when scope changes, and mirror the decision into `docs/ROADMAP.md` and `docs/STATUS.md`. Feature IDs are stable and referenced from commit messages and issue titles — never renumber.*
