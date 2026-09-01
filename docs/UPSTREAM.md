# Upstream and open-source foundations

What we take, what we build, and what we owe.

---

## 1. OpenRehabAgent

**Repo:** https://github.com/rishavbhandari6789/OpenRehabAgent
**Licence:** MIT · **Language:** Python · **Size:** ~1,050 LOC across 16 source files
**Default branch:** `master` · **Last pushed:** 2026-05-20 · 307 stars, 305 forks, 4 commits
**Status:** stable research prototype, not actively developed. Treat as a reference implementation to vendor, not a dependency to track.

> "A modular multi-agent research prototype for video-based pain localisation and adaptive exercise recommendation."

Backed by published work (SSRN abstract 5848742, Zenodo record 17765634). Upstream states plainly that it is not a medical device and does not provide medical advice — the same posture as PRD §13.

### 1.1 Why it fits

Upstream's six agents map almost one-to-one onto the PRD's slow loop, and it is **pose-agnostic**: `PoseAgent.process_landmarks()` accepts an external landmark array from "MediaPipe, OpenPose, MoveNet, or recorded JSON". That method is our integration seam. We supply real landmarks from the browser; upstream supplies the reasoning we would otherwise write from scratch.

### 1.2 What upstream gives us

| Upstream file | What it does | Our decision |
|---|---|---|
| `supervisor_agent.py` | Rule-based safety filter. Pain thresholds (caution `0.55`, stop `0.75`), contraindicated-region matching, intensity ceiling, always-allow-`rest` fallback, returns `SafetyDecision{allowed, blocked, reason, risk_level}`. | **Adopt.** Clean, deterministic, already returns a reason string. Becomes E5. Thresholds move to config; add E6 per-patient overrides. — **Built** (M2): `services/rehab-engine/app/supervisor.py`, 12 tests. See `services/rehab-engine/UPSTREAM_DIVERGENCE.md` for exactly what carried over vs. what's fresh. Not yet called from `apps/api` — see `docs/STATUS.md`. |
| `pain_localization_agent.py` | Weighted heuristic fusing pose features with self-report (`pose 0.65 / self_report 0.35`) into five regions with per-region explanations. | **Adapt.** Good structure, invented weights. Becomes B1. Re-weight against KIMORE; invert the default per B6 so the output drives a question rather than a displayed score. |
| `rl_agent.py`, `reward_model.py`, `state_encoder.py` | Q-learning over a discrete state string (`region\|pain-band\|prev-action`), reward balancing pain, completion, and intensity fit. | **Adapt, staged.** Keep as the reference for the eventual learned policy (D2); ship the deterministic rule table first. The state encoder is reusable as-is. |
| `models/exercise_catalog.py` | Frozen dataclass with `target_regions`, `intensity`, `difficulty`, `movement_type`, `contraindicated_regions`, `instructions`, `progression`, `regression`. 7 exercises. | **Extend.** The schema is a good start and directly informs our exercise DSL (A6) — but it has **no joint-angle reference ranges, no rep phases, no cue table**, which is exactly the fast-loop data we need to add. |
| `knowledge_base.py` | Shared key-value store with an agent-attributed audit trail. | **Replace.** Our G1 append-only event log supersedes it, but the audit-trail-by-default instinct is right and is carried forward. |
| `feedback_agent.py` | Adherence and response tracking. | **Adapt** into G2 projections. |
| `llm_explainer_agent.py` | Template-based explanation generation. | **Replace** with a real Claude-backed layer (C1–C5, F4), keeping the interface. |
| `rehab_engine.py` | Orchestrates all agents per recommendation step, returns a fully-explained session dict. | **Adapt.** The orchestration shape is good. It is one-shot ("recommend next exercise"), so we wrap it in our session lifecycle rather than the reverse. |
| `api/app.py` | FastAPI wrapper. | **Extend** into `services/rehab-engine`. |
| `pose_agent.py` | Synthesises deterministic keypoints for camera-free testing; adapts external landmarks. 12-joint index map. | **Keep the adapter, drop the synthesiser.** The synthetic path stays useful for tests. |

### 1.3 What upstream does not give us

Everything in the fast loop, and everything in the platform:

- **No real pose estimation.** Landmarks come from outside.
- **No rep counting, no per-rep form scoring, no live corrective cues.** Upstream answers "what exercise next?", not "how is this rep going?" The real-time coaching loop — the actual product — is entirely ours to build.
- **No joint-angle reference ranges.** The catalogue has contraindications but no correct-form model.
- **Frame-level safety does not exist.** Upstream's supervisor is session-level (E5). Our E1 real-time gate is new.
- **No persistence, auth, multi-tenancy, reports, or UI.**

### 1.4 Integration seam

```
browser (TypeScript)                          services/rehab-engine (Python)
────────────────────                          ──────────────────────────────
MediaPipe PoseLandmarker
   33 landmarks
        │
        ▼
 landmark adapter  ──── 12-joint array + confidence ───▶ PoseAgent.process_landmarks()
 (MediaPipe idx → JOINT_INDEX)                                    │
                                                                  ▼
                                                          PoseKeypoints.as_features()
                                                                  │
                                                                  ▼
                                                     PainLocalizationAgent.estimate_pain()
                                                                  │
                                                          SupervisorAgent.evaluate()
                                                                  │
                                                          recommendation + reason
```

