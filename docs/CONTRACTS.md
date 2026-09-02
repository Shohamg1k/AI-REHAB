# Interface contracts

The typed seams between packages. **These are written before the code that uses them** — they are what lets separate workstreams build in parallel without blocking on each other.

Everything here lives in `packages/contracts` as TypeScript types plus Zod schemas. The API validates with the same schemas the frontend builds against, so a schema change breaks the build rather than production.

> **Status:** implemented in `packages/contracts` (TypeScript + Zod, one file per domain, barrel at `src/index.ts`). Two additions landed during implementation, noted where they appear below — everything else here matches the shipped schemas.

---

## Conventions

- All timestamps are `number` — milliseconds from a monotonic session clock, not wall time. Wall time is recorded once, on the session envelope.
- All confidences are `0..1`.
- All scores shown to users are `0..100`; all internal severities are `0..1` (matching upstream OpenRehabAgent).
- **Every decision type carries a `reason: string`.** Non-negotiable — see PRD §3.3.
- Angles are degrees. Distances are normalised to torso length, never pixels.

---

## `PoseFrame`

Produced by the pose worker, consumed by `core/reps` and `core/form`. One per camera frame.

```ts
type Landmark = {
  x: number; y: number; z: number;   // normalised, origin at frame centre
  visibility: number;                 // 0..1, from MediaPipe
};

type PoseFrame = {
  t: number;                          // monotonic ms
  landmarks: Landmark[];              // 33, MediaPipe ordering
  world: Landmark[];                  // metric-ish world coords, for real angles
  captureQuality: CaptureQuality;
};

type CaptureQuality = {
  score: number;                      // 0..1 — drives A7 badge and G7 gating
  framing: 'ok' | 'too_close' | 'too_far' | 'partially_out_of_frame';
  lighting: 'ok' | 'dim' | 'blown_out';
  missingJoints: JointName[];         // legacy view, kept for events written before landmark framing
  missingLandmarks: PoseLandmarkName[];  // required-but-not-usable, the authoritative list
  landmarkChecks: LandmarkCheck[];    // per-required-landmark status, drives the A7 checklist
  guidance: FramingGuidance[];        // patient-facing instructions, worst-first
  requiredLandmarksOk: boolean;       // false => scoring is paused (G7)
};

type LandmarkCheck = {
  landmark: PoseLandmarkName;
  status: 'ok' | 'low_confidence' | 'out_of_frame' | 'not_detected';
  visibility: number;                 // 0..1
};

type FramingGuidance = { severity: 'ok' | 'warn' | 'fail'; message: string };
```

**Framing is exercise-scoped, not whole-body.** `CaptureQuality` answers "can I see what *this exercise* needs", never "is the whole body visible". The landmarks judged come from `ExerciseSpec.setup.requiredLandmarks`; everything else may be out of frame without penalty. An upper-body exercise must not fail because the patient's feet are off camera.

```ts
type ReferenceMedia = {
  type: 'image' | 'video' | 'animation';
  url: string;                        // bundled asset path or remote URL
  thumbnail?: string;
  instructions: string;               // required — media is never the only channel
  keyPoints?: string[];               // ordered technique cues
};
```

**Rule:** reference media is *outbound presentation only*. It is never produced from the camera and nothing writes to it at runtime — it cannot become a channel for patient imagery (ADR-0002).

**Rule:** `PoseFrame` is the only place raw landmarks exist. Nothing downstream of `core/pose` sees a landmark array — it sees angles and derived features. This is what keeps the "never persist video-like data" invariant enforceable by inspection.

---

## `JointAngles`

Derived from `PoseFrame` by `core/pose`. The unit of everything downstream.

```ts
type JointName =
  | 'left_shoulder'  | 'right_shoulder'
  | 'left_elbow'     | 'right_elbow'
  | 'left_hip'       | 'right_hip'
  | 'left_knee'      | 'right_knee'
  | 'left_ankle'     | 'right_ankle'
  | 'left_wrist'     | 'right_wrist'
  | 'trunk';

type JointAngles = {
  t: number;
  angles: Partial<Record<JointName, number>>;   // degrees
  confidence: Partial<Record<JointName, number>>;
  symmetry: Partial<Record<'shoulder'|'elbow'|'hip'|'knee', number>>; // 0 = perfect
  trunkLean: number;
};
```

> `JointName` is deliberately the same 12 joints as upstream OpenRehabAgent's `JOINT_INDEX`, plus `trunk`. That makes the MediaPipe → upstream adapter a pure lookup table rather than a translation layer. See [UPSTREAM.md §1.4](UPSTREAM.md).

---

## `ExerciseSpec` — the exercise DSL

The leverage point of the whole system (feature A6). An exercise is **data, not code**; adding one is authoring, not engineering.

