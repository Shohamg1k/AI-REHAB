# Product Requirements Document
## AI Vision-Based Rehabilitation Coach

**Version 2.0** · 27 August 2026
Camera-guided exercise coaching, pain inference, and clinician reporting.

> **Changes from v1.0** — v1.0 was authored as a standalone document (`docs/source/AI_Rehab_Coach_PRD.docx`, preserved unchanged). v2.0 adds §5.9–5.12 (fourteen new features), rewrites §3 and §8 around the two-loop architecture and the [OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent) upstream, reframes pain inference in §5.2 as a question generator rather than a verdict, replaces the RL-first progression engine in §5.4 with a staged approach, and adds §12 (open-source foundations) and §13 (regulatory posture). Every feature in v1.0 is retained.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Problem statement](#2-problem-statement)
3. [Solution overview](#3-solution-overview)
4. [Target users and personas](#4-target-users-and-personas)
5. [Feature list](#5-feature-list)
6. [Non-goals and boundaries](#6-non-goals-and-boundaries)
7. [Success metrics](#7-success-metrics)
8. [System architecture](#8-system-architecture)
9. [Roadmap](#9-roadmap)
10. [Risks and mitigations](#10-risks-and-mitigations)
11. [Open questions](#11-open-questions)
12. [Open-source foundations](#12-open-source-foundations)
13. [Regulatory posture](#13-regulatory-posture)

---

## 1. Executive summary

Most physical rehabilitation happens unsupervised, at home, in the days and weeks between short physiotherapy appointments. In that gap, patients don't know if they're performing exercises correctly, lose motivation and skip sessions, and struggle to describe their pain accurately when they finally see their clinician. Clinicians, in turn, make treatment decisions based on incomplete, memory-based patient reports.

This product uses a standard device camera to watch a patient perform prescribed rehab exercises in real time. It analyses body movement to give live corrective feedback, infers where and when pain likely occurs, keeps the patient engaged through natural conversation, adapts the exercise program session to session, and automatically compiles a structured, doctor-ready report.

The goal is threefold: improve exercise correctness and safety, improve adherence through an engaging experience, and close the information gap between patient and clinician.

**Positioning.** This is a coaching and monitoring aid, not a diagnostic or medical device. It does not diagnose conditions, prescribe treatment, or replace a clinician's judgment — it makes the time between appointments visible, safer, and less boring. See §13.

---

## 2. Problem statement

Home-based rehabilitation is the backbone of most recovery plans, but it fails in predictable, well-documented ways:

- **No real-time correction.** Patients often don't discover they're performing an exercise incorrectly until pain, a plateau, or re-injury signals it. Poor form during rehab can actively worsen the original injury.
- **Poor adherence.** Home exercise programs delivered as PDFs or printed handouts are repetitive and unmonitored. Patients skip sets, rush reps, or abandon the program early, and no one notices until the next appointment — often weeks later.
- **Pain is under-reported or mis-reported.** Patients struggle to describe exactly where and when pain occurred during a movement. Clinicians end up working from vague, recalled descriptions ("it hurt sometimes") instead of objective, movement-linked data.
- **Clinicians have no visibility between visits.** Physiotherapists and doctors cannot see how a patient actually moved at home. Treatment adjustments are based on what the patient remembers to say, not what happened.
- **Static programs don't adapt.** A fixed handout doesn't change whether the patient is improving quickly, plateauing, or struggling with pain. The next session should look different in each case, but usually doesn't.
- **Rehab is boring.** Repetitive solo exercises with no feedback loop or encouragement lead to disengagement, one of the leading drivers of drop-out from prescribed rehab programs.

**Net effect:** slower recovery, higher rehab drop-out, and clinicians making adjustment decisions with incomplete information.

---

## 3. Solution overview

An AI rehabilitation companion that runs on a phone, tablet, or laptop camera. The patient performs their prescribed exercises in front of the device; the system tracks body movement in real time, gives live spoken and visual coaching on form, holds a natural conversation to keep the session engaging, infers likely pain location and severity from movement and voice check-ins, adapts the program over time, and generates a structured report for the treating clinician.

### 3.1 How it works, end to end

1. Patient opens the app and starts an assigned exercise, or picks from a template library if unassigned.
2. A **guided camera setup** step confirms framing, distance, and lighting, and produces a capture-quality score that persists for the whole session.
3. **Camera-based motion tracking** extracts a real-time skeleton and derives joint angles, tempo, range of motion, and left/right symmetry — entirely on-device.
4. A **form-analysis layer** compares movement against exercise-specific reference ranges and gives live corrective cues ("raise your elbow a little higher", "slow down on the way down").
5. A **pain-inference layer** combines movement deviations (hesitation, guarding, reduced range of motion, asymmetry) with quick self-reported check-ins to estimate likely pain region and severity.
6. A **conversational layer** narrates the session, checks in during rest periods, answers questions in plain language, and keeps the experience from feeling like a monitoring tool.
7. A **safety supervisor** sits above everything and can pause, downgrade, or block an exercise if pain signals or unsafe form patterns cross a threshold. This layer overrides all other logic.
8. An **adaptive recommendation engine** adjusts intensity and exercise selection for the next session based on how the patient is trending.
9. Everything is logged to an **auditable session history**, and a **report generator** turns that history into a clinician-ready summary.

### 3.2 The two-loop principle

The system runs on two clocks, and they must never be mixed. This is the single most important structural decision in the product.

| | **Fast loop** | **Slow loop** |
|---|---|---|
| **Runs** | Every camera frame | Between sets, and between sessions |
| **Where** | On-device, in the browser | Server-side |
| **Budget** | ≤ 33 ms, no network | 0.5–4 s, streamed |
| **Nature** | Deterministic, pure functions | Generative and probabilistic |
| **Owns** | Pose → joint angles → rep segmentation → form scoring → compensation detection → real-time safety gating → cue selection | Pain localisation, program adaptation, session-level supervision, narration, voice Q&A, explanations, reports |
| **Testing** | Replayed against recorded fixtures in CI; 100% branch coverage on safety rules | Snapshot tests on prompts; guardrail assertions |

A language model in the per-frame path would make corrective coaching arrive seconds after the rep it was about, cost money on every frame, and make safety behaviour non-reproducible. Keeping the loops separate is what allows the fast loop to be tested to a clinical standard while the slow loop stays free to be conversational and imperfect.

### 3.3 Four invariants

These are the rules the architecture exists to protect. They are not negotiable without an ADR.

1. **Video never leaves the device.** Pose estimation runs entirely in the browser. What is persisted is landmark-derived features, scores, and events — never frames, never a video file. Session replay is rendered from stored skeletons, not footage.
2. **The safety supervisor is a pure function with veto.** It takes session state in, returns `{ verdict, reason, ruleId, threshold }` out. Deterministic, no I/O, no model, no randomness. Every other component may *suggest*; only this one may *block*. When uncertain, it flags rather than proceeds.
3. **Session state is an append-only event log.** Reps, scores, pain reports, cues delivered, blocks issued, adaptation decisions — all timestamped events. Every view (summary card, clinician report, trend line) is a projection over that log. This makes the audit trail real rather than aspirational, and gives us replay: any past session can be re-run through a new scoring algorithm to see if we made it better.
4. **Every decision carries a reason string.** No score, block, or recommendation is ever persisted as a bare number. `reason` is a required field.

---

## 4. Target users and personas

**Primary — the rehab patient.** Recovering from a musculoskeletal injury, surgery, or chronic condition (post-op knee, rotator cuff, lower back pain). Prescribed a home exercise program by a physiotherapist. Often has low motivation for repetitive solo exercise, uncertainty about correct form, and difficulty articulating pain precisely at follow-up visits.

**Secondary — the physiotherapist / treating clinician.** Prescribes and periodically adjusts the exercise program. Currently relies on patient self-report and infrequent in-person reassessment. Wants objective adherence and form data without adding administrative burden.

**Tertiary — caregiver / family member.** For patients who are elderly, post-surgical, or otherwise benefit from a second set of eyes. May want visibility into whether sessions are happening and going well, without access to full medical detail.

---

## 5. Feature list

Features are grouped by the layer of the system they belong to. Each carries a stable ID used throughout the repo — in `docs/FEATURES.md`, in `docs/ROADMAP.md`, in issue titles, and in commit messages.

Features introduced in v2.0 are marked **`NEW`**.

### 5.1 Real-time motion capture and form analysis

The core camera-based tracking layer. Fast loop.

| ID | Feature | Description |
|---|---|---|
| **A1** | Live pose tracking | Full-body skeleton tracking from a single standard camera. No special hardware or wearables. |
| **A2** | Per-rep form scoring | Joint angles, range of motion, tempo, and left/right symmetry compared against exercise-specific reference ranges. |
| **A3** | Live corrective coaching | On-screen visual cues plus spoken prompts delivered mid-exercise, not just a post-session summary. Cue cooldowns prevent nagging. |
| **A4** | Automatic rep and set counting | Removes the need for the patient to count, track, or self-report completion. |
| **A5** | Compensation pattern detection | Flags substitution movements — using the back instead of the knee, favouring one side. |
| **A6** | Exercise library with reference models | A growing catalogue of common rehab exercises (mobility, strength, balance, stretching), each with a correct-form reference model. |
| **A7** `NEW` | Camera setup coach and capture-quality score | A 15-second guided framing ritual — distance, lighting, visible joints — then a persistent confidence badge for the whole session. v1.0 treated this as a risk mitigation; it is promoted to a first-class feature because every downstream score inherits its quality. |
| **A8** `NEW` | Personal ROM baseline | Session one captures this patient's own range of motion per joint. Every subsequent score reads against their baseline, not a population average. Makes week-one progress visible and makes scoring meaningfully more accurate for atypical bodies. |
| **A9** `NEW` | Session replay with skeleton scrub | Rewind to a flagged rep and watch the stored skeleton, for both patient and clinician. Nearly free once the event log exists, carries zero privacy load because there is no video, and is the strongest available answer to "why should I believe this score?" |
| **A10** `NEW` | Bilateral comparison | Injured versus uninjured side, surfaced as a headline metric. Physiotherapists reason in these terms; leading with it puts the data in the vocabulary they already use. |

### 5.2 Pain localisation and inference

Turns vague pain reports into structured, movement-linked data. Slow loop, with one fast-loop hook (B5).

| ID | Feature | Description |
|---|---|---|
| **B1** | Movement-based pain estimation | Infers likely discomfort from pose deviations, hesitation, guarding behaviour, asymmetry, and reduced range of motion. |
| **B2** | Self-report fusion | Combines inferred signals with quick in-session check-ins — a 1–5 pain scale and a tap-to-point body map — rather than relying on either alone. |
| **B3** | Region-level pain mapping | Logs pain by body region and by rep/session, building a pain-over-time picture instead of a single end-of-session guess. |
| **B4** | Pain trend visualisation | Shows whether a specific region is improving, stable, or worsening across sessions. |
| **B5** `NEW` | Pain-linked rep bookmarking | One button, tapped mid-set: *that one hurt*. Anchors the pain report to the exact rep and its stored skeleton. The highest-quality pain data the system can collect, at the cost of a single control. |
| **B6** `NEW` | Inference as question generator | **A reframing of B1, not an addition.** Movement-based pain estimation has no ground truth available to us — guarding and asymmetry correlate with discomfort, but also with fatigue, unfamiliarity, a stiff carpet, and a badly placed camera. So the inference never renders as a standalone number. It is a low-confidence prior whose job is to make the right question get asked at the right moment: instead of displaying "left knee pain: 3/5", the system asks *"it looked like you were protecting that side — how did that knee feel?"* The recorded pain value is always the patient's answer. |

### 5.3 Conversational engagement layer

Keeps the experience from feeling clinical or tedious. Slow loop.

| ID | Feature | Description |
|---|---|---|
| **C1** | Session narration and encouragement | Natural pacing and motivational feedback throughout, not just silent tracking. |
| **C2** | Rest-period check-ins | Short conversational prompts between sets ("how did that set feel?") to gather data and keep the patient present. |
| **C3** | Voice Q&A | Patient can ask plain-language questions ("why does this help my knee?") and get a non-diagnostic, understandable answer. |
| **C4** | Adjustable coaching persona | Encouraging coach, neutral/clinical, or concise modes, selectable by the patient. |
| **C5** | Difficulty-aware tone shifts | Conversational tone adapts if the system detects frustration, fatigue, or repeated struggle with an exercise. |
| **C6** `NEW` | "Why this exercise" cards | One honest, non-diagnostic sentence before each exercise, tied to the patient's condition. Understanding the purpose of a movement is among the better-supported adherence levers, and it costs one field in the exercise spec. |

### 5.4 Adaptive exercise recommendation

Makes the program respond to the patient instead of staying static. Slow loop, between sessions.

| ID | Feature | Description |
|---|---|---|
| **D1** | Session-to-session adaptation | Adjusts intensity, exercise selection, and pacing based on pain burden, adherence, and performance trends. |
| **D2** | Progression policy | Balances adherence, pain levels, and intensity fit when deciding whether to progress, hold, or regress an exercise. **Staged:** v1.0 specified a reward-modelled RL agent. A learned policy needs outcome data we will not have for months, and makes progression non-reproducible exactly when clinicians are deciding whether to trust the system. We ship a deterministic rule table first, behind the interface a learned policy would implement, and log every `(state, action, outcome)` tuple from day one. Upstream's Q-learning agent is retained as the reference implementation of the eventual replacement. See [ADR-0004](adr/). |
| **D3** | Plateau and regression detection | Recognises when a patient stops improving or starts declining, and adjusts rather than repeating the same plan indefinitely. |
| **D4** | Pre-session readiness check | A 10-second "how are you feeling today" prompt that adjusts today's intensity before the patient starts. Listed under retention in v1.0; it is functionally an adaptation input. |

### 5.5 Safety supervision

A hard rule layer that sits above and can override adaptive recommendations. **Split across both loops** — see E1 and E5.

| ID | Feature | Description |
|---|---|---|
| **E1** | Real-time safety gating | *Fast loop.* Blocks or downgrades an exercise the moment pain signals or unsafe form patterns cross a defined threshold, within the frame budget. |
| **E2** | Fall / instability detection | Flags loss of balance or unsafe positioning during standing exercises. |
| **E3** | Escalation guidance | Clearly directs the patient to contact their clinician or emergency services when signals exceed safe thresholds. The system never attempts to manage acute pain itself. |
| **E4** | Non-diagnostic framing throughout | Persistent, visible framing that this is a coaching aid, not a medical device, in the UI and in every generated report. Enforced by a snapshot test on report templates and model system prompts. |
| **E5** | Session-level supervisor | *Slow loop.* Filters the set of exercises the recommendation engine is allowed to choose from, based on region-level pain burden and contraindications. This is upstream OpenRehabAgent's `SupervisorAgent`, adopted directly. |
| **E6** `NEW` | Per-patient clinician threshold overrides | A clinician can tighten (never loosen below the global floor) safety thresholds for a specific patient's known limits — a shoulder that must not go above 90°, a knee with a weight-bearing restriction. |

### 5.6 Clinician reporting

Closes the information gap between home sessions and the clinic visit.

| ID | Feature | Description |
|---|---|---|
| **F1** | Automated session and weekly reports | Adherence percentage, form quality trend, pain heatmap over time, and flagged events (pain spike, sudden ROM drop, missed sessions). |
| **F2** | Exportable clinician packet | PDF/structured export the clinician can review before or during a follow-up visit. |
| **F3** | Multi-session trend view | Progressing, plateaued, or regressing status across the full program, so the clinician can decide whether to escalate, adjust, or discharge. |
| **F4** | Plain-language explanations | Raw movement and pain data rewritten into understandable notes for both patient and clinician, without clinical claims. |
| **F5** | Full audit trail | Every recommendation, block, and score is logged and traceable. Nothing is a black box to the reviewing clinician. |
| **F6** `NEW` | Program builder and one-click assign | v1.0's clinician side is read-only. It needs to be write-capable: build a program from templates, set sets/reps/frequency, apply per-patient threshold overrides (E6). Otherwise the clinician is reading reports about a program they had no hand in. |
| **F7** `NEW` | Flag triage inbox | A ranked daily worklist — pain spikes, safety blocks, sudden ROM drops, missed sessions — across the clinician's whole caseload. Without this, the dashboard is an archive they visit before appointments. With it, it is a tool they open every morning. **This is the clinician retention feature.** |
| **F8** `NEW` | Rep-anchored annotations | Extends F9: clinician comments attach to a specific replayed rep (A9), not to a report in general. "This is the movement I want you to slow down" — pointing at it. |
| **F9** | Clinician-to-patient messaging | A short note on a report ("great progress, keep going") that surfaces back to the patient, closing the loop in both directions. |

### 5.7 Feedback, data, and platform

The underlying data layer that the adaptation engine and the reports both draw from.

| ID | Feature | Description |
|---|---|---|
| **G1** | Structured session logging | Exercises performed, reps/sets, form scores, pain estimates, blocked actions, and self-reports, all timestamped. Append-only. |
| **G2** | Shared state and projections | A consistent record that every part of the system reads from and writes to, supporting reproducible, explainable recommendations. Every view is a projection over G1. |
| **G3** | Auth and roles | Patient, clinician, and caregiver roles with distinct permission sets. |
| **G4** | Multi-tenancy and row-level security | Tenant-scoped from the first migration. Retrofitting tenancy onto a clinical database is a rewrite, not a refactor. |
| **G5** `NEW` | Consent and data-sharing control centre | Explicit, revocable, per-recipient sharing — this clinician, that caregiver — with an access log the patient can read. Partly a trust feature, partly what makes the compliance conversation short instead of long. |
| **G6** | Offline / low-bandwidth mode | On-device pose tracking with sync-when-connected reporting. Home wifi reliability should not gate a rehab session. Because pose already runs on-device, making the event log local-first is far cheaper now than retrofitted later. |
| **G7** `NEW` | Confidence gating | Every score carries a confidence derived from A7. Low-confidence sessions are marked as such in the clinician report rather than silently averaged into a trend. |

### 5.8 Engagement and retention

Beyond the core coaching loop, these reduce drop-off — historically the single biggest failure mode in home rehab programs.

| ID | Feature | Description |
|---|---|---|
| **H1** | Streaks and session calendar | Visual continuity is one of the strongest low-cost retention mechanics in habit-based apps. |
| **H2** | Milestone and progress celebrations | Acknowledging ROM improvement, pain reduction, or completion streaks reinforces that the effort is working. |
| **H3** | Gentle re-engagement nudges | A check-in after a missed session, phrased supportively rather than punitively. |
| **H4** | Post-session summary card | A simple, shareable recap (reps done, form score, pain trend) giving the patient closure and a sense of progress each time. |
| **H5** | Caregiver/family visibility (opt-in) | A limited view for a family member to see adherence without full medical detail. Gated by G5. |
| **H6** `NEW` | Drop-out risk scoring | Adherence patterns in the first two weeks predict abandonment well. Score it, and fire the supportive nudge *before* the patient quits rather than after they have already stopped opening the app. |
| **H7** `NEW` | Guest session without an account | Let a first-time visitor complete a full tracked session, then offer to save it. The camera-coaching moment is the product's entire pitch; putting a signup form in front of it wastes the only demo that matters. |
| **H8** | Gamified variety packs | Optional lightweight game-like exercise variants (reach-based mini-games) for paediatric or long-duration patients where pure repetition is especially hard to sustain. |
| **H9** | Multi-language and accessibility | Voice coaching and UI in multiple languages, plus large text, high-contrast modes, and captions for every spoken cue — a patient who cannot hear the coach still needs the coaching. |
| **H10** | Wearable integration | Optional pairing with fitness trackers or smart rings for heart rate or recovery context alongside movement data. |

### 5.9 Internal tooling and scale `NEW`

Not patient-facing, but they determine whether the product can grow.

| ID | Feature | Description |
|---|---|---|
| **I1** `NEW` | Exercise authoring studio | Record a correct performance, auto-derive candidate angle ranges and phase boundaries, hand-tune tolerances, publish. Turns library growth from an engineering task into a content task — and decides whether the catalogue reaches 20 exercises or 200. |
| **I2** `NEW` | Evaluation harness and fixture replay | Recorded landmark streams replayed against the scoring engine in CI, with rep-count accuracy and score distribution posted to every pull request. Seeded from UI-PRMD and KIMORE (§12). Without this we cannot tell whether a scoring change made things better. |
| **I3** `NEW` | Mobile shell | React Native wrapper reusing the TypeScript core unchanged. The entire reason the core is framework-free. |

---

## 6. Non-goals and boundaries

- The product does **not** diagnose medical conditions or replace a clinician's assessment.
- The product does **not** prescribe medication or manage acute/emergency pain.
- The product does **not** claim clinical-grade accuracy on pain estimation. Pain inference is a decision-support signal, always paired with self-report, and never displayed as a standalone verdict (B6).
- The system will **not** silently increase difficulty or push through a flagged safety event. The supervisor layer's decisions are final and cannot be overridden by the adaptive engine.
- The product does **not** store or transmit video. Ever. (§3.3)

---

## 7. Success metrics

| Metric | What it tells us | Target signal |
|---|---|---|
| Session adherence rate | % of prescribed sessions actually completed | Upward trend vs. baseline paper/handout programs |
| Weekly retention (D7 / D30) | Whether patients keep returning without reminders | Comparable to top habit-based health apps |
| Form correction acceptance rate | % of live corrective cues that lead to an observable form change | High — indicates real-time coaching is effective |
| Report usage by clinicians | % of generated reports opened before a follow-up | High — validates the clinician-facing value |
| Safety-flag response time | Time between an unsafe signal and patient notification | Sub-second for E1; a few seconds for E5 |
| Patient-reported satisfaction | Post-session micro-survey score | Sustained over multiple weeks, not just week 1 |
| **Rep-count accuracy** `NEW` | Counted reps vs. ground truth on the fixture set (I2) | ≥ 95% before any form score is shown to a user |
| **Capture-quality pass rate** `NEW` | % of sessions completing setup (A7) above the confidence floor | High — a low rate means the setup coach is failing, not the patients |
| **Clinician weekly active** `NEW` | % of clinicians opening the triage inbox (F7) in a given week | The honest test of whether F7 works |

---

## 8. System architecture

### 8.1 Component overview

| Component | Loop | Responsibility | Source |
|---|---|---|---|
| Motion capture layer | Fast | Extracts skeleton keypoints and pose features from the live camera feed | Build (MediaPipe) |
| Form analysis layer | Fast | Scores each rep against exercise-specific reference ranges; drives real-time corrective coaching | Build |
| Real-time safety gate | Fast | Frame-level block/downgrade on unsafe form or instability | Build |
| Pain inference layer | Slow | Estimates region-level discomfort from pose features, fused with self-report | **Adapt upstream** |
| Session supervisor | Slow | Filters the allowed action set by pain burden and contraindications | **Adopt upstream** |
| Adaptive recommendation engine | Slow | Selects next exercise/intensity from session history, pain burden, and adherence | **Adapt upstream** |
| Conversational layer | Slow | Narration, check-ins, voice Q&A, tone adaptation | Build (Claude) |
| Session state and audit log | — | Shared, timestamped, append-only record of every score, signal, and decision | Build |
| Explanation and reporting layer | Slow | Converts session state into plain-language patient notes and structured clinician reports | **Adapt upstream** + build |

### 8.2 Data flow

```
                          ON DEVICE (fast loop, ≤33ms/frame)
  ┌──────────────────────────────────────────────────────────────────┐
  │  Camera ──▶ Pose landmarker ──▶ Joint angles / symmetry / tempo   │
  │                                          │                        │
  │                        ┌─────────────────┴──────────────┐         │
  │                        ▼                                ▼         │
  │                 Rep segmentation                Real-time         │
  │                        │                        safety gate ──────┼──▶ BLOCK
  │                        ▼                                │         │
  │                  Form scoring ──▶ Cue selection ◀────────┘         │
  │                        │                    │                     │
  └────────────────────────┼────────────────────┼─────────────────────┘
                           ▼                    ▼
                  ┌─────────────────┐   Live visual + spoken cue
                  │  SESSION EVENT  │
                  │   LOG (append)  │◀──── self-report, pain bookmark
                  └────────┬────────┘
                           │  landmark-derived features only — never video
                           ▼
                          SERVER (slow loop, 0.5–4s)
  ┌──────────────────────────────────────────────────────────────────┐
  │  Pain inference ──▶ Session supervisor ──▶ Recommendation engine │
  │        │                    │                       │            │
  │        │                    └── veto ───────────────┘            │
  │        ▼                                            ▼            │
  │  Conversational layer ◀────────────── approved recommendation    │
  │        │                                                          │
  │        ▼                                                          │
  │  Explanation & reporting ──▶ patient summary + clinician packet  │
  └──────────────────────────────────────────────────────────────────┘
```

**Design principle.** The safety layers are the only components with veto power over what reaches the patient. Every other component can suggest; only these can block.

### 8.3 Repository layout

```
ai-rehab-coach/
├── packages/
│   ├── contracts/         # shared types + Zod schemas. Written FIRST.
│   ├── core/              # pure TS engine — no DOM, no React, no network
│   │   ├── pose/          #   landmark smoothing, joint angles, symmetry
│   │   ├── reps/          #   rep segmentation state machine
│   │   ├── form/          #   scoring + compensation detection + cue selection
│   │   └── safety/        #   the real-time gate. deterministic. veto power.
│   ├── exercises/         # the exercise library, as DATA not code
│   └── eval/              # fixture replay harness + scoring regression tests
├── apps/
│   ├── patient/           # React + Vite. camera, overlay, session UI, voice
│   ├── clinician/         # routes inside patient app until it earns a split
│   └── api/               # Fastify, Postgres, LLM proxy, report renderer
├── services/
│   └── rehab-engine/      # vendored + extended OpenRehabAgent (Python/FastAPI)
├── fixtures/              # recorded landmark streams — the ground truth
└── docs/                  # this document and its companions
```

See `docs/ARCHITECTURE.md` for the full treatment and `docs/CONTRACTS.md` for the typed seams between packages.

---

## 9. Roadmap

Full detail with exit criteria in `docs/ROADMAP.md`.

| Milestone | Weeks | Theme |
|---|---|---|
| **M0** | 1 | Foundations, contracts, pose-feasibility spike |
| **M1** | 2–4 | Core loop end to end, three exercises |
| **M2** | 5–7 | Data spine: auth, event log, sync, replay |
| **M3** | 8–10 | Pain and safety |
| **M4** | 11–13 | Conversation and adaptation |
| **M5** | 14–16 | Clinician side and retention loop |
| **M6+** | Q2 | Mobile, library scale, i18n, wearables |

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pose tracking accuracy varies by lighting/camera quality | A7 guided setup; confidence badge all session; G7 confidence gating so bad data is marked rather than silently averaged; reduced-confidence mode with a visible warning rather than silent bad data |
| Patients over-trust pain inference as diagnostic | B6 — inference generates questions, never verdicts; self-report is always the recorded value; E4 persistent non-diagnostic framing |
| Engagement drop-off after novelty wears off | Retention features (§5.8) treated as core, not optional add-ons; H6 fires nudges before drop-out, not after |
| Clinicians ignore or distrust auto-generated reports | F7 triage inbox makes the dashboard a daily tool rather than an archive; A10 leads with the comparison clinicians actually reason in; F5 keeps everything traceable; reports stay concise, evidence-linked, and exportable |
| Safety-critical false negatives | Conservative thresholds; when uncertain, flag or pause rather than proceed; full branch coverage plus an adversarial fixture suite on the supervisor |
| **Scoring regressions ship silently** `NEW` | I2 — every scoring change replays the full fixture library in CI and posts the accuracy diff to the pull request |
| **Browser cannot hit the frame budget** `NEW` | Settled by the M0 spike on the worst target device. If it fails, the mobile shell (I3) moves from Q2 to now. |

---

## 11. Open questions

Tracked as ADRs in `docs/adr/`. Blocking items are listed in `docs/STATUS.md`.

1. **Regulatory posture and jurisdiction.** General wellness coaching aid versus a regulated clinical pathway; HIPAA versus GDPR special-category data. Determines hosting, contracts, claims language, and the database region — before the first migration. **Blocking.**
2. **The three M1 exercises.** Needs a physiotherapist's input. Drives all of stream A's first month. **Blocking.**
3. **Clinical advisor.** Safety thresholds, escalation copy, and report vocabulary need a named clinician to review before shipping.
4. **Pose model and device floor.** Settled by the M0 spike.
5. **One codebase or two** for patient and clinician apps. Currently leaning one, role-gated.

---

## 12. Open-source foundations

Full detail, including licence obligations and the adapt-versus-adopt decision per component, in `docs/UPSTREAM.md`.

| Project | Licence | Role |
|---|---|---|
| [OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent) | MIT | The slow loop. Pain localisation, session supervisor, Q-learning recommender, reward model, feedback tracking, explainer. Vendored into `services/rehab-engine/` and extended. Its `PoseAgent.process_landmarks()` is the integration seam — it already accepts external landmark arrays. |
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) | Apache-2.0 | Pose landmarker. 33 landmarks with world coordinates, on-device, with a matching mobile SDK for I3. |
| [UI-PRMD](https://webpages.uidaho.edu/ui-prmd/) | Academic | Ten rehab movements, ten subjects, correct and incorrect performances. Seeds the I2 fixture library. Includes sit-to-stand and standing shoulder abduction. |
| [KIMORE](https://vrai.dii.univpm.it/content/kimore-dataset) | Academic | Five exercises with clinician-assigned quality scores 0–50, across healthy controls, stroke, Parkinson's, and low-back-pain groups. Ground truth for form scoring. |
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | Public domain | 800+ exercises with metadata. Seeds A6's catalogue metadata; reference ranges still have to be authored. |

---

## 13. Regulatory posture

**Current stated posture: general wellness / coaching aid. Not a medical device.**

This posture is load-bearing and constrains the product:

- No diagnostic claims, in the UI, in reports, in marketing copy, or in model output (E4).
- Pain inference is decision support, never a verdict (B6).
- The system escalates to a human clinician rather than managing acute pain (E3).
- Clinician features assign and monitor programs the clinician authored; the system does not prescribe.

**This posture is not yet confirmed for any specific market.** If clinicians prescribe through the product, or if it makes claims about treating a condition, it may fall under medical device regulation (FDA in the US, MDR in the EU, and equivalents elsewhere) — which changes hosting, contracts, evidence requirements, and timelines substantially. A jurisdiction-specific answer is required before M2's first database migration. See §11.1.

---

*Maintained document. Every change to product scope lands here first, then propagates to `docs/FEATURES.md`, `docs/ROADMAP.md`, and `docs/STATUS.md`. See `CLAUDE.md` for the maintenance protocol.*