Upstream's `JOINT_INDEX` covers 12 joints: left/right shoulder, elbow, hip, knee, wrist, ankle. MediaPipe Pose emits 33. **Writing that index mapping is a discrete, testable first task** — see `docs/CONTRACTS.md`.

### 1.5 Vendoring policy

Upstream has 4 commits and no open issues; it will not move meaningfully. We **vendor rather than depend**:

- Source is copied into `services/rehab-engine/` with the upstream MIT notice retained.
- `services/rehab-engine/UPSTREAM_DIVERGENCE.md` records every file we changed and why. Any agent modifying vendored code updates it in the same commit.
- The upstream `LICENSE` and attribution are preserved; our root `LICENSE` carries the incorporation notice.
- No upstream file is edited without a divergence note. If a change is generally useful, open a PR upstream too.

---

## 2. MediaPipe Tasks Vision

**Licence:** Apache-2.0 · https://ai.google.dev/edge/mediapipe

`PoseLandmarker` — 33 landmarks with world coordinates and per-landmark visibility, GPU delegate, runs on-device in the browser. Chosen over MoveNet and OpenPose for three reasons: world coordinates (needed for real joint angles, not just 2D projections), per-landmark visibility (feeds A7's capture-quality score and G7's confidence gating), and a first-party mobile SDK using the same model — so I3's mobile port doesn't change the numbers.

**Runs in a Web Worker.** The main thread must stay free for rendering the overlay.

Model variants: `pose_landmarker_lite` / `_full` / `_heavy`. The M0 spike decides which tier clears the frame budget on the worst target device.

---

## 3. Datasets

Both are **academic-use datasets with their own access terms**. Confirm licensing before any redistribution or commercial use; do not commit raw data (`fixtures/raw/` is gitignored) — commit only derived landmark fixtures where terms permit.

### UI-PRMD
https://webpages.uidaho.edu/ui-prmd/ — 10 rehabilitation movements, 10 healthy subjects, 10 repetitions each, captured simultaneously by Vicon optical tracker and Kinect. Includes **correct and intentionally incorrect** performances.

Movements: deep squat, hurdle step, inline lunge, side lunge, **sit to stand**, standing active straight leg raise, **standing shoulder abduction**, standing shoulder extension, standing shoulder internal-external rotation, standing shoulder scaption.

Two of those are candidate M1 exercises. The correct/incorrect pairing is exactly what A2's scoring needs to discriminate, and the Vicon track gives a ground truth to measure our joint angles against. **Primary seed for the I2 fixture library.**

### KIMORE
https://vrai.dii.univpm.it/content/kimore-dataset — 5 exercises, Kinect v2, across healthy controls plus stroke, Parkinson's, and low-back-pain groups. Each sample carries a **clinician-assigned quality score, 0–50**.

Exercises: arm lifting, lateral trunk tilt with arms extended, trunk rotation, pelvis rotation on the transverse plane, squatting.

The clinical scores are the closest thing available to ground truth for A2's form score. **Calibration target:** our 0–100 form score should correlate with KIMORE's expert scores on the overlapping movements. Also the honest re-weighting target for B1's currently-invented pain coefficients.

