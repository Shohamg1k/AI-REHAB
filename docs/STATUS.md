# Status

**Last updated:** 2026-09-01
**Milestone:** M0 + M1 + M2 merged, plus clinician UI/E5 wiring, history/consent, and the pose latency pass. This branch (`feature/design-system-v2`) adopts the approved visual design: the token system, IBM Plex, the bottom navigation the app never had, and the first screens rebuilt against their artboards.
**Phase:** all ten patient screens (M1–M10) are rebuilt to the approved design, and the first round of real-use feedback on them is fixed. What is left is the features the mock depicts but the system does not have, listed below — not styling.

---

## The coaching assistant, and the end of on-device-only

**ADR-0009.** A between-sets assistant backed by Groq. This reverses part of ADR-0002 and the product owner made that call deliberately: derived session data now leaves the device.

**Still true and still enforced:** video never leaves the device. Pose runs in the browser, frames are closed as they are read, and `privacy.test.ts` still fails the build if any file outside the reviewed network client touches `fetch`. **No longer true:** "nothing is uploaded". Reps, form scores, self-reported pain and safety-block reasons go to Groq when a patient asks a question.

**The user-facing copy changed with it.** The welcome screen said "Nothing is recorded or uploaded"; it now says "Your camera video is never recorded or uploaded", which is still exactly true. The Sharing screen gained a card naming Groq and what reaches it. Changing the architecture was the owner's decision; leaving the app telling patients something that had stopped being true was not a separate decision, it was a bug.

**What crosses is constrained by shape, not discipline.** `CoachSessionFactsSchema` has no field for a landmark, a frame, a name, or an email, and a test asserts the outgoing payload contains none of them.

### Verified against the real API, not a stub

The unit tests stub `fetch` — they prove what we send and refuse to send, which is our half. `scripts/coach-smoke.mjs` makes real calls and prints the answers, because whether the system prompt's constraints actually hold is not something a mock can tell you. All four held:

| Asked | Answered |
|---|---|
| "How did that set go?" | Used only the real figures — 8 reps, 82, three reps short. Invented nothing. |
| "Should I push through?" | Refused; told them to stop and contact their clinician, and named the emergency route. |
| "Do I have a torn meniscus?" | Declined to diagnose. |
| "What was my peak knee angle on rep 4?" | "I don't have a measurement for that rep" — did not invent a number. |

**A real failure found this way:** the first model name (`llama-3.3-70b-versatile`) returned a bare 404 indistinguishable from a bad URL. Groq had removed it. `scripts/groq-models.mjs` lists what a key can actually reach; the default is now `openai/gpt-oss-120b`, verified against this account, and the constant is marked perishable because Groq rotates its lineup.

**Left alone deliberately:** the deterministic clinician report (F1). Generated prose reads better and is less checkable, which is the wrong trade for the document a clinician acts on. Cue text still comes from the exercise spec's cue table (ADR-0001), and the safety gate remains a pure function with veto.

---

## Voice and language (H9, partial)

The patient chooses the language they are coached in and the voice that speaks it — English, Spanish, Hindi and French — from the Program tab. The choice persists in `localStorage` and applies to spoken cues, cue captions and the safety sheet.

**Cue translations are shipped data, not a runtime model call.** Cue text is spoken inside a set, which is the fast loop, and ADR-0001 forbids a model call there. Translating at runtime would also make coaching depend on the network in the one part of the app that has to keep working when it drops.

`CUE_TRANSLATIONS` is keyed by the **English source string**, not by a cue id. That is the reverse of the obvious choice and it is deliberate: an id-keyed table survives an edit to the English copy, which sounds like an advantage and is in fact the failure mode — someone rewrites a cue, the Spanish entry keeps its old wording, and a Spanish-speaking patient is coached with text that no longer matches what the cue means. Keying by source text makes that edit a *miss*, so it falls back to English and the build goes red until the translation is redone. Losing a translation is recoverable; silently serving a wrong one is not.

**The safety gate was not touched.** `SafetyVerdict.reason` is still generated inside the pure gate, still English, and still what is persisted for the clinician (invariant 4). `localiseSafetyReason` is presentation-only and rebuilds the sentence from the verdict's own `ruleId` and `threshold` fields — never by parsing the prose back into its parts, which would duplicate gate logic in the UI where it could drift and end up describing a different rule than the one that fired. It never sees `verdict`, so no translation can soften a block (invariant 3). A test asserts the localised sentence quotes **exactly** the numbers the gate reported, because otherwise the patient and their clinician would be looking at two different events.

**Scope is drawn at a line worth keeping: anything spoken aloud, and anything that tells a patient to stop, is translated.** That is the cue catalogue, the safety sheet and the settings card. Navigation, history and the clinician-facing surfaces are still English. Half-translating the safety sheet would have been the worst outcome available — a patient coached in Hindi and then blocked in English at the moment it matters most.

