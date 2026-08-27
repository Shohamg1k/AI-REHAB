# MVP build prompt

A self-contained handoff prompt for building **M0 + M1**. Paste it to a fresh agent in a clone of this repo.

> **Scope basis:** the recommended 15-feature MVP in [`FEATURES.md`](FEATURES.md#recommended-mvp--15-features). **If the scope has been changed, update §2 of this prompt to match the Pick column before using it.**

---

## The prompt

```
You are building the MVP of AI Rehab Coach, a camera-based rehabilitation
coaching app. The repo you are in is fully documented and contains no code yet.

READ FIRST, IN THIS ORDER:
  1. CLAUDE.md                — the working agreement. Non-negotiable.
  2. docs/STATUS.md           — current position and blockers
  3. docs/FEATURES.md         — feature IDs; the MVP set is listed below
  4. docs/CONTRACTS.md        — every type you will need. Implement these first.
  5. docs/ARCHITECTURE.md     — stack, package boundaries, testing strategy
  6. docs/UPSTREAM.md §1      — what OpenRehabAgent gives us and what it doesn't

═══════════════════════════════════════════════════════════════════════
1. WHAT YOU ARE BUILDING
═══════════════════════════════════════════════════════════════════════

A web app where a patient performs a rehab exercise in front of their laptop
or phone camera, and the app:
  · watches them with on-device pose tracking
  · counts their reps automatically
  · scores each rep against the exercise's correct-form reference ranges
  · tells them what to fix WHILE THEY ARE DOING IT ("raise your elbow higher")
  · blocks the exercise if form or instability crosses a safety threshold
  · lets them report pain, and tag the exact rep that hurt
  · ends with a summary card

Local only. No accounts, no server, no database, no LLM. Everything runs in
the browser and persists to IndexedDB.

The live corrective coaching IS the product. An app that counts reps and shows
a score at the end is a rep counter. If you have to cut something, do not cut A3.

═══════════════════════════════════════════════════════════════════════
2. SCOPE — 15 features, no more
═══════════════════════════════════════════════════════════════════════

  A1  Live pose tracking            single camera, full-body skeleton
  A2  Per-rep form scoring          joint angles, ROM, tempo, symmetry
  A3  Live corrective coaching      visual + spoken, mid-exercise, cooldowns
  A4  Rep and set counting          automatic
  A6  Exercise library / DSL        exercises as DATA, three of them
  A7  Camera setup coach            framing/lighting/joints + quality score
  B2  Self-report pain              1-5 scale + tap-to-point body map
  B5  Pain-linked rep bookmarking   one button: "that one hurt"
  C6  "Why this exercise" cards     one sentence, from the exercise spec
  E1  Real-time safety gating       frame-level block/downgrade
  E3  Escalation guidance           contact your clinician / emergency
  E4  Non-diagnostic framing        UI + any generated text, snapshot-tested
  G1  Session event log             append-only, IndexedDB
  H4  Post-session summary card     reps, score, pain, closure
  I2  Eval harness + fixtures       replay in CI with accuracy reporting

EXPLICITLY OUT: pain inference (B1), all conversation (C1-C5), all clinician
features (F*), adaptation (D*), auth and multi-tenancy (G3/G4), streaks (H1),
compensation detection (A5), the Python service. Do not build them. Do not
scaffold them "for later". If you think one is needed, say so and stop.

═══════════════════════════════════════════════════════════════════════
3. THE FOUR INVARIANTS — do not break these
═══════════════════════════════════════════════════════════════════════

  1. NO MODEL CALL IN THE PER-FRAME PATH. packages/core runs at 30fps and
     stays deterministic and offline. Cue text comes from the exercise spec's
     cue table, not from a language model.
  2. VIDEO NEVER LEAVES THE DEVICE. Never stored, never transmitted, never
     buffered past the frame being processed.
  3. SAFETY IS A PURE FUNCTION WITH VETO. packages/core/safety has no I/O,
     no clock, no randomness, no model. Nothing may soften its verdict.
  4. EVERY DECISION CARRIES A `reason` STRING.

═══════════════════════════════════════════════════════════════════════
4. BUILD ORDER
═══════════════════════════════════════════════════════════════════════

M0 — Foundations (do not skip; do not reorder)

  0.1  pnpm monorepo. packages/{contracts,core,exercises,eval}, apps/patient.
       CI: typecheck, lint, test, plus the dependency lint from
       ARCHITECTURE.md §3 (core may not import React/DOM/fetch).

  0.2  packages/contracts — implement docs/CONTRACTS.md as TypeScript types
       plus Zod schemas. This is the first PR and everything depends on it.
       Do not start 0.3 until it is merged.

  0.3  THE POSE SPIKE. MediaPipe PoseLandmarker in a Web Worker, GPU delegate.
       Render the skeleton. MEASURE fps and landmark jitter on:
         - a mid-range laptop
         - a three-year-old Android phone
         - an iPhone
       ...in good light and in a dim room.
       Report the numbers before writing anything else. If you cannot clear
       24fps on the worst device, STOP and report — that changes the plan.
       Pick the model tier (lite/full/heavy) from what you measure.

M1 — The core loop

  1.1  packages/core/pose — One Euro filter on raw landmarks, then joint
       angles, symmetry, trunk lean. Do NOT use a moving average: the lag
       shows up as late cues. Raw MediaPipe output jitters enough to create
       phantom rep boundaries and false asymmetry, so this step is load-bearing.

  1.2  packages/exercises — the ExerciseSpec DSL from CONTRACTS.md. Author
       THREE specs by hand. Ask which three before you start (see BLOCKERS);
       if unanswered, build seated knee extension first, since it is the
       easiest to segment and needs the fewest visible joints.

  1.3  A7 camera setup coach — framing, distance, lighting, required-joints
       check, producing a CaptureQuality that persists all session. Build this
       BEFORE scoring. Every downstream number inherits capture quality, and
       tuning a scorer against badly-framed input wastes days.

  1.4  A4 rep segmentation — a state machine over the spec's phases. Target
       ≥95% rep-count accuracy on fixtures before moving on. Watch for
       double-counting on slow eccentrics and pauses at the top.

  1.5  A2 form scoring — weighted FormCriterion evaluation → 0-100 with a
       per-criterion breakdown. Every score carries a confidence derived from
       capture quality; below the floor, show "not enough signal this rep"
       rather than a number.

  1.6  A3 live cues — select from the spec's cue table on criterion failure,
       respect cooldownMs, respect priority. Render on the overlay AND speak
       via browser SpeechSynthesis AND caption the spoken text. A patient who
       cannot hear the coach still needs the coaching.

  1.7  E1 real-time safety gate — pure function, per frame, over the spec's
       SafetyThresholds. Emits SafetyVerdict. May pre-empt any cue.
       E3 escalation flow + E4 framing ship with it, not after it.

  1.8  B2 pain self-report + B5 the "that one hurt" button. B5 writes a
       pain_bookmarked event carrying the rep index.

  1.9  G1 event log — append-only, IndexedDB, exactly the SessionEvent union
       from CONTRACTS.md. No updates, no deletes. Corrections are new events.

  1.10 H4 summary card + C6 rationale cards (a text field on the spec).

  1.11 I2 eval harness — record landmark fixtures, replay against the engine,
       report rep-count accuracy and form-score distribution. Wire it into CI
       so every PR posts the diff. Record deliberately bad fixtures too: dim
       room, phone on the floor, patient half out of frame.

═══════════════════════════════════════════════════════════════════════
5. DONE MEANS
═══════════════════════════════════════════════════════════════════════

  · Someone outside the team performs a real set in front of a laptop, the
    rep count is right, and at least one corrective cue is both true and useful.
  · Rep-count accuracy ≥95% on the fixture set.
  · Every safety rule has a fixture proving it fires. No fixture, no merge.
  · packages/core imports nothing that does I/O — enforced by lint.
  · docs/STATUS.md reflects reality.

═══════════════════════════════════════════════════════════════════════
6. HOW TO WORK
═══════════════════════════════════════════════════════════════════════

  · Branch per feature ID: `a7-camera-setup-coach`. Never commit to main.
  · Commit messages lead with the feature ID: `A4: fix double-count on slow
    eccentric`.
  · Update docs/STATUS.md before you stop working. Write it for someone with
    no memory of your session — that is who reads it.
  · A PR that changes behaviour without updating the docs is incomplete.
    See CLAUDE.md §3 for which doc goes with which change.
  · Do not commit dataset raw files. fixtures/raw/ is gitignored.

═══════════════════════════════════════════════════════════════════════
7. BLOCKERS — ask, do not guess
═══════════════════════════════════════════════════════════════════════

  · WHICH THREE EXERCISES? Needs a physiotherapist. Suggested: seated knee
    extension, standing shoulder abduction, sit-to-stand — the latter two
    appear in UI-PRMD, so fixtures come free. Ask before authoring specs.
  · REFERENCE RANGES for those exercises. The open catalogues in
    docs/UPSTREAM.md §4 have metadata but NO joint-angle ranges. Those must
    be authored by a clinician. If unavailable, use plausible placeholder
    ranges, mark them `provisional: true` in the spec, and surface that in
    the UI. Do not ship provisional ranges as if they were validated.
  · Anything that would break an invariant. Stop and say so.

Start by reading CLAUDE.md and docs/STATUS.md, then report your plan for M0
before writing code.
```

---

## Regenerating this prompt

When the MVP scope changes:

1. Update the Pick column in [`FEATURES.md`](FEATURES.md).
2. Rewrite §2 of the prompt above — both the IN list and the EXPLICITLY OUT list.
3. Adjust §4's build order for any new dependencies (check the dependency graph at the foot of `FEATURES.md`).
4. Update §5 if the exit criterion moves.
5. Note the scope change in [`STATUS.md`](STATUS.md) and [`ROADMAP.md`](ROADMAP.md).

**Keep the OUT list explicit.** An agent told only what to build will scaffold what it imagines comes next, and the MVP stops being minimal.
