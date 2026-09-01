# ADR-0009 — LLM coaching assistant, and the end of the on-device-only posture

**Status:** ACCEPTED · Decided 2026-08-31 by the product owner

## The decision

Add a between-sets coaching assistant backed by a hosted LLM (Groq), and
**accept that derived patient data now leaves the device.**

This reverses part of ADR-0002. It was raised as a blocker and the product
owner resolved it: the product is more useful with a coach that can answer a
patient's actual question than with a promise that nothing ever leaves.

## What changed, precisely

ADR-0002 said video never leaves the device, and the product said, more
broadly, that *nothing* did. Those were two different claims and only one of
them survives.

**Still true, and still enforced:**
- Video never leaves the device. Pose runs in the browser, frames are closed
  as they are read, and `apps/patient/src/lib/privacy.test.ts` still fails
  the build if any file outside the reviewed network client touches `fetch`.
  The camera pipeline is untouched by this ADR.
- No landmark array is ever transmitted or stored (ADR-0002's other half).

**No longer true:**
- "Nothing is uploaded." Derived data — joint angles, rep counts, form
  scores, self-reported pain, safety events — is sent to Groq when a patient
  asks the coach a question.

## Consequences we accepted

- **A third party processes health-adjacent data.** Groq's terms and
  retention govern it, not ours.
- **The user-facing copy had to change.** This is not optional and is not a
  detail. An app that tells a patient "nothing is uploaded" while uploading
  their pain reports is lying to the person it is treating. The welcome
  screen and the sharing screen now say what actually happens. Changing the
  architecture is the product owner's call; misdescribing it to patients
  would not have been.
- **ADR-0006 (regulatory posture) is now load-bearing, not theoretical.**
  Cross-border processing of health data has jurisdiction-specific rules.
  This ADR does not answer them; it makes answering them urgent.

## Constraints the assistant operates under

These are enforced in the system prompt *and* in what the route is willing
to send, because a prompt is a request, not a guarantee.

1. **Never in the per-frame path.** ADR-0001 stands: the fast loop remains
   deterministic, offline, and model-free. The assistant runs between sets,
   on demand, from stored session facts.
2. **Never diagnoses.** It explains what the app measured. It does not name
   conditions, assess injuries, or predict recovery.
3. **Never overrides the safety gate.** The gate is a pure function with
   veto (invariant 3). The assistant is told what it blocked and why, and
   may only agree with it.
4. **Never tells a patient to push through pain** (E3). Pain escalates to
   the clinician, always.
5. **Never invents a number.** It is given the session's real figures and
   told to say when it does not know, rather than estimate.
6. **The API key stays server-side.** Calls go through `apps/api`. This is
   not a privacy point — a key shipped to a browser is a stolen key.

## What we did not do

- **We did not replace the deterministic report (F1).** Every observation
  there still carries the evidence it was derived from. Generated prose
  would read more fluently and be less checkable, which is the wrong trade
  for the document a clinician reads.
- **We did not let the LLM produce cue text.** Cues come from the exercise
  spec's cue table, per ADR-0001, and are shown mid-set where invariant 1
  applies.

## Revisit if

- A jurisdiction's rules make hosted processing untenable (ADR-0006).
- A local model becomes good enough to run the same conversation on-device,
  which would let us take the original promise back.