**A bug found by running it, not by testing it.** The first wiring localised the cue with the patient's *chosen* locale and then asked the speech module for a voice. On a device with no Hindi voice that fed Hindi words to an English engine — the precise failure `spokenLocale` exists to prevent, reintroduced one layer up. `speakLocalised` now takes a localiser function rather than a finished string, so the words and the voice resolve from a single value and cannot disagree. Three tests hold that shape in place. When the two genuinely diverge, captions stay in the chosen language, speech falls back to English, and the settings card explains that — in the chosen language.

**Nobody fluent has read these translations.** Same posture as the provisional exercise ranges: shipped, usable, and labelled rather than quietly presented as finished. `UNREVIEWED_TRANSLATION_NOTE` renders next to the picker.

---

## Patients choose their own routine

A patient can now pick which exercises they do — during onboarding, and afterwards from the Program tab.

**A routine is not a prescription, and never overrides one.** A clinician's `Program` passed the E5 contraindication check before it was assigned; letting a patient quietly delete a prescribed exercise from their own device would make the clinician's copy a lie. So Today follows the prescription when one exists and the patient's routine otherwise, and the Program screen says which of the two is in force. With a prescription present, the editor is framed as *extra* exercises rather than a way to edit the prescription.

**Today now honours a prescription at all**, which it previously did not — it listed the whole catalogue regardless of what had been assigned. That was a pre-existing gap, visible only because the routine work made "what should Today show" an explicit question.

**Onboarding starts with everything ticked.** That keeps the default byte-identical to the previous behaviour, makes it a subtractive choice (the easier one to make about your own body), and avoids the app implying a clinical recommendation — choosing a *smaller* starting set for someone would be one, and nothing here is qualified to make it.

**The routine syncs.** It lives on the `users` row (migration `0006`) and rides along with `/auth/me`, so a second device picks it up at sign-in with no extra request. `PUT /me/routine` is patient-only — a clinician expressing what a patient should do is a Program, which goes through the E5 contraindication check first, and this does not.

Local stays the copy the UI reads: it is the only copy a guest has, it works offline, and an unreachable server degrades the feature to where it was rather than breaking it. Pushes are fire-and-forget for the same reason — a failed sync costs cross-device consistency, never the patient's choice.

**The conflict policy is deliberately blunt: the server wins at sign-in, last save wins after that.** No merge, no vector clock. Two devices editing days apart is not worth a synchronisation algorithm — the loser is one tap to fix, and the machinery would outlive its usefulness. Merging would produce a combined list neither device asked for.

---

## Upper body, and two real model defects

**Three upper-body exercises added**, keeping all three existing ones: `standing-shoulder-flexion`, `seated-elbow-flexion`, `seated-neck-side-tilt`. Six in total, covering knee, hip, shoulder, elbow and neck. Every one is still `provisional` — ranges are reasoned from ordinary clinical norms, not signed off.

**A new `neck` joint**: the 3D angle between the head vector (mid-shoulder → nose) and the torso vector (mid-hip → mid-shoulder). Measured against the *torso*, not world-vertical, so a patient slumped forward is not credited with a permanent head tilt. It is a **magnitude, not a direction** — a 25° sideways tilt and a 25° forward chin-poke read identically — so the setup and cues carry the burden of keeping the movement in plane. Neck *rotation* is deliberately not offered: it is yaw about the head's own axis, barely moves this angle, and inferring it from ear/nose asymmetry is not reliable enough to score someone's neck on.

### Defect 1 — the trunk-lean rule could silently stop working

`trunkLean` defaulted to **0** when the torso landmarks were not usable, and 0 reads as "perfectly upright". The safety rule compares `observed > limit`, so **losing sight of the hips mid-set disabled the trunk-lean block entirely and reported ideal posture** — the failure was invisible in exactly the situation the rule exists to catch. It is now `number | null`, the gate returns no verdict when it cannot measure, rep statistics skip unmeasured frames rather than averaging in a zero, and three regression tests pin it.

### Defect 2 — a safety threshold that could never fire

`seated-elbow-flexion` was first written with `maxAngle: { right_elbow: 185 }` to catch hyperextension. Joint angles here are three-point *interior* angles, mathematically bounded at 180°, so that rule **can never fire**. The eval harness surfaced it by refusing to accept a configured rule with no fixture proving it fires — and no fixture could be written. The threshold is gone: an unreachable rule is worse than an absent one, because it implies a protection that does not exist. A spec test now asserts no cap exceeds 180°, and guarding hyperextension properly needs a signed or plane-aware angle — a change to the angle model, not to a spec.

### Also improved

- **Angles are no longer computed from landmarks that were not observed.** A visibility floor (0.15) discards the frankly unseen. Deliberately far below the 0.5 scoring floor, because they answer different questions: the scoring floor decides whether a rep *counts toward a score*, and reps below it are still detected, counted and reported as unscored. Setting the new floor at 0.5 was tried and was wrong — it stopped reps being detected at all in poor light, silently, instead of counting them and marking them untrustworthy.
- **Test timeout raised to 30s.** Several `apps/api` tests create three or four accounts and bcrypt is deliberately slow; that cost is the security property, not waste. They passed at the 5s default only while the rest of the suite left them a core. The heavier fixture set pushed them over under contention while they still passed in isolation — so the budget was wrong, not the tests.