```ts
type ExerciseSpec = {
  id: string;
  displayName: string;
  rationale: string;                  // C6 — the "why this exercise" sentence

  // Added during implementation (not in the original spec). The three M1
  // exercises were authored without a physiotherapist — see docs/STATUS.md
  // "Blocked" — so every reference range in this build is a placeholder.
  // `provisional: true` is the load-bearing flag: the UI must surface it
  // (badge on camera setup + summary) rather than presenting the score as
  // clinically validated. See docs/MVP-BUILD-PROMPT.md §7.
  provisional: boolean;
  provisionalNote?: string;

  // upstream-compatible metadata (mirrors exercise_catalog.Exercise)
  targetRegions: BodyRegion[];
  contraindicatedRegions: BodyRegion[];
  intensity: 'none' | 'low' | 'medium' | 'high';
  difficulty: number;                 // 0..5
  movementType: 'mobility' | 'strength' | 'control' | 'balance' | 'recovery';
  progression: string | null;
  regression: string | null;

  // fast-loop data — the part upstream does not have
  setup: {
    view: 'front' | 'side' | 'either';
    posture: 'seated' | 'standing' | 'supine' | 'prone';
    requiredJoints: JointName[];      // joints this exercise MEASURES (drives A2/A4)
    requiredLandmarks?: PoseLandmarkName[];  // landmarks the CAMERA must see (drives A7)
    framingHint?: string;             // plain-language setup instruction
  };
  phases: RepPhase[];                 // drives the A4 segmentation FSM
  referenceMedia?: ReferenceMedia;    // optional demonstration image/video/animation
  criteria: FormCriterion[];          // drives A2 scoring
  compensations: CompensationRule[];  // drives A5
  cues: CueTemplate[];                // drives A3
  safety: SafetyThresholds;           // drives E1
};

type RepPhase = {
  name: string;                       // e.g. 'concentric' | 'hold' | 'eccentric'
  joint: JointName;
  enter: { angle: number; direction: 'above' | 'below' };
  minDurationMs?: number;
  maxDurationMs?: number;
};

type FormCriterion = {
  id: string;
  label: string;                      // shown in the score breakdown
  joint: JointName;
  measure: 'peak_angle' | 'end_angle' | 'tempo_ms' | 'symmetry' | 'trunk_lean';
  target: { min: number; max: number };
  tolerance: { warn: number; fail: number };
  weight: number;                     // contribution to the 0..100 score
};

type CueTemplate = {
  id: string;
  triggerCriterion: string;           // FormCriterion.id
  direction: 'over' | 'under';
  text: string;                       // "raise your elbow a little higher"
  cooldownMs: number;                 // A3 — stops the coach nagging
  priority: number;
};

type SafetyThresholds = {
  maxAngle?: Partial<Record<JointName, number>>;
  minAngle?: Partial<Record<JointName, number>>;
  maxTrunkLean?: number;
  instabilityVelocity?: number;       // E2
  consecutiveFailedRepsToBlock: number;
};
```

`CompensationRule` (referenced by `ExerciseSpec.compensations`, drives A5) had no shape specified on paper. A5 is fast-follow, not MVP, but the DSL needed *something* today so an M1 spec isn't a breaking change later. Implemented as:

```ts
type CompensationRule = {
  id: string;
  label: string;
  joint: JointName;
  detect: 'trunk_lean_exceeds' | 'asymmetry_exceeds' | 'joint_substitution';
  threshold: number;
  severity: number;                   // 0..1
};
```

Every MVP exercise ships with `compensations: []` — no detector runs against it yet. Revisit this shape when A5 is actually built; it is a placeholder, not a commitment.

---

## `RepEvent`

Produced by `core/reps`, consumed by form scoring, the UI, and the event log.

```ts
type RepEvent = {
  t: number;
  repIndex: number;
  setIndex: number;
  phaseTimings: Record<string, { startMs: number; endMs: number }>;
  peakAngles: Partial<Record<JointName, number>>;
  endAngles: Partial<Record<JointName, number>>;
  tempoMs: number;
  meanConfidence: number;
};
```

---

## `FormScore`

```ts
type FormScore = {
  t: number;
  repIndex: number;
  score: number;                      // 0..100
  breakdown: {
    criterionId: string;
    label: string;
    value: number;
    target: { min: number; max: number };
    status: 'ok' | 'warn' | 'fail';
    contribution: number;
  }[];
  compensations: { ruleId: string; label: string; severity: number }[];
  confidence: number;                 // 0..1 — feeds G7
  reason: string;
};
```

**Rule:** a `FormScore` with `confidence` below the configured floor is never shown as a number and never enters a trend. It is rendered as "not enough signal this rep" and marked in reports (G7).

---

## `CoachingCue`

