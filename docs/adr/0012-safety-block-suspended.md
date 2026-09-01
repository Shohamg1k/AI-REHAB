# ADR-0012 — The in-session safety block is suspended

**Status:** accepted
**Date:** 2026-09-02
**Feature:** E1, E3
**Amends CLAUDE.md invariant 3. This is the ADR that invariant requires.**

## Context

The real-time safety gate stopped a set and put a full-screen sheet in front
of the patient — *"We stopped the set"* — with the reason spoken aloud, at
urgent priority, pre-empting whatever else was being said.

**The product owner reports it fires wrongly and is irritating.** That matches
what the code does, and the mechanism is not mysterious:

1. **The thresholds are provisional.** Every exercise spec says so. They were
   reasoned from ordinary clinical norms and **no physiotherapist has reviewed
   them** — a long-standing blocker in `docs/STATUS.md`.
2. **The gate fires on a single frame.** `evaluateSafety` is called per frame
   and any one frame crossing a limit produces a `block`. Landmark estimates
   are noisy; a momentary spike — an arm briefly occluded, a hip landmark
   jumping — is enough. There is no persistence requirement, no debounce, and
   no confidence gate on the verdict itself.

An unvalidated threshold compared against a noisy per-frame signal produces
false positives. That is not a tuning problem, it is a design gap.

**And a wrong stop is worse than no stop.** A patient who is halted mid-set for
no reason learns to distrust the app. The next warning — including a correct
one — is noise to them. Crying wolf is an active harm in a product whose only
safety mechanism is the patient believing it.

## Decision

**Remove the in-session block entirely: no sheet, no speech, no dimmed
camera.** `SafetyBlockBanner` and the safety-reason localiser are deleted.

**Keep the gate running, and keep every verdict in the event log.** This is the
half worth preserving and it costs the patient nothing:

- `evaluateSafety` still runs per frame and still returns verdicts.
- `CoachedSession` still writes `safety_verdict` events verbatim.
- Those events still reach the clinician's report (F1).

So the signal is not lost — it moves from *interrupting the patient* to
*informing the clinician*, which is the right destination for a signal nobody
has validated yet. A physiotherapist reading "the trunk-lean rule fired 14
times across 3 sessions" can judge whether that means the patient is
compensating or the threshold is wrong. The patient could not judge either,
and was being stopped on it.

### What this changes about the product

**In-session, this is now a coaching and monitoring aid with no veto.** It
counts, scores, cues and records. It does not stop anyone. That is a smaller
claim than before and the docs say so.

Unaffected, because they were never the safety gate:

- **E3 — never tell a patient to push through pain.** Nothing here encourages
  continuing; the app simply stops asserting when to halt. The Groq coach's
  hard rules still refuse to push through pain and still escalate.
- **Pain reporting.** The "that one hurt" button and the spoken pain report
  still work and still reach the clinician.
- **Form cues.** Corrective coaching is unchanged.

### CLAUDE.md invariant 3

The invariant read: *"The safety layer is a pure function with veto… Nothing
may soften a `block` or `escalate` verdict downstream."*

Two of the three clauses still hold exactly: the layer is still pure, and
nothing rewrites a verdict — they are recorded as produced. **The veto is
suspended.** Leaving the invariant stating otherwise would make the working
agreement lie about the code, which is the failure mode this project has
already corrected once (the welcome screen's "nothing is uploaded"). It is
amended, with a pointer here.

## Reinstating it

This should come back. The conditions, in order:

1. **A physiotherapist reviews the thresholds** — the existing M1 blocker.
2. **The gate requires persistence, not one frame.** A block should need the
   condition to hold across a window (a rep, or N consecutive frames), and
   should require `captureQuality.requiredLandmarksOk` — scoring already pauses
   on poor tracking, and the gate should not be more confident than the scorer.
3. **A fixture proves the debounce**, per CLAUDE.md §4: a single-frame spike
   must *not* fire, and a sustained violation must.

Until those hold, the honest position is that we do not know enough to stop
someone mid-movement, and pretending otherwise trains patients to ignore us.

## Consequences

- The app no longer intervenes in an unsafe movement. **Stated plainly: this
  is a monitoring aid.** The non-medical-device framing (CLAUDE.md §6) was
  already the copy everywhere; it is now also literally true of the runtime.
- `isCommandAllowed`'s "speech cannot restart a blocked set" guard is retained
  and still tested, though nothing currently sets `blocked: true`. It is the
  correct behaviour the moment blocking returns, and deleting a tested safety
  guard to remove dead code would be a poor trade.
- The eval fixture library is untouched: it exercises `evaluateSafety`
  directly, which still behaves identically. 15/15 still pass, which is what
  makes reinstating this a UI change plus a debounce rather than a rebuild.