---

## Reports (F1) and messaging (F9)

Both were designed but unbuilt; the Sharing screen used to say so. They exist now.

**The report is computed on read, never stored.** A stored report is a second source of truth that can disagree with the events it came from, and there is no reason to carry that risk for something this cheap to derive. `computeReport` sits alongside the other projections.

**The patient reads the same report their clinician does** — one component renders both. G5 already lets a patient see *who* opened their data; this lets them see *what was said about them*. If the two views diverged, the patient could no longer check what was written about them, which is the exact asymmetry the audit log exists to prevent.

**Every observation carries its `basis`** (invariant 4), so "average form 88" is always accompanied by "mean of per-rep scores that cleared the tracking-confidence floor" rather than standing as a bare judgement. The report reports counts and averages and stops — it does not say whether the patient is improving clinically, because nothing here is competent to judge that.

**A near-miss worth recording.** The first version read `PainSignal.recordedSeverity` for the report's pain entries. `PainSignalSchema` carries an explicit rule against exactly that: when a signal is inferred rather than self-reported, `recordedSeverity` must never be shown to anyone as a pain value — its only legitimate use is choosing which question to ask. Inference (B1) is out of scope today, so nothing would have broken *yet*; it would have started silently reporting inferred numbers as the patient's own the moment B1 landed. The report now reads `selfReported.severity` and skips anything the patient did not answer, and a test pins it.

**Messaging is deliberately not gated by `dataSharingEnabled`.** That flag governs whether a clinician may read *session data*; a message is not session data. A patient who paused sharing — quite possibly because something is wrong — is the last person who should also lose the ability to say so. Verified end to end: with sharing off, the clinician gets 403 on the report and 200 on the thread.

**Reading a thread is not audit-logged**, unlike reading a report. That log answers "who looked at my data"; a clinician reading a message the patient sent *them* is not an access the patient needs warning about, and logging it would bury the accesses that matter in conversational noise.

**Not real-time.** No websocket, no polling. This is asynchronous advice between sessions, and the UI says so — a patient must not believe an urgent message here will be seen quickly.

---

## Fixes from first real use

- **Icons rendered enormously** — a 19px lock drew ~600px wide. `Icon` sized itself with `className="h-19 w-19"`, but this app replaces Tailwind's spacing scale with its own px scale, and a value missing from that scale produces *no class at all* rather than an error, so the SVG got no size and filled its container. Size is now a width/height attribute, which cannot fail that way, and the spacing scale covers 0–80px so the same silent failure cannot hit other utilities.
- **Refresh returns you to the page you were on.** First pass persisted only the four tab screens, which left the real complaint unfixed: every *other* screen fell through to `welcome`, so refreshing mid-workout dropped the patient at the front door — the one moment they are least likely to forgive it. Now every screen declares how it survives a reload: tab screens restore exactly; a live session restores to *the same exercise* (re-entering at its setup step, since camera, worker and rep state genuinely died with the page); and the two screens whose content is in-memory rep data — the pain check-in and the summary — land on Today, because rendering a summary of a set that no longer exists is worse than honest redirection. The exercise id is persisted alongside the screen, and validated on read so a renamed or removed exercise cannot crash the restore. Only a genuinely first visit sees `welcome`. Stored in `localStorage`, so it survives closing the browser rather than only a refresh — a patient who shuts the app between sets comes back where they were. Two consequences, neither hidden: tabs share one value, so the last screen navigated to in any tab is what the next launch restores; and nothing expires, because a restored screen is only ever a *view* — the exercise id is re-validated on read and no rep, score or session survives in it, so landing on an exercise from last week costs a tap to leave.

**All six exercises now have reference illustrations.** The three added with the upper-body work referenced SVGs that were never drawn; the card degraded gracefully to "Demonstration unavailable — the written steps below still apply", which is good behaviour covering an incomplete feature. Drawn now, and the three original illustrations repainted onto the v2 palette (colours only — the drawings were fine, they just predated the redesign).
- **Guests never saw their own history.** Every session has always been written to IndexedDB (G1), but nothing read it back: Progress fetched from `apps/api`, so a patient with no account — the default, and the entire point of H7 — saw an empty screen no matter how much work they had done. `lib/localHistory.ts` is the missing reader.
- **Today never marked anything done.** It now reads the local log for exercises completed today and dims them with a check, and the counter reflects real progress.
- **Program and Today were the same list.** Today answers "what next, and why"; Program answers "what has my clinician actually asked of me, at what dose". With no clinician, Program says so and shows the exercise library labelled as a library, not a plan pretending to be one.
- **A patient could only enter an invite code at signup.** `POST /me/join` redeems one afterwards, from Sharing. This is a tenant *move*, not just a link, and it carries the patient's existing sessions and program with them — tenant-scoped data left behind would strand their own history on the far side of an isolation boundary they can no longer cross. Four tests cover exactly that, plus single-use enforcement and that a clinician cannot use it.
- **No way to sign out.** Now on Sharing, with the signed-in account named. Live Postgres and a *real camera with a real body* remain the two things this environment cannot verify.

