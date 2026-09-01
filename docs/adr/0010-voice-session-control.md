# ADR-0010 — Voice control of a session

**Status:** accepted
**Date:** 2026-09-01
**Feature:** C7
**Supersedes nothing. Extends ADR-0002 and ADR-0009.**

## Context

A patient doing a rehab exercise is several feet from the device, usually with
both hands occupied and often on the floor. Every session control we ship —
start, pause, end, "that rep hurt" — requires walking back to the screen and
tapping it. The pain bookmark in particular is close to useless mid-set: by
the time the patient has reached the phone, the rep they wanted to flag is
several reps ago.

The browser can listen. `SpeechRecognition` is available in Chrome, Edge and
Safari, is free, and needs no dependency.

## Decision

**Ship spoken session control, off by default, opt-in from the Program tab.**

Five commands: start, pause, resume, end, and "it hurts (here)". Matched
against fixed per-locale phrase tables in `lib/voice/commands.ts` — a pure
function, no model. ADR-0001 keeps models out of the fast loop, and a patient
saying "pause" mid-rep needs an answer in that instant, not after a round
trip.

### What this costs, stated plainly

**In every shipping browser, `SpeechRecognition` streams microphone audio to
the vendor's servers.** In Chrome that is Google. This is not something we can
turn off or route around; it is how the API is implemented. So enabling voice
commands sends the patient's speech — including whatever else is audible in
the room — to a third party.

That is a bigger step than ADR-0009. Groq receives a small, shape-constrained
struct of derived numbers that `CoachSessionFactsSchema` defines exhaustively.
Speech recognition receives *audio*, unbounded in content, and we cannot
constrain what a patient or their family says near a live microphone.

Consequences we accept, and the limits we put on them:

- **Off by default, and only turned on by an explicit checkbox** that states
  where the audio goes, in the patient's own language, above the switch rather
  than in a policy page below it.
- **The microphone runs only during an exercise** — `enabled` is false outside
  the setup and live phases, and the recogniser is aborted, not merely
  stopped, when the screen unmounts.
- **No audio is recorded or persisted by us**, and neither is the transcript.
  What reaches the event log is the matched command, and for a pain report the
  body region — never the raw phrase. Recognisers mishear, rooms contain other
  people, and a verbatim transcript in a clinical log is a liability with no
  corresponding benefit.
- **ADR-0002 is unaffected.** This is audio, not video. Frames still never
  leave the device.

### Safety

**A spoken command cannot restart a set the safety gate has blocked.**
`isCommandAllowed` lives in the same pure module as the matcher, so no call
site can skip it, and it is tested. `start` and `resume` are refused while
`verdict` is `block` or `escalate`; `pain` and `end` stay available, because a
blocked patient still needs to report and still needs to leave. This is
CLAUDE.md invariant 3 — nothing downstream may soften a block, and a voice
command is downstream.

**The matcher is deliberately asymmetric.** Mishearing something as "pause"
costs the patient a tap. Mishearing something as "resume" restarts a set they
wanted stopped, possibly while they are hurt. So pain and stop-like phrases
are matched first and loosely; go-like phrases are matched last and only when
nothing else in the utterance matched. "My knee hurts but let's go" is a pain
report, not a start.

### Pain reports and B6

A spoken "I felt a little pain in my shoulder" is **self-report**, which is
the kind of pain data B6 wants — it is the patient's own account, not an
inference from movement. But "a little" is not a number, and turning it into
one would be exactly the fabrication B6 exists to prevent.

So a heard pain report writes a `pain_bookmarked` event with the rep index and
the region, and nothing else. Severity comes from the existing check-in, where
the patient chooses it on the 1–5 scale themselves. The `region` field on that
event has existed since G1 and has always been written as `null`, because the
button has no way to know where it hurt. Speech does.

## Alternatives considered

**An on-device recogniser (Vosk, Whisper WASM).** Would keep audio local and
remove the third-party entirely. Rejected for now on size: the smallest useful
multilingual models are 40–50 MB *per language*, on top of the 30 MB pose
model already downloaded, and this is an app people use on phones. Worth
revisiting if the privacy cost proves unacceptable to a real deployment — it
is the correct answer, just not the affordable one today.

**A wake word.** Would cut what gets transmitted to phrases after "hey coach".
Rejected because a patient in pain will not remember a wake word, and the one
command that most needs to work is the one they will say without thinking.

**Nothing.** Rejected: the pain bookmark is the feature this most obviously
unblocks, and it is one of the few things in the product a clinician actually
acts on.

## Consequences

- **The regulatory question in ADR-0006 gets harder, again.** Voice data in a
  health context has its own treatment under several regimes, and this now
  needs answering before any real deployment, not after.
- Firefox has no `SpeechRecognition`; the feature is absent there and the
  settings card says so rather than showing a switch that does nothing.
- Recognition quality for Hindi, Spanish and French is the vendor's, not ours,
  and we have not measured it. The phrase tables carry both Devanagari and
  romanised spellings for Hindi because recognisers disagree about which they
  emit.
