# UX specification — AI Rehab Coach (light mode)

**Figma file:** https://www.figma.com/design/6VCYsaHDeKKKSskFqegIMY
**Scope:** the recommended 15-feature MVP in `FEATURES.md`, plus the clinician surfaces (F6/F7/F8) at desktop width.
**Status:** foundations + 10 mobile screens built. Tablet and desktop artboards pending (blocked on Figma plan MCP quota).

---

## 1. Principles the UI is built on

These are read straight out of `CLAUDE.md` §2 and §6 — the interface is where three of the four invariants become visible.

| Invariant | How the UI expresses it |
|---|---|
| Video never leaves the device (ADR-0002) | The camera view renders a **skeleton, never a video frame or a recorded clip**. M10 states it plainly and the empty state for "shared data" says there is nothing to share. |
| Safety is a veto (invariant 3) | The safety banner is the only component that can occupy the primary action slot. Nothing below it offers "continue anyway". |
| Every decision carries a `reason` (invariant 4) | No bare number anywhere. Score `82` is always adjacent to `+6 vs last time`; a block always renders `Reason: …`; a low capture score always renders what to fix. |
| Not a medical device (§6) | `Bar/Disclaimer` is on every patient screen and every report. Pain inference never renders as a value — it only chooses which question to ask (B6). |

**Colour is never the only signal.** Every status pill pairs its colour with a word. Every spoken cue carries a caption (A3 + H9).

---

## 2. Tokens

Light mode only. Defined as Figma variables in collections `AIR Color` and `AIR Scale`.

| Group | Token | Value |
|---|---|---|
| Surface | `bg/page` · `bg/surface` · `bg/subtle` · `bg/inverse` | `#F6F8FB` · `#FFFFFF` · `#EEF2F7` · `#0F172A` |
| Border | `border/default` · `border/strong` | `#E2E8F0` · `#CBD5E1` |
| Text | `text/primary` · `text/secondary` · `text/muted` | `#0F172A` · `#475569` · `#8A97A8` |
| Brand | `brand/primary` · `brand/hover` · `brand/soft` · `brand/border` | `#0F766E` · `#115E59` · `#E3F2EF` · `#9CCFC8` |
| Success | `success/base` · `success/soft` | `#15803D` · `#E6F5EC` |
| Warning | `warning/base` · `warning/soft` | `#B45309` · `#FDF0DC` |
| Danger | `danger/base` · `danger/soft` | `#B42318` · `#FDECEA` |
| Pain | `pain/base` · `pain/soft` | `#C2410C` · `#FDEDE3` |
| Skeleton | `skeleton/line` · `skeleton/joint` | `#0EA5A5` · `#F59E0B` |

Pain has its **own** hue, separate from danger. Discomfort a patient reports is data; a safety block is an alarm. Rendering both in red would teach patients that reporting pain is a failure.

Spacing `2/4/8/12/16/20/24/32/40`. Radii `sm 8 · md 12 · lg 16 · xl 24 · pill 999`.
Type: Inter — `Display/32`, `Heading/24`, `Heading/20`, `Title/17`, `Body/16`, `Body/15 Medium`, `Body/14`, `Label/13 Semi`, `Caption/12`, `Metric/40`.

Minimum touch target 52px — patients use this mid-exercise, standing, sometimes one-handed.

---

## 3. Components

| Component | Feature | Contract |
|---|---|---|
| `Button/Primary` `/Secondary` `/Danger` | — | 52px tall, label is the only override |
| `Pill/Status` | — | colour + word, never colour alone |
| `Bar/Disclaimer` | **E4** | copy is snapshot-tested; do not edit without review |
| `Nav/TabBar Mobile` | — | Today · Progress · Program · Settings |
| `Badge/Capture Quality` | **A7 + G7** | persistent for the whole session; degrades good → fair → low-confidence |
| `Banner/Coaching Cue` | **A3** | spoken text **and** caption; cooldown prevents nagging |
| `Banner/Safety Block` | **E1 + E3** | states the reason and the escalation path; never "push through" |
| `Input/Pain Scale` | **B2 + B6** | 1–5 with words; footer states the answer is what gets recorded |
| `Card/Metric` | — | value + delta + caption; a bare number is not shippable |

---

## 4. Screens

### Mobile — 390 × 844 (built)