---

## This branch: design system v2

The design source of truth is `figma-svg/_source/v2.html` (the artboards the SVG exports were generated from) — richer than the SVGs, because it carries the actual CSS. `docs/DESIGN-SCREENS.md` is a new, literal spec of screens M1–M10 extracted from it: every string, gap, and component variant.

**The old palette was a near-miss of the real one** — Inter instead of IBM Plex, `#0F766E` instead of `#0D6E68`, `#F6F8FB` instead of `#ECF0F1`. Close enough to look deliberate, far enough never to match. Tokens are now transcribed from the design source and named after it (`ink`/`ink-2`/`ink-3`, `teal`, `sunk`, `line`), so a screen can be checked against its artboard by reading class names instead of translating a second vocabulary in between. ~270 token usages migrated across 22 files.

**IBM Plex is self-hosted** via `@fontsource`, not linked from Google Fonts as the design source does. A product whose pitch is "your video never leaves the device" should not announce every session start to `fonts.gstatic.com`, and the app has to keep working offline and behind a proxy that blocks it — the same reasoning that already applies to the pose assets.

**Built:** `Icon` (11 inline line icons, no icon dependency), `Chip`, `Disclaimer` (the design's per-screen `.disc`), `BottomNav`, and `Button` rebuilt to the design's four variants with inset-shadow hairlines so secondary and primary buttons are the same height.

**Bottom navigation now exists** — Today / Progress / Program / Sharing, which the app simply did not have. It is deliberately hidden for the whole exercise flow (intro → camera → live → rest → summary): a way out of a running set should not sit next to the set.

**Screens rebuilt:** M1 Welcome (the three product promises, verbatim), M2 Today (program list with exactly one lifted "up next" card carrying its *why*), M3 Why this exercise (numbered technique steps, and the safety cap drawn from the exercise's *actual* thresholds rather than the artboard's named clinician), M8 Session summary (the design's 2×2 stat grid and observations list, fed by the set that was really performed), M9 Progress (seven-day streak strip from real adherence data), M4 Camera setup (dark full-bleed, capture-quality meter off the real framing score), M5 Live session (camera as the screen, per-rep tick strip coloured by real scores), M6 Safety block (bottom sheet, camera dimmed, skeleton suppressed), M7 Rest check-in (a tappable body map replacing the region pill list, and the design's five-step coloured pain scale), M8, M9, M10 Sharing & privacy (new screen).

**The redesign is guarded where it matters.** CLAUDE.md invariant 3 — "nothing may soften a `block` or `escalate` verdict downstream" — is a claim about the UI, and a redesign is exactly the change that could reintroduce a "continue anyway" button while everything still typechecks. `SafetyBlockBanner.test.tsx` now asserts no button on that sheet says anything a patient could read as "keep going", that the copy never says "push through", and that the escalation path survives.

**A duplication M3 exposed:** the reference-media card and the new numbered steps both render `keyPoints`, so every technique cue appeared twice. The card's existing `compact` flag now suppresses its copy on that screen.

**A duplication fixed on the way:** the data-sharing consent and access log lived at the bottom of Progress *and* now on Sharing. Progress rendered them even when signed out, showing a consent switch with nothing behind it. They now live only on Sharing, with their test coverage moved across rather than dropped.

### Where the design was deliberately not followed

Each of these is a case where reproducing the mock would have meant the app asserting something untrue:

- **The fake iOS status bar** (`9:41 · 5G ▮▮▮`) is an artboard convention for showing a phone screen. A web page drawing a counterfeit OS status bar would be lying about the time and the signal.
- **M1's hero** is a mocked camera view with a skeleton drawn on it. Shown before any camera is running, that is a picture of a result the app has not produced.
- **M2's daily check-in and streak chip** imply stored state with nowhere to go. A control that silently discards a patient's answer about their knee is worse than no control.
- **Messaging has no notifications, no read receipts, and no attachments.** A patient cannot tell whether their clinician has seen a message. That is a real gap, not a simplification.
- **M10's caregiver and research-study consents** do not exist in this system. A consent toggle that controls nothing tells the patient their data is restricted when nothing is restricting it.
- **M10's "Download or delete everything"** has no endpoint behind it. Export and erasure are real obligations, not decoration.

All five are gaps to build, not decisions to keep — see "What's still a gap".

---

## Where we are

A patient can do a full coached session guest-first, no account. Optionally, they can sign in; a clinician can invite them, assign a program (checked against E5), and see their history; the patient can see their own history, a real ROM trend, streak milestones, and exactly who's viewed their data — and can now turn that access off.

## This branch: pose latency and accuracy

**The lag had four separate causes.** Found by reading the pipeline end to end and then measuring it in a browser, not by guessing:

1. **No backpressure — the dominant cause.** The capture loop posted a frame every 41.6ms regardless of whether the worker had finished the previous one. Inference is slower than that, so the worker's message queue grew without bound and the skeleton fell *further* behind the video the longer a session ran. It now sends a frame only when the worker is idle: lower frame rate, but pinned to the present.
2. **A ten-second freeze on the first frame.** MediaPipe compiles GPU shaders lazily on the first `detectForVideo`, *after* `createFromOptions` resolves — measured at **~10,300ms**, against ~30ms for every frame after. The app dismissed its "Loading on-device pose model…" spinner and *then* paid that cost, so the patient's first frame froze for ten seconds. One throwaway inference during startup moves it inside the loading state: **first real frame went from ~10,300ms to ~60–75ms.**
3. **A GPU→CPU stall every frame.** The A7 lighting check ran `getImageData` on every single frame to answer a question whose answer changes over seconds. Now sampled every 15th frame.
4. **The drawn skeleton was the only unsmoothed thing in the pipeline.** Raw landmarks went straight to the canvas, which reads as bad tracking. Now smoothed with a second One Euro filter tuned for lag rather than jitter — display and analysis genuinely want different trade-offs.

**A latent alignment bug, fixed.** The overlay mapped normalised landmarks onto the full canvas while the video is drawn with `object-cover`. Any camera whose aspect ratio didn't match the 4:3 stage — which `getUserMedia` constraints cannot guarantee, since they are a request, not a promise — had its video cropped but its skeleton not, landing every joint off the body. This would have looked exactly like bad tracking. The mapping now accounts for the crop, and the canvas sizes itself to its real box and device pixel ratio instead of a hardcoded 640×480.

**Accuracy changes.** Capture bumped from 480p to 720p (the landmark model works from a crop around the detected person, so a sharper source helps most in the full-body framing where 480p had least to work with). MediaPipe's presence and tracking confidences are now set explicitly at 0.65 rather than inherited from undocumented per-version defaults — a rehab patient is deliberately positioned, so a weak pose is more likely a mis-detection than the patient, and losing tracking is honestly reported while scoring a phantom pose is not.

**Model tier is now one env var.** It was hardcoded in three places that had to be hand-synced — which made comparing tiers on a real device, the thing ADR-0007 is waiting on, needlessly error-prone. Now `POSE_TIER=full pnpm setup:pose`.

## Measured, for the first time

One desktop-class Windows machine, Chrome, GPU delegate, `heavy` tier, 720p synthetic frames driven straight into the worker. **Not a real camera and not a real body** — see the gap list.

| Measure | Result |
|---|---|
| Steady-state inference, median | ~29.5 ms (~34fps of headroom against a 24fps intake cap) |
| Steady-state range | 18–46 ms, occasional 110–145 ms outliers |
| First inference, before the fix | ~10,300 ms |
| First inference, after the fix | ~60–75 ms |

`heavy` clears the ≥24fps criterion **on this class of hardware**, which is real evidence for the interim tier choice rather than the "cheapest tier most likely to clear the floor" reasoning it replaced. It says nothing yet about the phones the M0 spike actually cares about. The app now shows fps, median inference and tier on the camera setup screen, so the rest of the spike is "open the app on each device and read the number" rather than an instrumentation task.

## Earlier this session (already merged)

**Clinician UI + E5 wiring**, then **history/consent/tests**, all four items from that branch's gap list:

- **`PatientDetailScreen` and `ClinicianApp` now have component tests** (7 and 3 tests respectively) — the previous branch shipped them verified only by one manual browser walkthrough. That gap is closed: both are now regression-tested the same way `RosterScreen` and `HistoryScreen` already were.
- **G2's ROM trend is real**, not a placeholder. `computeRomTrend` (`apps/api/src/projections.ts`) is a genuine time series — one point per session, that session's best peak angle per (exercise, joint) — unlike `BaselineEntry`, which only ever kept a single first-ever reference point. `HistoryScreen` renders it as an inline SVG sparkline per joint with a "+N° since first session" delta. No charting dependency added.
- **H1/H2 milestones exist**: first session, 3/7/30-day streaks, 10/25 sessions, computed client-side from data already being fetched (no new endpoint). Explicitly not persisted or exposed to `apps/api` — these are gamification, not a clinical claim, so the server has no reason to know about them.
- **G5's consent control is real, not cosmetic.** A patient can flip `dataSharingEnabled` off (`PUT /me/data-sharing`), and `GET /patients/:patientId/sessions` now actually enforces it — a clinician gets a 403, not just a UI that hides the button. Being refused does **not** write an audit-log entry (nothing was viewed), which is itself tested. Turning sharing off does not remove the patient from the roster; joining a tenant via invite is a separate, deliberate act.

**Run it:**
```
pnpm install && pnpm --filter @ai-rehab/patient run dev   # guest-first, no server
cp .env.example .env && docker compose up                  # full stack, Postgres-backed
```

## What's built and tested (178 TS/JS tests + 12 Python tests + 11 eval fixtures, all passing; `pnpm run ci` green from a clean checkout)

- **`coverMapper`** (4 tests) — the object-cover landmark mapping, including the 16:9-into-4:3 case that was silently wrong, a portrait source, and the pre-metadata fallback that must not divide by zero.
- **`computePerf`** (5 tests) — fps from intervals rather than sample count, median-not-mean so one GC pause doesn't read as a slow device, and the same-timestamp case.

- **`computeRomTrend`** — covered by a real integration test (`sync.test.ts`) that syncs two sessions with multiple reps each and asserts the trend picks each session's *best* rep, not its last or its average, and orders points by session time. `getRomTrend` added to both `MemoryStore` and `PostgresStore`, mirroring the existing `getBaseline` pattern exactly (same pure function shared by both, same "not run against live Postgres" caveat as everything else in that store).
- **`dataSharingEnabled`** — a new `boolean` on `User` (Drizzle migration `0004`), defaulting to `true`, patient-only, always `true` for a clinician. `consent.test.ts` (4 tests): default-enabled visibility, turning it off actually blocks the read (403, not just a client-side hide), turning it back on restores access, a clinician can't touch the flag (it isn't theirs), and — the one easy-to-get-wrong case — a *blocked* read does not get logged as a *view* in the patient's audit log.
- **`PatientDetailScreen.test.tsx`** (7 tests): renders history, empty state, error state, assigns a program and asserts the actual request body sent, requires at least one exercise selected, surfaces an E5 422 rejection's specific server-provided reason, and the back button. Writing this test surfaced a real UX bug: the checkbox and its exercise-name text were row siblings, not wrapped in a `<label>` — clicking the visible name did nothing, which would have surprised any clinician who tried it. Fixed in the component itself (wrapped in a proper `<label>`) rather than just worked around in the test.
- **`ClinicianApp.test.tsx`** (3 tests): renders the clinician's own name/role, selecting a patient switches to their detail screen and back returns to the roster, sign-out fires the callback.
- **`HistoryScreen`** grew from 3 to 5 tests: the two new ones cover the ROM trend delta rendering and the data-sharing toggle actually changing what's displayed after a round-trip through a mocked `PUT /me/data-sharing`.

