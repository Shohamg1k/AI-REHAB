# Upstream divergence — services/rehab-engine

Per `CLAUDE.md` §3 ("Vendored upstream code → `services/rehab-engine/UPSTREAM_DIVERGENCE.md`").

## What was actually vendored

**Nothing verbatim.** No file from [OpenRehabAgent](https://github.com/rishavbhandari6789/OpenRehabAgent) is copied into this directory. `app/supervisor.py` adapts the *pattern* of upstream's `supervisor_agent.py` — the rule shape (pain thresholds, contraindicated-region matching, an intensity ceiling, an always-allow-`rest` fallback, a `SafetyDecision{allowed, blocked, reason, risk_level}` return shape) — written fresh against this project's own contracts and conventions, per the decision already recorded in `docs/UPSTREAM.md` §1.2: "**Adopt.** Clean, deterministic, already returns a reason string."

`app/main.py` extends upstream's `api/app.py` FastAPI-wrapper *idea* the same way — a thin HTTP layer over the pure decision function — again per `docs/UPSTREAM.md` §1.2 ("**Extend** into `services/rehab-engine`"), not a copy of its code.

## What was deliberately left out, and why

Per `docs/UPSTREAM.md` §1.2 and `docs/STATUS.md`, several of upstream's other agents were reviewed and explicitly **not** adopted in this pass:

- **`pain_localization_agent.py`** (B1) — invented, unvalidated weights (`pose 0.65 / self_report 0.35`) fusing pose-derived distance heuristics into a "pain" estimate. B1 is fast-follow (M3), needs re-weighting against a real dataset first, and — more fundamentally — this service takes pain severity as an *input* (`recent_pain_severity`, already self-reported per B2/B5), never computing it from pose itself. See `SuperviseRequest`'s doc comment.
- **`rl_agent.py` / `reward_model.py` / `state_encoder.py`** (D1/D2) — Q-learning progression policy. Fast-follow per ADR-0004 ("deterministic rule table first"); this service doesn't recommend *what's next*, only whether *right now* is safe.
- **`pose_agent.py`'s synthetic keypoint generator** — superseded by this project's own synthetic fixture generator in `packages/eval` (exact geometric construction, not upstream's approach); the *adapter* half of that file (accepting external landmarks) has no equivalent need here since `packages/core`'s landmark adapter already does this job client-side, in TypeScript.
- **`llm_explainer_agent.py`** — template explanations. Superseded by the planned Claude-backed conversation layer (C1-C5), not built yet.

## What this service does and does not do

**Does:** one HTTP endpoint (`POST /supervise`), evaluating a single session-level safety decision from already-computed inputs (target regions, a patient's known contraindications, self-reported pain, a consecutive-failed-rep count). Pure function underneath — `app/supervisor.py`'s `evaluate()` has no I/O, no clock reads, no randomness, mirroring the same discipline `packages/core/safety/gate.ts` (E1) holds itself to.

**Does not:** run in the per-frame path (that's E1, client-side, `packages/core/safety`), infer pain from pose, recommend a next exercise, or get called from the browser directly — per `docs/ARCHITECTURE.md` §1's rule that `apps/api` is the only thing that talks to this service.

**Not yet wired up:** no route in `apps/api` calls `POST /supervise` yet. The service is built, tested (12 tests, one per rule — see `tests/test_supervisor.py`, following the same "no fixture, no merge" discipline `packages/eval` applies to E1), and verified booting end-to-end via `TestClient` in this environment — but the *integration point* (calling it before returning success from program assignment, or at session start) is genuinely not built. See `docs/STATUS.md`.
