# Reference analysis — what we took, what we left

Four open-source rehabilitation projects were reviewed as technical references before this change set. **No code was copied from any of them.** Everything described as "adopted" below was reimplemented independently in TypeScript against our own architecture; the reference supplied the *idea*, not the implementation.

Read alongside [`UPSTREAM.md`](UPSTREAM.md), which records licence obligations, and [`ARCHITECTURE.md`](ARCHITECTURE.md) §3–4 for the boundaries these decisions had to respect.

---

## The four, in one line each

| Project | What it is | Verdict |
|---|---|---|
| [STGCN-rehab](https://github.com/fokhruli/STGCN-rehab) | Spatio-temporal graph CNN regressing a clinician quality score from Kinect skeletons (IEEE TNSRE 2022) | Ideas adopted; model rejected |
| [Liao/Vakanski framework](https://github.com/avakanski/A-Deep-Learning-Framework-for-Assessing-Physical-Rehabilitation-Exercises) | CNN+LSTM trained to approximate a GMM log-likelihood metric on UI-PRMD (IEEE TNSRE 2020) | Scoring *methodology* informative; pipeline rejected |
| [RehabAR](https://github.com/Apoorva-Nayak07/RehabAR) | 24-hour hackathon browser/Unity rehab demo, MediaPipe + voice feedback | Closest in shape; best source of UX ideas; **opposite privacy model** |
| [OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent) | Python multi-agent pain-localisation + RL exercise recommender | Schemas useful; logic not |

---

## What each one actually does

### STGCN-rehab
Three residual spatio-temporal graph-conv blocks over a 25-joint NTU skeleton, feeding four stacked LSTMs to a single linear output. Attention is a `ConvLSTM2D` producing a per-frame joint×joint affinity matrix, masked to the anatomical adjacency and softmaxed — so the model learns *which joint matters when*. Trained per-exercise on KIMORE/UI-PRMD against the clinician Total Score (0–50), Huber loss.

Notable: input is absolute Kinect camera-space metric coordinates with **no root-centring and no torso-scale normalisation**, only a global `StandardScaler`. The joint-importance heatmaps the README advertises as user guidance exist only as offline paper figures — **no code ships to extract or display them**.

### Liao / Vakanski framework
The important detail is where the labels come from: there is essentially no clinician-scored rehab data, so they **manufacture** the target. A 6-component GMM is fit over `[normalised frame index, 4 autoencoder dims]` of *correct* repetitions; the metric is the negated mean per-frame log-likelihood; a logistic squashes it into 0–1; a CNN+LSTM is then trained to approximate that metric quickly. The network is a fast approximator of a statistical template, not a learned notion of clinical quality — the authors say so.

Two details worth carrying: **phase is an explicit input dimension** to the GMM, so "right pose at the wrong moment" scores badly without DTW; and their published scores compress badly — deliberately *incorrect* repetitions land at **0.7–0.9**, which a patient would read as "pretty good".

### RehabAR
Three parallel, non-integrated prototypes that disagree with each other. The primary web path base64-encodes a JPEG and **POSTs the patient's body to a Flask server roughly ten times a second**. Rep counting is a boolean plus an 800 ms debounce in one implementation, a 3-phase machine with a 15° re-arm buffer in another, and a proper `Neutral→Down→Up` hysteresis state machine with EMA smoothing in the C# version. Voice is Web Speech API with `cancel()` before every utterance and **no cooldown**.

The UI work is genuinely good: a decoupled render/detect loop, a three-pass glow skeleton renderer, region-coloured joints, live angle readout that changes colour as a proximity gauge, and graded encouragement keyed on signed error.

### OpenRehabAgent
Four commits, ~30 KB of source, nine structural smoke tests. Does no pose detection (returns a hardcoded 12×2 array with sinusoidal wobble), computes no joint angles, and does no form scoring or rep counting at all. Every constant is hand-invented against no data. The "pain" heuristic is anthropometry mislabelled as pathology — `elbow_spread` is the raw distance between elbows, so anyone standing with arms wide registers elbow pain.

Structural defects found: every non-recovery exercise lists its own target regions as contraindicated, so the supervisor blocks precisely the exercise that targets the painful area; the engine is reconstructed per HTTP request, discarding the Q-table every call; and `progression`/`regression`/`difficulty` are declared in the schema but **never read by any code path**. Its 307 stars against 304 forks, created in burst patterns from generated-suffix accounts, are not organic — do not read the star count as validation.

---

## What we adopted, and where it lives

Each of these was reimplemented from the idea, not ported.

| Idea | From | Where it lives now |
|---|---|---|
| **Exercise-specific joint importance** — different exercises depend on different joints, declared as data | STGCN attention maps (concept); RehabAR `EXERCISE_CONFIG` (shape) | `ExerciseSpec.setup.requiredLandmarks` + weighted `criteria`. Hand-authored as a prior rather than learned — explainable, and it works with zero training data. |
| **Use the tracking-confidence channel instead of discarding it** | STGCN (throws away Kinect `trackingState`) — a negative lesson | `assessFraming` gates on per-landmark `visibility`, and says *which* body part is missing |
| **Root-centred, scale-normalised coordinates** | STGCN's omission — the reason it can't generalise | MediaPipe world landmarks are already hip-centred and metric; angles are scale-invariant by construction |
| **Adaptive smoothing, causally** | STGCN's companion uses non-causal `filtfilt` (unusable live); RehabAR uses a fixed EMA | One Euro filter, already in `packages/core/pose`. Adaptive cutoff beats both: heavy smoothing on holds, responsive on fast movement |
| **Multi-scale temporal statistics instead of temporal conv banks** | STGCN 9/15/20-frame kernels; Liao temporal pyramid | `packages/core/reps/temporal.ts` — range, velocity dispersion, phase balance, stability as closed-form arithmetic |
| **Score the trajectory, not the pose** | Both research papers | Temporal metrics feed new `FormCriterion.measure` values (`smoothness`, `phase_balance`, `range_of_motion`, `stability`) |
| **Hysteresis + full-cycle rep segmentation** | RehabAR C# `RepCounterStateMachine` | Already our design (phase FSM + `minDurationMs`); the reference confirmed the re-arm buffer matters |
| **Cue cooldown** | RehabAR's *absence* of one — a negative lesson | `CueTemplate.cooldownMs`, per-cue, already enforced in `selectCue` |
| **Structured safety decision with a reason, gating before the policy** | OpenRehabAgent `SafetyDecision` | Already our `SafetyVerdict` shape (E1). Convergent design; validated the choice |
| **Beware score compression** | Liao's incorrect reps scoring 0.7–0.9 | Directly caused a fix this branch: see below |
| **Per-region rather than single-scalar feedback** | Liao's per-body-part branches, merged away before output | `FormScore.breakdown` per criterion; the summary names the criterion that fell short most often |
| **Live skeleton overlay on the camera, region-coloured** | RehabAR | `SkeletonOverlay` — required landmarks emphasised, amber when they are the problem |
| **Rep consistency across a set** | Neither ships it; the natural extension of per-rep scoring | `repConsistency()`, surfaced as a sparkline in the summary |

### The score-compression fix, concretely

Adding smoothness and phase-balance criteria diluted the primary one: a knee extension reaching 140° of a 165–180° target scored **68** — "pretty good" for a rep that missed the entire point. This is exactly the compression Liao et al. published (incorrect reps at 0.7–0.9). Two changes:

1. The criterion that *is* the exercise now carries dominant weight (4 of 8, vs 1 for each secondary).
2. `consecutiveFailedReps` — which feeds the safety gate — no longer uses a score cutoff at all. It asks **"did any criterion fail outright"**. A weighted average can sit above any threshold you pick while the primary criterion failed; the new rule is both truer and explainable, since the reason string already names which criterion.

---

## What we rejected, and why

**Porting either neural model.** Not a close call.

- The STGCN Keras graph uses `Lambda`-wrapped `tf.einsum` and raw tensor ops that TensorFlow.js's converter does not round-trip. Its weights are conditioned on a `StandardScaler` fit to Kinect metric depth coordinates — a different space entirely from browser pose output. Its 25-node NTU graph needs spine-chain, hand-tip and thumb joints that BlazePose does not provide, so the topology cannot be faithfully reconstructed.
- Both models emit **one score per completed repetition or ~100-frame window**, not per frame. Neither is causal: Liao's pipeline linearly resamples a *finished* rep to 240 frames before doing anything. Neither can drive a 24fps corrective cue, which is the product.
- ~2.2M parameters through four stacked LSTMs is inherently sequential and cannot be parallelised across timesteps.
- Neither repo ships usable weights (no `.h5`/`.onnx`), and Liao's entire metric/label pipeline is MATLAB. We would be retraining in Python and converting — for a signal we can compute directly.

This is not a rejection of the research; it is a rejection of putting a network in the per-frame path, which [ADR-0001](adr/0001-two-loop-architecture.md) already forbids for latency reasons and this analysis confirms on capability grounds too.

**The GMM template metric (deferred, not dismissed).** The single most interesting idea available: a 6-component GMM over ~5 dimensions is trivially evaluable in TypeScript — precompute `Priors/Mu/Sigma` offline as JSON, and per-frame cost is microseconds. Fitting it needs a corpus of *correct* repetitions captured through our own pipeline, which does not exist yet, and fitting it on synthetic fixtures would produce a confident-looking number backed by nothing. Recorded as a real option for when real captures exist.

**Their pain heuristics.** OpenRehabAgent's coefficients are hand-invented against no data, its features are unnormalised image-space distances, and its headline example is a body-proportion measurement labelled as pain. B1 remains out of MVP scope; when it is built, B6 already says inference generates a *question*, not a verdict.

**RehabAR's data flow.** Its primary path uploads camera frames to a server. It is the direct contrast case for our privacy architecture, not a precedent — we mined its interaction design and left its topology.

**Gamification (streaks, coins, badges).** Well-executed there, and genuinely tempting for a demo. Left out deliberately: this product's positioning is clinical trust, and points-for-reps pressures a patient toward volume over form — the opposite of what a rehab tool should reward. A patient in pain should feel able to stop.

---

## Honest limitations

- The temporal metrics are **plausible, not validated**. Smoothness as velocity coefficient-of-variation is a reasonable proxy for control; nobody has checked it against a physiotherapist's judgement of the same reps. Like the reference ranges, they are provisional.
- Half-point constants (`SMOOTHNESS_CV_HALF_POINT`, `STABILITY_STDDEV_HALF_POINT`) are chosen for sane behaviour on synthetic trajectories, not fitted to real movement.
- Our angle convention is the interior angle between two rays, bounded 0–180°, so it cannot represent hyperextension — see `STATUS.md`.
- None of this has been tested against a real camera and a real body. That remains the first thing to do.