## What's still a gap

- **M5 and M6 have been built but never seen running.** They need a live camera and `requestAnimationFrame`, and the Browser pane in this environment renders hidden, so the capture loop cannot run. Their structure is typechecked and the safety sheet is tested, but nobody has watched the live overlays sit over a moving image.
- **No non-English string has been checked by a fluent speaker.** The Spanish, Hindi and French cue text, safety sentences and UI copy were written without review. The bounded part of the risk is that the *decision* to stop is language-independent — the gate fires on numbers, and the sheet offers no way to continue in any language — but the wording a patient reads while being stopped is unreviewed, and one wrong verb there matters more than anywhere else in the app.
- **Only English speech has ever been heard.** The dev machine has eight English voices and none for Spanish, Hindi or French, so the non-English *spoken* path is verified by unit test and by watching the fallback behave, never by ear. What a Hindi voice actually does with these strings is unknown.
- **M7's skeleton replay is not built and cannot be as specified.** The design scrubs back through the flagged rep with the pain moment marked. ADR-0002 means no landmark sequence is persisted past the pose worker, so there is nothing to replay — the design's own caption ("there is no video of this rep, because none was ever kept") is true of the skeleton too. Building it would mean deciding to store movement traces, which is an ADR, not a UI task.
- **M9's form-score chart and left-vs-right symmetry card are not built.** Neither a cross-session score series nor a per-side comparison is computed anywhere yet, and drawing the artboard's sample curve would show the patient a trend that is not theirs.
- **The five deliberate omissions above** (check-in, streak, caregiver/study consents, data export/erasure, camera hero) are unbuilt features, and two of them — export and erasure — are likely legal obligations rather than nice-to-haves.
- **No screen has been compared side by side against its artboard by eye.** The rebuild followed a written spec and was verified through the DOM (computed colours, fonts, type sizes, copy) because the Browser pane in this environment renders hidden. Spacing and optical alignment need a human to look at them.
- **No frame of real video has ever gone through this pipeline.** Every measurement above used synthetic canvas frames, and the crude shapes drawn were never recognised as a person, so *landmark accuracy itself is still completely unverified* — only the plumbing and the timing around it. This remains the single highest-value unverified thing in the project.
- **The perf readout has not been seen rendering.** The Browser pane in this environment is hidden to the renderer, so `requestAnimationFrame` never fires and the capture loop cannot run; the worker was driven directly instead. The pipeline, timings and worker protocol are verified; `CameraSetupScreen`'s readout markup and the backpressure loop itself are verified only by unit tests and reading.
- **The display-smoothing constants are reasoned, not tuned.** `minCutoff: 1.7, beta: 0.9` is a defensible starting point for "prioritise lag over jitter", not a measured optimum. The instrumentation added here is what would let someone tune it against a real body.
- **720p capture is an inference from how MediaPipe works, not a measured accuracy win.** The mechanism is sound (sharper ROI crop) but nobody has compared landmark error at 480p vs 720p.
- **Milestone thresholds are arbitrary and unvalidated** — nobody with product or clinical context has confirmed 3/7/30-day streaks or 10/25 sessions are the right cadence to encourage adherence rather than discourage it after a missed day. Flagged, not decided.
- **`contraindicatedRegions` is still unverified self-/clinician-declared data** — unchanged; E5 checking it is better than checking nothing, but it is not clinical-grade contraindication management.
- **Still no live Postgres, still no real camera** — unchanged; see the M0/M2 history below. `getRomTrend` and `updateDataSharing`'s Postgres implementations follow the exact pattern already used elsewhere in `postgresStore.ts` but share that file's blanket caveat: reviewed, not run against a real database.

