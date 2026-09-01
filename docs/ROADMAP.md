# Roadmap

Six milestones over sixteen weeks, then scale. Every milestone ends in something a person can use, and an exit criterion phrased as an observable event rather than a checklist.

Feature IDs reference [FEATURES.md](FEATURES.md). Week estimates assume a three-person team at full time — scale proportionally.

> **Current position:** M0 + M1 built and merged. M2 (the data spine — auth, tenant-scoped Postgres, event sync, program assignment, an E5 session supervisor) built and tested on a branch, pending merge. Real-device validation (the M0 spike's fps/jitter measurement), a physiotherapist's sign-off on the three exercises' reference ranges, and live-Postgres verification of the RLS policies are still open. See [STATUS.md](STATUS.md).

---

## Workstreams

Split by seam, not by feature, so two people rarely need the same file.

| Stream | Owns | Delivers |
|---|---|---|
| **A · Motion & Form** | `packages/core`, `packages/exercises`, `packages/eval`, pose worker | A1–A10, E1, E2, I1, I2 |
| **B · Experience & Conversation** | `apps/patient`, prompt layer, voice I/O | A3 presentation, A7, B2, B5, C1–C6, D4, H1–H4, H7–H9 |
| **C · Platform & Data** | `apps/api`, `services/rehab-engine`, database, clinician routes | B1, B3, B4, D1–D3, E5, E6, all of F, all of G, H5, H6, H10 |

**Safety belongs to no stream.** E1–E6 are authored jointly and reviewed by someone who did not write them. Same for escalation copy: nobody ships a "contact your clinician" flow alone.

**If the team is two:** merge B and C under one person, keep A separate — motion work has a different debugging rhythm from product work, and context-switching between them is where velocity dies. Then cut M5's dashboard to a read-only report viewer and push F7 to Q2.

---

## M0 · Foundations and the one spike that matters
**Week 1**

- Monorepo, CI, typecheck/lint/test gates, preview deploys
- **`packages/contracts`** — [CONTRACTS.md](CONTRACTS.md) made real. Merged before anything depends on it.
- Vendor OpenRehabAgent into `services/rehab-engine`; write the MediaPipe→`JOINT_INDEX` adapter; get upstream's test suite green in our CI
- **Pose spike:** camera → MediaPipe in a worker → landmark stream → measured fps and jitter on a mid-range laptop, a three-year-old Android phone, and an iPhone. In poor lighting.
- `ExerciseSpec` v0 authored by hand for one exercise, on paper first
- ADR log started; §Open decisions given owners and dates

**Exit:** a landmark stream renders as a live skeleton at ≥24fps on the worst device we intend to support, and we have written down what we do if it doesn't.

---

## M1 · The core loop, end to end, three exercises
**Weeks 2–4** · Features: A1, A2, A3, A4, A6, A7, B2, B5, C6, E1, E3, E4, G1, H4, I2

- **A7** camera setup coach: framing, distance, lighting, visible-joints check, live quality score
- **A1** pose worker with One Euro smoothing; joint angles, symmetry, trunk lean
- **A4** rep segmentation state machine
- **A2** form scoring for three exercises — one seated, one upper-body, one weight-bearing. Suggested: seated knee extension, standing shoulder abduction, sit-to-stand. *Needs a physiotherapist's sign-off — see [STATUS.md](STATUS.md).*
- **A3** live corrective cues, visual overlay plus browser speech, with cue cooldowns
- **E1/E3/E4** real-time gate, escalation flow, non-diagnostic framing
- **B2/B5** self-report scale + body map, and the *that one hurt* button
- **G1** append-only event log, IndexedDB only — no server yet
- **H4** post-session summary card · **C6** rationale cards
- **I2** eval harness and the first recorded fixtures

**Exit:** someone outside the team performs a real set in front of a laptop, the rep count is right, and at least one corrective cue is both true and useful. Rep-count accuracy ≥95% on the fixture set.

> **This is the MVP.** Everything after it is thickening.

---

## M2 · The data spine
**Weeks 5–7** · Features: A8, A9, G2, G3, G4, G5, G6, G7, H1, H2, H7, F5

- **G3/G4** auth, patient/clinician/caregiver roles, tenant-scoped schema with RLS
- **G6** local-first write with background sync; the event log becomes durable
- **G2** projections: session history, per-joint ROM trend, adherence calendar
- **A8** personal ROM baseline captured on first session
- **A9** session replay from stored skeletons · **G7** confidence gating
- **G5** consent and data-sharing centre with a patient-visible access log
- **H1/H2** streaks, calendar, milestones · **H7** guest session
- **F5** audit trail exposed

**Exit:** close the laptop mid-session, reopen it, and the session is intact, synced, and replayable rep by rep — with a complete audit trail behind it.

---

## M3 · Pain and safety
**Weeks 8–10** · Features: A5, A10, B1, B3, B4, B6, E2, E5

- **B1** movement-based pain heuristics, adapted from upstream's `PainLocalizationAgent`, re-weighted against KIMORE. Every signal carries a confidence.
- **B6** the reframing: inference selects which check-in question to ask; self-report is what gets recorded
- **B3/B4** region-level mapping and trend visualisation
- **E5** session supervisor — upstream's `SupervisorAgent`, thresholds moved to config
- **E2** fall and instability detection · **A5** compensation detection · **A10** bilateral comparison
- Safety fixture suite: adversarial sessions, full branch coverage
- Escalation copy reviewed by a clinician before it ships

**Exit:** an unsafe fixture session triggers a block within 500ms with a correct, human-readable reason, and the adaptive layer demonstrably cannot override it.

---

## M4 · Conversation and adaptation
**Weeks 11–13** · Features: C1, C2, C3, C4, C5, D1, D2, D3, D4

- Claude proxy with non-diagnostic guardrails, refusal-to-diagnose behaviour, full prompt/response audit logging
- **C1–C5** narration, rest-period check-ins, voice Q&A, three personas, fatigue-aware tone
- **D4** pre-session readiness check that actually changes today's intensity
- **D1/D2** progression policy — deterministic rule table over pain burden × adherence × form trend, behind the interface a learned policy would implement
- **D3** plateau and regression detection
- Every `(state, action, outcome)` tuple logged from here on

**Exit:** a fifteen-minute multi-exercise session feels coached rather than monitored, and the next session's plan differs from the last in a way the patient can have explained to them.

---

## M5 · Clinician side and the retention loop
**Weeks 14–16** · Features: E6, F1, F2, F3, F4, F6, F7, F8, F9, H3, H5, H6

- **F6** program builder, template library, one-click assign · **E6** per-patient threshold overrides
- **F7** flag triage inbox — the daily worklist that turns the dashboard into a habit
- **F1/F2/F3/F4** session, weekly, and trend reports; PDF export; plain-language notes
- **F8/F9** rep-anchored annotations and clinician-to-patient messaging
- **H3/H5/H6** re-engagement nudges, caregiver view, drop-out risk scoring

**Exit:** a practising physiotherapist opens a report for a patient they don't know and tells us something about that patient they couldn't have known otherwise.

---

## M6+ · Scale
**Quarter 2** · Features: H8, H9, H10, I1, I3

- **I3** React Native shell reusing `packages/core` unchanged — the whole reason for the split
- **I1** exercise authoring studio; library from 3 to 20+
- **H9** multi-language voice and UI, large text, high contrast — *the multi-language half shipped early* (4 locales across spoken cues, captions and the safety sheet); large text and high contrast remain here
- **H10** wearable pairing · **H8** gamified variety packs
- Revisit D2 with real outcome data — replace the rule table if the dataset supports it

**Exit:** the exercise library grows without an engineer in the loop.

---

## Milestone summary

| | Weeks | Features | Theme |
|---|---|---|---|
| M0 | 1 | — | Contracts, vendoring, feasibility spike |
| M1 | 2–4 | 15 | **The MVP** — core coaching loop |
| M2 | 5–7 | 12 | Durable, synced, replayable, consented |
| M3 | 8–10 | 8 | Pain inference and hard safety |
| M4 | 11–13 | 9 | Conversation and adaptation |
| M5 | 14–16 | 12 | Clinician tools and retention |
| M6+ | Q2 | 5 | Mobile, library scale, i18n |

61 features total.

---

*Maintained document. When scope moves, update here and in [STATUS.md](STATUS.md) in the same commit.*