| ID | Screen | Features |
|---|---|---|
| M1 | Welcome / guest session | H7, E4 — full session before any signup form |
| M2 | Today | D4 readiness, H1 streak, C6 why-line on the next exercise |
| M3 | Why this exercise | C6, A6 reference loop, E6 clinician cap shown before the set |
| M4 | Camera setup coach | A7 — four checks, live quality badge, honest low-confidence escape hatch |
| M5 | Live session | A1–A4, A3 cue + caption, B5 *that one hurt*, live angle vs cap |
| M6 | Safety block + escalation | E1, E3 — reason, log entry, three exits, none of them "continue" |
| M7 | Rest check-in | B5 bookmark recall, B2 body map + 1–5 scale, B6 framing |
| M8 | Session summary | H4, G7 capture line, F4-style plain language |
| M9 | Progress | H1 calendar, A10 bilateral, B4 discomfort by region |
| M10 | Sharing & privacy | G5 — per-recipient scope, patient-readable access log |

### Tablet — 834 × 1194 portrait, 1194 × 834 landscape for session (pending)

Same information architecture, two-column. The session screen goes **landscape**: camera left at 62%, coaching rail right (rep count, form score, cue, *that one hurt*). A tablet is propped on a chair at knee height — the cue must not sit under the patient's own body in frame.

### Desktop — 1440 × 900 (pending)

| ID | Screen | Features |
|---|---|---|
| D1 | Patient session on a laptop | camera centred, controls reachable without leaning in |
| D2 | Clinician flag triage inbox | **F7** — ranked worklist across the caseload; the screen that gets opened every morning |
| D3 | Patient detail + rep replay | **A9, F1, F5, F8** — skeleton scrub, annotate the rep, audit trail |
| D4 | Program builder | **F6, E6** — assign from templates, set per-patient thresholds |

---

## 5. Copy rules

- Never "pain level 3" as a system statement. Always "you said 3".
- Never an imperative that overrides a patient's judgement: "if it hurts, stop" not "push to the limit".
- The clinician's name appears next to their threshold, so a limit reads as a person's decision rather than the app's.
- A low-confidence session says so on the patient's summary too, not only in the clinician report — the patient should never be surprised by what their physio sees.

---

## 6. Feature coverage

All 61 features in `FEATURES.md` are demonstrated somewhere in the design. Full matrix and screens: the coverage artifact.

**Patient, mobile (390x844)** — welcome/guest (H7) · today (D4, H1, C6) · why-this-exercise (C6, E6) · camera setup (A7) · live session (A1-A4, B5) · safety block (E1, E3) · rest check-in (B2, B5, B6, A9) · summary (H4) · progress (H1, A10, B4) · sharing (G5) · ROM baseline (A8) · supervisor/allowed set (E5) · between-sets conversation (C1, C2, C5) · ask a question (C3) · what changed in your plan (D1, D2, D3) · pain map and why we asked (B1, B3, B4, B6) · your record (G1, G2) · messages (F9, F8)

**States inside those screens** — score breakdown (A2) · compensation cue (A5) · instability (E2) · not-enough-signal (G7) · offline (G6) · milestone (H2) · re-engagement nudge (H3, H6) · save guest session (H7) · reach practice (H8) · wearable pairing (H10) · coach and accessibility settings (C4, H9) · caregiver view (H5)

**Tablet (834x1194 portrait, 1194x834 landscape)** — today · live session · rest check-in

**Clinician (1440x900)** — triage inbox (F7) · session replay (A9, F8) · program builder (F6, E6) · weekly report (F1, F3, F4) · export packet (F2) · audit trail (F5) · roles, tenancy and drop-out risk (G3, G4, H6)

**Internal (I)** — exercise authoring studio (I1) · evaluation harness (I2) · platform shells (I3)

### Where the contracts show through

The screens render real fields rather than plausible-looking ones:

| Contract | Where it is visible |
|---|---|
| `FormScore.breakdown[]` | Score breakdown — criterion, observed, target band, status, weight |
| `FormScore.confidence` | "Not enough signal this rep" — no number, held out of the trend |
| `SafetyVerdict.threshold` | Every block shows rule, limit and observed value |
| `PainSignal.inferred.basis[]` | "Why we asked about your knee" — the three signals and their confidence |
| `PainSignal.fusion` | Audit trail records the inferred prior as discarded |
| `AdaptationDecision.alternatives[]` | "What changed" — blocked options with their reasons |
| `SessionEvent` union | Your record — the log itself, in event-type order |
| `CaptureQuality` | Setup coach checks map to `framing`, `lighting`, `missingJoints` |

### Blocked decisions kept visible

ADR-0006 (regulatory posture and residency) is still open, and it gates consent copy, retention, and whether F6 ships as specified. The export dialog carries that state on its face rather than assuming an answer.