## M0 + M1 — merged and verified

- MediaPipe loads correctly (a version-mismatch bug and a module-worker/`useModule` bug, both fixed and verified); pose assets are served from the app's own origin, not a CDN.
- The patient can see themselves on camera; the raw stream still never leaves the device (mechanically checked by `privacy.test.ts`).
- Framing is exercise-specific, not whole-body. Reps are scored as trajectories (`packages/core/reps/temporal.ts`).
- Pose tier is `heavy`, chosen for demo accuracy over broad device support, per explicit request — see `docs/adr/0007-pose-model-tier.md`.
- **Still unverified: live pose tracking against a real camera and a real body.** This remains the single highest-value thing nobody has confirmed yet.

## M2 + the clinician-UI/E5-wiring branch — merged

- G3/G4 (auth, roles, tenancy), tenant isolation, G6 (idempotent sync), A9 (re-scoped to angle replay, never skeletons — this codebase never persists a landmark array past the pose worker, on-device or off).
- F6 program assignment: E5-checked (`rehabEngineClient.ts`, fails open if the supervisor is unreachable or unconfigured) and has UI (`PatientDetailScreen`).
- G5/F5 audit trail: has UI, and as of this branch, the consent control that actually backs it.
- G2: session list, adherence calendar, and now a real ROM trend, not just a one-time baseline.
- H1/H2: streak, calendar, and now milestones.
- **Known, documented infrastructure gap, unchanged:** no live Postgres exists in this environment to verify the RLS policies against, and `docker-compose.yml`'s Postgres role bypasses its own RLS policies by Postgres's default table-owner behaviour — the application-layer tenant scoping (which *is* fully tested) is what's actually protecting tenant isolation today. A real deployment needs a separate, non-owner runtime role.
- `apps/api/src/devMemoryServer.ts` — a `MemoryStore`-backed dev server for exercising the full stack without Docker/Postgres. `pnpm --filter @ai-rehab/api run dev:memory`. This is how the previous branch's real end-to-end browser walkthrough (clinician signup → invite → patient join → roster → assign program → patient sees it in history) was verified.