Useful wrappers: [KiMoRe_wrapper](https://github.com/petteriTeikari/KiMoRe_wrapper) (MATLAB/R wrangling), [EGCN](https://github.com/bruceyo/EGCN) (graph-conv baseline on both datasets, useful as a scoring benchmark to beat or borrow from).

---

## 4. Exercise metadata

[free-exercise-db](https://github.com/yuhonas/free-exercise-db) — public domain, 800+ exercises with muscle groups, equipment, and step-by-step instructions. Also [wger](https://github.com/wger-project/wger) (AGPL — **do not vendor**, reference only) and [exercemus/exercises](https://github.com/exercemus/exercises).

**Use with care.** These are fitness catalogues, not rehab protocols. They seed A6's *metadata* — names, muscle groups, instruction text, images. They contain **no joint-angle reference ranges, no rep-phase definitions, and no rehab contraindications**, which is the part that actually matters and which a physiotherapist has to author. Do not let a large imported catalogue create the impression of a large *supported* catalogue: an exercise without a reference model cannot be scored, and must be marked unsupported in the UI.

---

## 5. Licence obligations summary

| Dependency | Licence | Obligation |
|---|---|---|
| OpenRehabAgent | MIT | Retain copyright + licence text. Done in root `LICENSE` and `services/rehab-engine/`. |
| MediaPipe | Apache-2.0 | Retain notice; state changes if modified. Add `NOTICE` at first use. |
| free-exercise-db | Public domain (unlicence) | None. Attribution is courtesy. |
| UI-PRMD | Academic terms | **Check before commercial use or redistribution.** Cite the paper. |
| KIMORE | Academic terms | **Check before commercial use or redistribution.** Cite Capecci et al. 2019 (IEEE TNSRE). |
| wger | AGPL-3.0 | **Do not vendor.** Reference only. |
| Piper (engine + wasm phonemizer) | MIT | Retain copyright + licence text. |
| onnxruntime-web | MIT | Retain copyright + licence text. |
| Piper voice `hi_IN-pratham-medium` | **CC BY-NC-SA 4.0** | **Non-commercial only, and ShareAlike.** Attribution shown in-app. See §7. |
| espeak-ng data (bundled in the Piper wasm) | GPL-3.0 | Runs as a separate wasm artefact, unmodified and unlinked. **Re-check before any commercial release.** |

Open question for `docs/adr/`: whether the academic dataset terms permit use in a commercial product's CI, or only in research. This gates I2's fixture library and needs an answer before M1 ends.

---

## 6. Groq (hosted LLM inference)

**Service:** https://groq.com · **API:** OpenAI-compatible chat completions
**Default model:** `llama-3.3-70b-versatile` (Meta Llama 3.3, Llama Community Licence)
**Decision:** adopt as a **service, not a dependency**. No SDK — the call is one `fetch` to an OpenAI-shaped endpoint, and a package would add supply-chain surface for roughly twenty lines of code.

**Used for:** the between-sets coaching assistant (C1/C3) only. See `docs/adr/0009-llm-coaching-assistant.md` for the decision and its consequences — including that it ended the app's on-device-only posture for *derived* data.

**Not used for:** anything in the per-frame path (ADR-0001 stands), cue text (comes from the exercise spec's cue table), safety verdicts (a pure function with veto, invariant 3), or the clinician's progress report (F1 stays deterministic, every observation carrying its evidence).

**What crosses the boundary:** derived session facts only — exercise name, rep counts, form scores, self-reported pain, safety-block reasons. No landmarks, no frames, no name, no email, no identifiers. Enforced by the shape of `CoachSessionFactsSchema`, which has no field for any of them, and asserted by a test rather than left to reviewer discipline.

**Operational notes:** the key lives server-side in `apps/api` — a key shipped to a browser is a stolen key. Unconfigured is a supported state: the coach hides itself and nothing else changes. Groq's own terms govern retention; we make no claim about it beyond telling the patient it happens.

---

*Maintained document. Any new open-source dependency lands here with its licence and its adopt/adapt/replace decision before the first import.*

---

## 7. Bundled neural TTS (Piper) — ADR-0011

**What and why.** The Web Speech API can only use voices the operating system
already has. A machine with no Hindi voice cannot speak Hindi at all, and
"install a language pack" is not a product. So a voice ships with the app.

**Adopt / adapt / replace: adapt.** We use Piper's artefacts — the espeak-ng
wasm phonemizer and a VITS ONNX voice — but not its JS wrappers. Both published
wrappers (`@mintplex-labs/piper-tts-web`, `@diffusionstudio/vits-web`) hardcode
jsDelivr, cdnjs and a Hugging Face mirror, and that mirror carries no Hindi
voice at all. They are also ~40 lines of logic around `callMain` and one ONNX
session. We call those directly and stage every asset into
`apps/patient/public/tts`, which keeps the "no CDN at runtime" property the
pose assets already have.

### The licence position, stated plainly

**Every Piper Hindi voice is encumbered.** This was checked, not assumed:

| Voice | Licence | Usable? |
|---|---|---|
| `hi_IN-pratham-medium` | CC BY-NC-SA 4.0 | Non-commercial only |
| `hi_IN-priyamvada-medium` | CC BY-NC-SA 4.0 | Non-commercial only |
| `hi_IN-rohan-medium` | Bespoke IIT Madras Indic TTS agreement | Terms not public; needs a signed agreement |

**The product owner confirmed this project is non-commercial**, so
`hi_IN-pratham-medium` is used, with attribution rendered in the Settings card
and the non-commercial term shown next to it. **If that ever changes, this is
the first thing that has to be answered** — and the answer is not "swap the
voice", because there isn't a permissive Piper Hindi voice to swap to.

ShareAlike applies to *derivatives of the voice model*. We ship it unmodified
and do not train on it, so it does not reach into our source. That reading
should be confirmed by a lawyer before any distribution beyond this project.

### The permissive alternative, and why it is not here yet

**Kokoro-82M is Apache-2.0 and has four Hindi voices** — commercially clean,
and one 80MB model covers English, Hindi, Spanish and French. It was rejected
for now on a purely technical blocker: `kokoro-js` refuses non-English voices,
and the `phonemizer` package the JS ecosystem uses is an **English-only**
espeak-ng build (verified: `hi`, `es` and `fr` all return "Invalid language
identifier"). Reaching Kokoro's Hindi from a browser means compiling espeak-ng
to wasm with full language data first. Piper's wasm already is that build — it
carries 113 dictionaries including `hi_dict` — which is the whole reason this
route works today and that one does not.

**If this project ever goes commercial, that espeak-ng build is the unlock**,
and it would let the voice move to Apache-2.0 without changing any of the
plumbing in `ttsWorker.ts`.
