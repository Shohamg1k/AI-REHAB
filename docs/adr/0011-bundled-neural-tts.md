# ADR-0011 — A voice that ships with the app

**Status:** accepted
**Date:** 2026-09-02
**Feature:** H9
**Extends ADR-0002 (assets served from our own origin). Does not change what leaves the device: nothing does.**

## Context

H9 gave patients four languages. It also exposed the limit of the Web Speech
API: **it can only use voices the operating system already has.** On the
development machine — Windows 11, English (India) locale — there are eight
English voices and no Hindi one. The app handled that honestly (captions in
Hindi, speech in English, and a note saying so), but the honest handling of a
missing feature is still a missing feature.

"Install a Hindi language pack" is not an answer for a patient doing knee
rehab on a borrowed laptop.

## Decision

**Ship a neural voice with the app**, staged into `apps/patient/public/tts` by
`pnpm setup:tts` and served from our own origin.

Piper: espeak-ng (compiled to wasm) turns text into phoneme ids, and a ~60MB
VITS ONNX graph turns those into 22kHz PCM. Both run in a Web Worker.

### Measured, before designing around it

| Stage | Node spike | **Browser (what ships)** |
|---|---|---|
| Phonemize (incl. wasm init) | 151 ms | — |
| ONNX session create | 7.7 s, once | ~10 s, once |
| First synthesis (cold) | — | **12.9 s** |
| Warm synthesis | 1.42 s / 2.66 s audio | **~5 s / 3.6 s audio** |
| Cache hit | — | **0.5 ms** |

**The browser is 3–4× slower than the Node spike, and the design changed
because of it.** Node uses native onnxruntime; the browser runs single-threaded
wasm, because threaded wasm needs cross-origin isolation (COOP/COEP) that this
app cannot assume of whoever deploys it.

**Five seconds is far too slow to correct someone mid-rep.** A cue that arrives
after the rep it describes is worse than one that never arrives. This number
determined the whole design:

- **Cue audio is rendered ahead of time.** The cue set for an exercise is small
  (5–7 lines), known in advance, and fixed data (A6), so it can be synthesised
  before the set and played from memory in half a millisecond.
- **It starts when the session mounts, not at the countdown.** The first
  version rendered during the 10-second countdown; the browser measurement
  killed that — six cues is ~30 s of work. It now begins at the exercise intro
  and runs through framing and the countdown, which is a minute or more in
  practice. Cues render in the spec's own priority order, so a patient who
  rushes still gets the lines most likely to matter.
- **Anything not pre-rendered falls back to the device voice.** Safety reasons
  quote live numbers (`"Trunk lean (34.2°) crossed…"`) so they cannot be
  rendered in advance. The device voice starts speaking immediately, which for
  a safety message is the property that matters. On a device with no voice for
  the locale that message is still captioned in full on the safety sheet —
  spoken output is never the only channel (CLAUDE.md §4).
- **A worker, not the main thread.** ADR-0001 gives the per-frame path a 40ms
  budget; a 5s synchronous block would destroy the capture loop.

### Not run on install

`pnpm install` already pays 30MB for the pose model, which the product cannot
work without. This is another ~83MB that only matters where a device lacks a
voice, so it is a separate opt-in command. **Absent assets are a supported
state**: `manifest.json` is missing, `bundledVoiceFor` returns null, and
everything falls back to device voices.

Note what "everywhere" means as a result. This is a web app: the operator runs
`pnpm setup:tts` once on the machine that serves it, and then *every visitor*
gets a Hindi voice regardless of their device. That is the sense in which this
makes Hindi work everywhere.

### We call Piper's artefacts directly, not its wrappers

Both published wrappers hardcode jsDelivr, cdnjs and a Hugging Face mirror —
and that mirror has **no Hindi voice at all** (38 languages, Hindi not among
them). They are also thin: `callMain` on the phonemizer, one ONNX session, and
three tensors. Calling them ourselves preserves the "no CDN at runtime"
property the pose assets already have, and lets us use a voice the wrappers
have never heard of.

The phonemizer is a UMD bundle and our worker is a module worker, where
`importScripts` does not exist. The staging script re-emits it with an
`export default` appended rather than making every deployment allow
`unsafe-eval` for one file.

## The licence problem, which is real

**Every Piper Hindi voice is encumbered.** Checked, not assumed:
`hi_IN-pratham-medium` and `hi_IN-priyamvada-medium` are **CC BY-NC-SA 4.0**;
`hi_IN-rohan-medium` is under a bespoke IIT Madras agreement whose terms are
not public.

The product owner was asked directly and **confirmed this project is
non-commercial**, which makes CC BY-NC-SA usable. Consequences:

- The attribution and the non-commercial term are rendered in the Settings
  card, not buried in a repo file.
- `BUNDLED_VOICES[].nonCommercial` is a flag in code, so the constraint is
  visible at the place a second voice would be added.
- **If this project ever goes commercial, this ADR is the blocker**, and the
  fix is not "swap the voice" — there is no permissive Piper Hindi voice.

### The permissive route, and why it is not this one

**Kokoro-82M is Apache-2.0 and has four Hindi voices**, with one 80MB model
covering English, Hindi, Spanish and French. It would be strictly better on
licence and on size. It was rejected on a technical blocker, verified rather
than assumed: `kokoro-js` refuses non-English voices, and the `phonemizer`
package the JS ecosystem depends on is an **English-only** espeak-ng build —
`hi`, `es` and `fr` all return "Invalid language identifier".

Piper's wasm *is* a full 113-language espeak-ng build (`hi_dict` and
`lang/inc/hi` are both in it). That is the entire reason this route works
today and the Apache-licensed one does not.

**Compiling espeak-ng to wasm with full language data is the unlock**, and it
would let the voice move to Apache-2.0 without changing `ttsWorker.ts` at all.
That is the right next move if the commercial answer ever changes.

## Consequences

- ~83MB of staged assets, gitignored, fetched on demand.
- espeak-ng is GPL-3.0. It runs as a separate, unmodified wasm artefact that
  we neither link nor modify, which is the same posture as invoking the
  `espeak` binary. **This should be confirmed by a lawyer before any
  distribution**, and it is recorded in `docs/UPSTREAM.md` §5 rather than left
  implicit.
- Nothing leaves the device. Synthesis is local; this *reduces* third-party
  exposure relative to a hosted TTS, and unlike ADR-0010 it adds no network
  path at all.
- The bundled voice cannot say anything it has not been given in advance
  without a ~5s wait. That constraint is now load-bearing: **anything added
  to the spoken channel later must either be pre-renderable or accept the
  device-voice fallback.**