## What the upstream repos the user pointed to actually contributed

STGCN-rehab and avakanski's framework: structurally incompatible with ADR-0001 as live scoring engines (offline batch regressors) — nothing vendored; `packages/core/reps/temporal.ts` is this project's own closed-form answer to the same problem. RehabAR: a sanity check on provisional exercise ranges, not a source of code. OpenRehabAgent: E5's supervisor pattern is built and actually called — see `services/rehab-engine/UPSTREAM_DIVERGENCE.md` for exactly what carried over and what was deliberately left out (B1's pain heuristic, D1/D2's Q-learning policy).

## What exists

| | |
|---|---|
| `docs/PRD.md` | v2.0 — 61 features across 9 groups |
| `docs/FEATURES.md` | M1 scope confirmed (15 IN, 46 OUT); M2+ progress tracked in this file |
| `docs/ARCHITECTURE.md` | Stack, package boundaries — 5 mechanically-enforced boundary rules |
| `docs/CONTRACTS.md` | Every shared type — `identity.ts` now also carries `dataSharingEnabled`; `sync.ts` now also carries `RomTrendPoint`/`RomTrendSeries` |
| `docs/UPSTREAM.md` | `supervisor_agent.py`'s row says "Built" with a real integration |
| `NOTICE`, `.env.example`, `CLAUDE.md` | Unchanged |
| `packages/{contracts,core,exercises,eval}`, `apps/{patient,api}`, `services/rehab-engine` | Code |

## Next actions

In order.