```ts
type CoachingCue = {
  t: number;
  cueId: string;
  text: string;
  targetJoint: JointName | null;
  urgency: 'info' | 'correct' | 'stop';
  source: 'form' | 'safety' | 'narration';
};
```

`urgency: 'stop'` may only be emitted by the safety gate.

---

## `ProgressReport` — F1

Computed from the event log on read, never stored. The patient reads the same
report as the clinician: a report a patient is not allowed to see is a report
that can say things about them they cannot check.

Beyond the headline counts, it carries the detail that makes it actionable:

- **`perExercise[]`** — per exercise: sessions, reps, average score,
  `completionRate` against what was prescribed, and:
  - **`criteria[]`** — *which* criterion is failing, how often, its mean value
    against its target band, and the average miss when it misses. Sorted
    worst-first by **failure rate**, never by magnitude: criteria carry
    different units and ranking 600 ms above 8.2° compares nothing to nothing.
  - **`compensations[]`** — named compensation patterns and how often each was
    seen.
  - **`romChange[]`** — best peak of the first session against the best of the
    last. Peak, because peak is what the exercise trains; omitted entirely
    below two sessions, since there is nothing to compare.
- **`formTrend[]`** — average score per session, oldest first.
- **`dataQuality`** — what share of reps were tracked well enough to score
  (G7). A report that shows scores without saying how much of the movement was
  visible invites confidence the data does not support.
- **`pain[]`** — carries `exerciseId` and `repIndex`. "Knee pain" is a symptom;
  "knee pain on rep 6 of sit-to-stand" is something a clinician can change a
  prescription over.

**Only reps above the confidence floor feed criterion and compensation stats.**
A rep the tracker could barely see would otherwise report a confident-looking
"failed" against a criterion it never measured. Range of motion is the one
exception: it is geometry, measurable on a rep too noisy to score.

**One report per day, derived on read.** `GET /me/reports/daily` returns a
`ProgressReport` for each day the patient did something, newest first, days
with no sessions omitted. Because a report is computed from the event log
every time it is read, finishing another exercise does not create a second
report for the day — it makes that day's report say more the next time it is
opened. There is no generate step and no stored copy to fall out of date.

`lastActivityAt` is the wall clock of the most recent session in the period, or
null. It is the only part of "this changed" a reader cannot infer for
themselves. It is taken from the events, not from `Date.now()`, so the
projection stays clock-free and testable.

**Days are the patient's local days.** The client sends its IANA zone as `tz`;
`computeAdherence` and `computeDailyReports` are given the same one, so the
streak and the report list can never disagree about which day a session
belongs to. An unrecognised zone falls back to UTC rather than throwing — the
value arrives in a query string.

`periodDate` is carried rather than derived, because east of UTC a local day
*begins* on the previous UTC date: `periodStart` for 2 September in Kolkata is
`2026-09-01T18:30:00Z`, and slicing that would label the report 1 September.
`timeZone` says which clock the report is speaking in, so the UI can render
times in the same one the days were counted in.

**`ReportObservation.exerciseId` is an id, not a name.** `apps/api` may depend
on `@ai-rehab/contracts` only, so it cannot resolve a display name; the UI
joins the two. That is why the field exists rather than the name being spelled
into `text`.

---

## `Locale`

```ts
type Locale = 'en' | 'es' | 'hi' | 'fr';

type LocaleInfo = {
  code: Locale;
  nativeName: string;   // what goes in the picker
  englishName: string;  // logs, clinician surfaces, reports
  speechLang: string;   // BCP-47, handed to SpeechSynthesisUtterance.lang
  reviewed: boolean;    // false until a fluent speaker has read the strings
};
```

The language the patient is coached in (H9). `DEFAULT_LOCALE` is `'en'` and is typed as a literal, not as `Locale` — callers narrow with `locale === DEFAULT_LOCALE`, and a widened type silently defeats that.

**A locale is a presentation concern and never a storage one.** `CoachingCue.text` and `SafetyVerdict.reason` are persisted in English regardless of what the patient hears, so one canonical language reaches the clinician (invariant 4). Translation happens at the point of display and speech:

- `localiseCue(text, locale)` in `packages/exercises` — a lookup in `CUE_TRANSLATIONS`, keyed by the English source string so that editing English copy fails the build rather than leaving a stale translation.
- `localiseSafetyReason(verdict, locale)` in `apps/patient` — rebuilds the sentence from the verdict's `ruleId` and `threshold`, never from its prose. It cannot see `verdict.verdict`, so it cannot soften a block (invariant 3).

Both fall back to English rather than to an empty string: a patient mid-rep needs *a* cue, and a patient being blocked needs *a* reason.

Adding a locale to `LocaleSchema` fails the typecheck until every UI string exists, and fails `cueCatalogue.test.ts` until every cue is translated.

---

## `PainSignal`

```ts
type BodyRegion = 'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'hip' | 'knee' | 'ankle' | 'neck';

type PainSignal = {
  t: number;
  region: BodyRegion;
  inferred: { severity: number; confidence: number; basis: string[] } | null;  // B1
  selfReported: { severity: number; repIndex: number | null } | null;          // B2/B5
  fusion: 'self_report_only' | 'inferred_only' | 'weighted' ;
  recordedSeverity: number;           // what goes in the record
  reason: string;
};
```

**Rule (B6).** When `inferred` is present and `selfReported` is absent, `recordedSeverity` **must not** be presented to the patient or clinician as a pain value. Its only permitted use is selecting which check-in question to ask. Enforced by a lint rule on the reporting layer.

---

## `SafetyVerdict`

The most important type here. Deterministic in, deterministic out.

```ts
type SafetyVerdict = {
  t: number;
  verdict: 'allow' | 'downgrade' | 'block' | 'escalate';
  ruleId: string;
  reason: string;                     // human-readable, shown to the patient
  threshold: { name: string; limit: number; observed: number } | null;
  downgradeTo: string | null;         // ExerciseSpec.id
  source: 'realtime_gate' | 'session_supervisor';
};
```

**Rules:**
- `core/safety` must be a pure function. No I/O, no clock reads beyond the passed `t`, no randomness, no model calls. Enforced by a dependency lint: `packages/core/safety` may not import anything that performs network I/O.
- Nothing downstream may transform `block` or `escalate` into a lesser verdict.
- Every `ruleId` has at least one fixture in `packages/eval` demonstrating it firing. **A new rule without a fixture does not merge.**

`packages/contracts` ships a `mostSevere(a, b)` helper alongside this type — the mechanical enforcement of the second rule wherever two verdicts for the same frame need combining (e.g. the realtime gate evaluating several thresholds at once). It orders `allow < downgrade < block < escalate` and always returns the more severe of the two.

---

## `SessionEvent` — the append-only spine

Everything above ends up here. Every view in the product is a projection over this log.

```ts
type SessionEvent =
  | { type: 'session_started';   t: number; sessionId: string; programId: string | null; wallClock: string }
  | { type: 'setup_completed';   t: number; captureQuality: CaptureQuality }
  | { type: 'readiness_reported'; t: number; energy: number; painGeneral: number }   // D4
  | { type: 'exercise_started';  t: number; exerciseId: string; prescribed: { sets: number; reps: number } }
  | { type: 'rep_completed';     t: number; rep: RepEvent; score: FormScore }
  | { type: 'cue_delivered';     t: number; cue: CoachingCue }
  | { type: 'pain_reported';     t: number; signal: PainSignal }
  | { type: 'pain_bookmarked';   t: number; repIndex: number; region: BodyRegion | null }  // B5
  | { type: 'safety_verdict';    t: number; verdict: SafetyVerdict }
  | { type: 'exercise_completed'; t: number; exerciseId: string; repsCompleted: number }
  | { type: 'adaptation_decided'; t: number; decision: AdaptationDecision }
  | { type: 'session_ended';     t: number; reason: 'completed' | 'abandoned' | 'blocked' };
```

**Rules:**
- Append-only. No updates, no deletes. Corrections are new events.
- `rep_completed` stores the derived `RepEvent`, **not** the landmark frames — except for a downsampled skeleton track kept for A9 replay, which is explicitly landmark-derived and contains no image data.
- The log is the source of truth for reports (F1–F5), trends (B4, F3), and the audit trail (F5).

---

## `AdaptationDecision`

```ts
type AdaptationDecision = {
  t: number;
  policy: 'rules_v1' | 'learned_v1';
  state: string;                      // upstream StateEncoder format: region|pain|prev
  action: string;                     // ExerciseSpec.id
  alternatives: { action: string; blocked: boolean; reason: string }[];
  direction: 'progress' | 'hold' | 'regress';
  reason: string;
};
```

Logged for every decision from day one, whether or not a learned policy exists yet — this is the `(state, action, outcome)` dataset D2 will eventually need.

---

## Ownership

Which workstream owns which contract, so changes get the right reviewer:

| Contract | Owner | Reviewers |
|---|---|---|
| `PoseFrame`, `JointAngles`, `RepEvent`, `FormScore`, `CoachingCue`, `ExerciseSpec` | Stream A (Motion & Form) | B |
| `PainSignal`, `SafetyVerdict` | **Joint** — no single owner | All streams; a second pair of eyes is required |
| `SessionEvent`, `AdaptationDecision` | Stream C (Platform & Data) | A, B |

Safety and pain contracts are authored jointly and reviewed by someone who did not write them.

---

*Maintained document. A contract change is a breaking change: update this file, the Zod schemas, and every consumer in the same pull request.*