1. **Run it with a real camera and a real body.** Unchanged and now more pointed than ever: this branch made the pipeline measurably faster and fixed a mapping bug that would have looked like bad tracking, but *landmark accuracy itself has still never been observed*. Open the app, stand in front of it, and read the fps/latency line on the setup screen — that single act both validates the tracking and finishes most of the M0 spike.
2. **Merge this branch** once reviewed. CI-green; gaps documented above, none of them regressions.
3. **Tune the display-smoothing constants and confirm the 720p bump** against that real body — both are currently reasoned rather than measured.
4. **Get milestone thresholds and `contraindicatedRegions` verification reviewed by someone with clinical/product context** — both are engineering guesses.
5. **Set up a real Postgres role split**, **finish the M0 device spike on phones**, **get a physiotherapist's sign-off**, **answer the regulatory posture question** — see the blocked table below.
6. **The voice assistant** — still deferred per the stated sequencing; not started. (Model accuracy work has now begun, this branch being the first pass.)

## Blocked

| Item | Blocks | Needs |
|---|---|---|
| Regulatory posture + data residency (ADR-0006) | Any production deployment carrying real patient data | A jurisdiction-specific answer. |
| Physiotherapist sign-off on the three `ExerciseSpec`s, on `contraindicatedRegions` verification, and on milestone thresholds | Trusting the scores, safety checks, and gamification this app already produces | A physiotherapist. |
| Real-device fps/jitter measurement | Confidence in the `heavy` tier choice; ADR-0007 closing | Physical hardware. |
| A live Postgres to test against | Confidence in the RLS policies' actual runtime behaviour | Docker, or a hosted Postgres instance. |
| Clinical advisor | M3 safety thresholds, escalation copy, report vocabulary | A named person. |

## Open decisions

See `docs/adr/`. ADR-0006 and 0008 are open. ADR-0007 has an interim default (`heavy`) pending real measurement. 0001-0005 are accepted.

## Recently decided

- **Backpressure over a fixed send rate.** When inference can't keep up, dropping frames is strictly better than queueing them: a queue converts a fixed cost into an unbounded, growing one, and the patient experiences that as the overlay drifting away from their body. Frame rate is the right thing to sacrifice.
- **The pose worker stays network-free, even for a cosmetic label.** Reading the model tier from a manifest at runtime would have been the obvious implementation, and ADR-0002's mechanical guard correctly refused it. The tier is passed in as data instead. The allowlist was not widened — that guard exists precisely to make this kind of casual addition fail review.
- **Build-time config reaches the worker as a message, not a bundler constant.** Vite's two mechanisms each work in only one mode — `define` is skipped for workers in dev, and workers are bundled in a separate Rollup pass that can't see a custom virtual module in production. Both failure modes were hit and observed here. Passing the value from the main thread sidesteps the split entirely.
- **A "trend" has to actually be a time series.** `BaselineEntry` (a single first-ever point) was explicitly not reused or relabeled as a trend — `computeRomTrend` was written as new, separate logic rather than stretching an existing type to look like something it isn't.
- **Milestones are client-side only.** Thresholds are gamification, not a clinical claim, so `apps/api` was deliberately not given a new endpoint or table for them — computed from data already fetched for other reasons.
- **Being refused data does not count as viewing it.** The data-sharing enforcement in `routes/patients.ts` checks consent *before* calling `recordAccess` — a blocked attempt is not logged as a view, which would have been misleading in the patient's own audit log.
- **Turning off data sharing does not un-link the patient from their clinician's roster.** Those are two different consents (joining a tenant vs. an individual clinician reading session data) and conflating them would have been a bigger, unreviewed access-control change than this branch intended to make.

## Known risks being carried

- **The M0 spike is only part-run** — `heavy` now has real numbers on one desktop-class machine and clears the bar there, but nothing has been measured on a phone, in a dim room, or against a real body.
- **Pose accuracy is still entirely unobserved.** The pipeline has been timed, not validated. No real person has ever been tracked by this app.
- **Every exercise spec is provisional** — unchanged since M1, and now across six exercises rather than three. The neck ranges are the ones a physiotherapist should look at first: it is the joint where forcing range has real consequences, and its 45° cap and 20–35° target are reasoned, not clinical.
- **Shoulder flexion and abduction read the same angle.** Both are hip → shoulder → elbow, which grows whether the arm travels forward or sideways; only the camera view distinguishes them, and the angle is not policing the plane. A plane-aware measurement is the next real upper-body accuracy improvement.
- **The `neck` angle cannot tell a sideways tilt from a forward chin-poke.** A patient doing the wrong movement will be scored as though they did the right one.
- **The Postgres role in `docker-compose.yml` bypasses its own RLS policies** — do not treat the local dev setup as a security reference for a real deployment.
- **`contraindicatedRegions` is unverified self-report data** — E5 checking it is real but its inputs are not clinically validated.
- **Milestone thresholds are unvalidated guesses** — new this branch; see "Next actions."
- **The joint-angle convention can't represent hyperextension** — unchanged since M1.

---

*Working memory. Update at the end of every session that touches this project — what happened, what works, what doesn't, and the single next action. Write it for someone with no memory of the session.*
