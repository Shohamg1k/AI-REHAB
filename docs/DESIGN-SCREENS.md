# DESIGN-SCREENS — Mobile M1–M10

Literal implementation spec derived from `figma-svg/_source/v2.html` (the "second pass" mobile + tablet
screen sheet for **AI Rehab Coach**). Covers **M1–M10 only** (mobile, 390 × 844). T2/T3 (tablet) are out
of scope for this document.

Every screen artboard is a `<div class="ab ph" style="width:390px;height:844px">` unless noted.
`.ab` sets `overflow:hidden; line-height:1.42; background:var(--page); color:var(--ink)` and declares the
whole token set. `.ab.ph` adds `display:flex; flex-direction:column`.

All copy below is **verbatim**. Em dashes (`—`), middots (`·`), degree signs (`°`), and the `▮` glyphs are
literal characters in the source.

---

## Design tokens (from `.ab`)

```
--page:#ECF0F1;  --surf:#FFFFFF;  --sunk:#E2E8E9;  --line:#D6DEDF;  --line-2:#C2CCCD;
--ink:#101617;   --ink2:#47575A;  --ink3:#7C8C8F;
--teal:#0D6E68;  --teal-d:#084A46; --teal-w:#DCEBE8;
--ok:#1F7A4D;    --ok-w:#E1F0E7;  --warn:#A75A0B;  --warn-w:#F8EBD9;
--dang:#A32218;  --dang-w:#F8E5E2; --pain:#B5410A; --pain-w:#F9E7DC;
--night:#0C1414; --night-2:#16211F; --night-3:#233230;
--skl:#3BE3D2;   --jnt:#FFC24D;
```

Type scale (all scoped under `.ab`):

| Class | CSS |
|---|---|
| `.d1` | `font-size:29px; font-weight:600; letter-spacing:-.03em; line-height:1.14` |
| `.h1` | `font-size:22px; font-weight:600; letter-spacing:-.025em; line-height:1.2` |
| `.h2` | `font-size:17px; font-weight:600; letter-spacing:-.015em` |
| `.b1` | `font-size:15px; font-weight:400` |
| `.b2` | `font-size:13.5px; color:var(--ink2); line-height:1.45` |
| `.lb` | `IBM Plex Mono; font-size:10.5px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3)` |
| `.cap` | `font-size:12px; color:var(--ink3)` |
| `.mono` | `IBM Plex Mono; font-variant-numeric:tabular-nums` |

Layout helpers: `.r` = `flex; align-items:center; gap:10px`. `.c` = `flex; flex-direction:column`.
`.g` = `flex:1`. `.sep` = `height:1px; background:var(--line)`.

Fonts: **IBM Plex Sans** (400/450/500/600/700) for UI, **IBM Plex Mono** (400/500/600) for every
measurement, and **Newsreader** only in the page chrome around the artboards (not inside any screen).

---

## Shared chrome

### `.pad` — content padding

```css
.ab .pad { padding: 0 20px; }
```

Horizontal padding is **20px left and right**, zero vertical. Every screen that needs top/bottom padding
adds it inline (`padding-top`, `padding-bottom`) on the same element.

### `.stat` — status bar row

```css
.ab .stat {
  display:flex; align-items:center;
  padding:12px 22px 4px;
  font-family:"IBM Plex Mono", monospace;
  font-size:12px; font-weight:500;
}
.ab .stat .g { text-align:right; }
```

Markup, identical on every screen that has one:

```html
<div class="stat"><span>9:41</span><span class="g">5G ▮▮▮</span></div>
```

Copy: left `9:41`, right `5G ▮▮▮` (three U+25AE BLACK VERTICAL RECTANGLE glyphs after "5G ").
On dark camera screens (M4, M5, M6) the same row is rendered as an overlay:
`<div class="ovl stat" style="top:0;left:0;right:0;color:#fff">` — same copy, white text.

### `.navbar` — bottom navigation

```css
.ab .navbar {
  display:flex; background:var(--surf);
  box-shadow: inset 0 1px 0 var(--line);
  padding: 8px 0 20px;
}
.ab .navbar .it {
  flex:1; display:flex; flex-direction:column; align-items:center;
  gap:4px; font-size:10.5px; color:var(--ink3);
}
.ab .navbar .it.on { color: var(--teal); }
```

Four tabs, always in this order, icons always `21 × 21`:

| # | Icon symbol | Label |
|---|---|---|
| 1 | `#i-home` | `Today` |
| 2 | `#i-chart` | `Progress` |
| 3 | `#i-list` | `Program` |
| 4 | `#i-lock` | `Sharing` |

Markup per tab: `<div class="it"><svg width="21" height="21"><use href="#i-home"/></svg>Today</div>`;
active tab gets `class="it on"`.

Navbar presence across M1–M10:

| Screen | Navbar | Active tab |
|---|---|---|
| M1 Welcome | no | — |
| M2 Today | **yes** | `Today` |
| M3 Why this exercise | no | — |
| M4 Camera setup | no | — |
| M5 Live session | no | — |
| M6 Safety block | no | — |
| M7 Rest check-in | no | — |
| M8 Session summary | **yes** | `Today` |
| M9 Progress | **yes** | `Progress` |
| M10 Sharing & privacy | **yes** | `Sharing` |

### `.disc` — disclaimer row

```css
.ab .disc {
  display:flex; gap:8px; align-items:flex-start;
  font-size:11.5px; color:var(--ink3); line-height:1.4;
}
.ab .disc svg { flex:none; margin-top:1px; }
```

Always an icon + a `<span>`. Icon is `13 × 13`, either `#i-shield` or `#i-lock`.
The exact disclaimer strings used on M1–M10:

- M1: `#i-shield` — "Coaching aid — not a medical device. It does not diagnose or replace your clinician."
- M2, M3, M8: `#i-shield` — "Coaching aid — not a medical device."
- M4: `#i-shield`, `style="color:rgba(255,255,255,.5)"` — "You can start anyway — the session is then marked low-confidence in Ruth's report."
- M7: `#i-lock`, `style="margin-top:-4px"` — "Skeleton only — there is no video of this rep, because none was ever kept."
- M9: `#i-shield` — "Coaching measurements, not a clinical assessment."
- M5, M6, M10: no `.disc` row.

### Other shared components

```css
.ab .card { background:var(--surf); border-radius:10px; padding:14px; }
.ab .card.hair { box-shadow: inset 0 0 0 1px var(--line); }
.ab .card.lift { box-shadow: 0 1px 1px rgba(16,22,23,.04), 0 6px 16px rgba(16,22,23,.07); }
.ab .sunk { background:var(--sunk); border-radius:10px; padding:14px; }

.ab .btn { display:flex; align-items:center; justify-content:center; gap:8px;
           height:52px; border-radius:8px; font-size:15px; font-weight:500;
           background:var(--teal); color:#fff; }
.ab .btn.sec  { background:var(--surf); color:var(--ink); box-shadow: inset 0 0 0 1px var(--line-2); }
.ab .btn.dang { background:var(--dang-w); color:var(--dang); box-shadow: inset 0 0 0 1px #E7BBB4; }
.ab .btn.dk   { background:var(--night-3); color:#fff; }
.ab .btn.sm   { height:38px; font-size:13.5px; padding:0 14px; }   /* unused on M1–M10 */

.ab .chip { display:inline-flex; align-items:center; gap:5px; padding:4px 8px;
            border-radius:4px; font-size:11.5px; font-weight:500;
            font-family:"IBM Plex Mono",monospace; letter-spacing:.02em; }
.ab .k-ok   { background:var(--ok-w);   color:var(--ok); }
.ab .k-warn { background:var(--warn-w); color:var(--warn); }
.ab .k-dang { background:var(--dang-w); color:var(--dang); }
.ab .k-pain { background:var(--pain-w); color:var(--pain); }
.ab .k-mute { background:var(--sunk);   color:var(--ink2); }
.ab .k-teal { background:var(--teal-w); color:var(--teal-d); }
.ab .k-dk   { background:rgba(255,255,255,.12); color:#E5EEEC; }

.ab .cam { position:relative; overflow:hidden; border-radius:20px; background:#2A3439; }
.ab .cam.sq { border-radius:0; }
.ab .cam svg.lay { position:absolute; inset:0; width:100%; height:100%; }
.ab .ovl { position:absolute; }

.ab .live { display:inline-flex; align-items:center; gap:6px;
            background:rgba(12,20,20,.62); backdrop-filter:blur(6px); color:#fff;
            padding:5px 9px; border-radius:4px;
            font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.06em; }
.ab .live i { width:7px; height:7px; border-radius:50%; background:#FF5C4D; display:block; }

.ab .readout { background:rgba(12,20,20,.68); backdrop-filter:blur(6px); color:#fff;
               border-radius:8px; padding:8px 11px; }

.ab .cuebar { display:flex; gap:11px; align-items:center;
              background:rgba(255,255,255,.94); backdrop-filter:blur(10px);
              border-radius:12px; padding:11px 13px; }
.ab .cuebar .ic { width:26px; height:26px; border-radius:6px; background:var(--warn-w);
                  display:flex; align-items:center; justify-content:center; flex:none; }

.ab .tick  { height:4px; border-radius:2px; flex:1; }
.ab .track { height:6px; border-radius:3px; background:var(--sunk); overflow:hidden; }
.ab .track i { display:block; height:100%; border-radius:3px; }

.ab .exrow { display:flex; gap:12px; align-items:center; padding:12px 14px;
             background:var(--surf); border-radius:10px; }
.ab .thumb { width:46px; height:46px; border-radius:8px; background:var(--sunk);
             flex:none; display:flex; align-items:center; justify-content:center; color:var(--ink3); }

.ab .seg { display:flex; background:var(--sunk); border-radius:8px; padding:3px; }
.ab .seg > div { flex:1; text-align:center; padding:8px 0; border-radius:6px;
                 font-size:13.5px; font-weight:500; color:var(--ink2); }
.ab .seg > div.on { background:var(--surf); color:var(--ink);
                    box-shadow:0 1px 2px rgba(16,22,23,.12); }

.ab .corner { position:absolute; width:26px; height:26px; border:2px solid rgba(255,255,255,.85); }
```

### Icon symbols referenced by M1–M10

`#i-chev` (chevron right), `#i-check`, `#i-cam`, `#i-sound`, `#i-shield`, `#i-flame`, `#i-play`,
`#i-pause`, `#i-skip`, `#i-x`, `#i-back`, `#i-home`, `#i-chart`, `#i-list`, `#i-lock`, `#i-body`.
All 24×24 viewBox, stroke `currentColor`, no fill.

### Camera scene symbols

- `#scene` — full rendered room + patient mid sit-to-stand (video stand-in for **live** views).
- `#pose` — teal (`#3BE3D2`) skeleton + amber (`#FFC24D`) joint dots, aligned to `#scene`.
- `#poseonly` — skeleton-only replay (no scene beneath); head is an outlined circle, and one joint at
  `cx=182 cy=428` is drawn as a `#B5410A` filled circle r=9 with a `#0C1414` stroke — the flagged/painful joint.

Every camera layer is `<svg class="lay" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice"><use href="#..." width="400" height="600"/></svg>`.

---

## M1 — Welcome

**Artboard:** `.ab.ph`, 390 × 844, default `--page` background. No navbar.

### Vertical stack

1. `.stat` — `9:41` / `5G ▮▮▮`
2. `.pad.c` with `gap:16px; padding-top:8px` containing:
   1. **Brand row** — `.r` `gap:9px`
   2. **Camera hero** — `.cam` `height:280px`
   3. **Display headline** — `.d1`
   4. **Lede** — `.b2` `font-size:14.5px`
   5. **Feature list** — `.c` `gap:13px; padding-top:2px` (3 rows)
3. `<div class="g"></div>` — flexible spacer
4. `.pad.c` with `gap:9px; padding-bottom:18px` — two buttons + `.disc`

### Content, verbatim

**Brand row** — a 26×26 square, `border-radius:7px`, `background:var(--teal)` (logo mark), then:

- `.h2`: `Rehab Coach`

**Camera hero** (`.cam`, height 280px, default 20px radius):
- layer 1: `#scene`, layer 2: `#pose`
- `.ovl.live` at `top:12px; left:12px` → `LIVE · ON THIS PHONE`
- `.ovl.readout.mono` at `top:12px; right:12px; font-size:12px` → `86 ` then `<span style="opacity:.65">form</span>` → renders as `86 form`
- `.ovl` at `left:12px; right:12px; bottom:12px` containing a `.cuebar`:
  - `.ic` with 15×15 `#i-sound`, `color:var(--warn)`
  - line 1 (`font-size:13.5px; font-weight:500`): `Straighten a little more at the top`
  - line 2 (`.cap`, `font-size:11px`): `spoken · always captioned`

**Headline** — `.d1`, contains an explicit `<br>`:

```
See yourself the way
your physio does.
```

**Lede** — `.b2` at `font-size:14.5px`:

> `Prop the phone up, step back, and do your exercises. We count the reps, correct the form as you go, and remember exactly where it hurt.`

**Feature list** — three `.r` rows, each `gap:11px; align-items:flex-start`, with a 19×19 teal icon
(`flex:none; margin-top:1px`) then a `.c` of title (`font-size:14px; font-weight:500`) + `.b2`:

| Icon | Title | Body |
|---|---|---|
| `#i-lock` | `The video stays on your phone` | `Nothing is recorded or uploaded — we keep the joint positions, never the picture.` |
| `#i-cam` | `No wearables, no signal needed` | `One ordinary camera, working offline.` |
| `#i-shield` | `It will never tell you to push through` | `If something looks unsafe, the set stops.` |

**Footer**
- `.btn` (primary teal): `Try a session — no account`
- `.btn.sec`: `I have a code from my physio`
- `.disc` (`#i-shield`): `Coaching aid — not a medical device. It does not diagnose or replace your clinician.`

### Components
`stat`, `cam` (rounded), `live`, `readout mono`, `cuebar`, `d1`, `b2`, `btn`, `btn sec`, `disc`.

### State
Static marketing state. The camera hero shows a *live* cue state (red `.live` dot, form score 86).

---

## M2 — Today

**Artboard:** `.ab.ph`, 390 × 844. **Navbar present, `Today` active.**

### Vertical stack

1. `.stat`
2. `.pad.r` — `padding-top:8px; padding-bottom:14px; align-items:flex-start` (header row)
3. `.pad.c` — `gap:14px` (main body)
4. `<div class="g"></div>`
5. `.pad.c` — `gap:9px; padding-bottom:12px` (CTA + disclaimer)
6. `.navbar`

### Content, verbatim

**Header row** — `.c.g` `gap:3px`:
- `.lb`: `Tuesday · week 3`
- `.d1` with `<br>`:
  ```
  Good morning,
  Maya
  ```
- Trailing `.chip.k-warn` with `padding:6px 9px`: 13×13 `#i-flame` icon + `12` (streak count)

**Check-in card** — `.card.hair.c` `gap:11px`:
- `.h2`: `How is the knee today?`
- `.seg` with three options — `Good`, `So-so` (**`.on`, selected**), `Sore`
- `.b2`: `We will hold today's intensity where it was and watch the left side.`

**Program header row** — `.r`:
- `.lb.g`: `Today's program`
- `.mono` `font-size:11.5px; color:var(--ink3)`: `1/3 · ~9 MIN LEFT`

**Exercise list** — `.c` `gap:8px`, three items:

1. **Completed** — `.exrow` with `opacity:.72`
   - `.thumb` overridden `background:var(--ok-w); color:var(--ok)`, 20×20 `#i-check`
   - title (`font-size:15px; font-weight:500`): `Seated knee extension`
   - `.mono` `font-size:11.5px; color:var(--ok)`: `3 × 10 · FORM 84`
   - no chevron

2. **Up next (lifted)** — `.card.lift.c` `gap:11px; padding:14px`
   - `.r`: `.thumb` overridden `background:var(--teal-w); color:var(--teal)` with 22×22 `#i-body`
   - title (`font-size:15px; font-weight:600`): `Sit to stand`
   - `.mono` `font-size:11.5px; color:var(--ink3)`: `2 SETS × 8 · UP NEXT`
   - 18×18 `#i-chev`, `color:var(--ink3)`
   - `.sep`
   - `.b2` with inline bold lead-in `<b style="color:var(--ink);font-weight:600">Why this one — </b>`:
     full string = `Why this one — standing up without your hands is the movement your knee has to relearn first.`

3. **Upcoming** — `.exrow` (full opacity)
   - `.thumb` default (sunk), 22×22 `#i-body`
   - title (`font-size:15px; font-weight:500`): `Standing hamstring curl`
   - `.mono` `font-size:11.5px; color:var(--ink3)`: `3 × 10`
   - 18×18 `#i-chev`, `color:var(--ink3)`

**Footer**
- `.btn` with 18×18 `#i-cam` icon: `Start sit to stand`
- `.disc` (`#i-shield`): `Coaching aid — not a medical device.`

**Navbar** — `Today` (on) · `Progress` · `Program` · `Sharing`

### Components
`card hair`, `seg` (with `.on`), `exrow`, `thumb`, `card lift`, `sep`, `chip k-warn`, `btn`, `disc`, `navbar`.

### State
- Segmented control: middle option `So-so` selected.
- Exercise 1 is done (check thumb, `opacity:.72`, green form value).
- Exercise 2 is the active/next item — the **only** lifted card on the screen.
- Streak chip reads `12`.

---

## M3 — Why this exercise

**Artboard:** `.ab.ph`, 390 × 844. No navbar.

### Vertical stack

1. `.stat`
2. `.pad.r` — `padding-top:6px; padding-bottom:12px; gap:12px` (back row)
3. `.pad.c` — `gap:13px` (body)
4. `<div class="g"></div>`
5. `.pad.c` — `gap:9px; padding-bottom:18px` (footer)

### Content, verbatim

**Back row**
- 20×20 `#i-back`, `color:var(--ink)`
- `.mono` `font-size:11.5px; color:var(--ink3)`: `EXERCISE 2 OF 3`

**Reference loop** — `.cam` `height:186px; background:var(--night)`
- single layer: `#poseonly` (skeleton only, no scene)
- `.ovl.chip.k-dk` at `top:10px; left:10px`: `REFERENCE FORM · LOOPING`

**Title block** — `.c` `gap:6px`
- `.h1`: `Sit to stand`
- `.r` `gap:6px` with three chips:
  - `.chip.k-teal`: `KNEE · QUADS`
  - `.chip.k-mute`: `2 × 8`
  - `.chip.k-mute`: `~3 MIN`

**Why card** — `.card.c` `gap:7px; background:var(--teal-w)` (no `hair`)
- `.lb` `color:var(--teal-d)`: `Why this one`
- body (`font-size:15px; color:var(--teal-d); line-height:1.42`):
  `Standing up without using your hands is the movement your knee has to relearn first — most of home life depends on it.`

**Steps list** — `.c` `gap:9px`
- `.lb`: `What good looks like`
- Four numbered rows, each `.r` `gap:9px; align-items:flex-start`, number in
  `.mono` `font-size:11.5px; color:var(--teal); margin-top:2px`, text in `.b2`:

| No. | Text |
|---|---|
| `01` | `Feet flat, hip width apart` |
| `02` | `Lead with your chest, not your chin` |
| `03` | `Stand fully upright before you sit back down` |
| `04` | `Take three seconds to lower` |

**Limit card** — `.card.c` `gap:6px; background:var(--warn-w)`
- `.r` `gap:7px`: 14×14 `#i-shield` `color:var(--warn)` + `.lb` `color:var(--warn)`: `Ruth's limit for you`
- `.b2` `color:#7A4208`, with the number in mono/600:
  `Knee bend capped at 90°. We pause the set if you go past it.`
  (markup: `Knee bend capped at <span class="mono" style="font-weight:600">90°</span>. We pause the set if you go past it.`)

**Footer**
- `.btn` with 18×18 `#i-cam`: `Set up camera`
- Tertiary text link — `<div style="text-align:center;font-size:14.5px;font-weight:500;color:var(--teal);padding:6px">`:
  `Swap or skip this exercise`
- `.disc` (`#i-shield`): `Coaching aid — not a medical device.`

### Components
`cam` (night bg, `poseonly`), `chip k-dk`, `chip k-teal`, `chip k-mute`, `card` (teal-w tinted),
`card` (warn-w tinted), `btn`, text link, `disc`.

### State
Static informational screen. Numbered-step list is a sequence, not a checklist (no checked state).

---

## M4 — Camera setup

**Artboard:** `.ab.ph`, 390 × 844, **`style="background:var(--night)"`** — dark screen.
No navbar. The `.stat` bar is an overlay inside the camera, not a sibling row.

### Vertical stack

1. `.cam.sq` — `height:560px; border-radius:0` (full-bleed top viewport)
2. `.c.g` — `padding:16px 20px 0; gap:12px` (checklist, takes remaining height)
3. `.c` — `padding:0 20px 18px; gap:10px` (quality meter + CTA + disclaimer)

### Camera viewport (560px)

- layer: `#scene` **only** (no pose overlay — framing state, not tracking)
- `.ovl` `inset:0` scrim:
  `background:linear-gradient(180deg,rgba(12,20,20,.72) 0%,rgba(12,20,20,0) 26%,rgba(12,20,20,0) 55%,rgba(12,20,20,.82) 100%)`
- Four `.corner` framing brackets (26×26, `border:2px solid rgba(255,255,255,.85)`):
  - `top:96px; left:70px; border-right:0; border-bottom:0`
  - `top:96px; right:70px; border-left:0; border-bottom:0`
  - `bottom:104px; left:70px; border-right:0; border-top:0`
  - `bottom:104px; right:70px; border-left:0; border-top:0`
- `.ovl.stat` `top:0; left:0; right:0; color:#fff` → `9:41` / `5G ▮▮▮`
- `.ovl.c` `top:46px; left:20px; right:20px; gap:4px`:
  - `.h1` `color:#fff`: `Set up your camera`
  - sub (`font-size:13.5px; color:rgba(255,255,255,.72); line-height:1.45`):
    `Fifteen seconds. Every score today inherits this setup.`
- `.ovl` `bottom:24px; left:20px; right:20px; display:flex; justify-content:center` containing a
  `.live` pill overridden to `background:rgba(255,255,255,.95); color:var(--warn)` with dot
  `background:var(--warn)`:
  `STEP BACK ABOUT HALF A METRE`

### Checklist (4 rows, `.r` `gap:10px`)

Each row: 17×17 icon, label (`font-size:14px; color:#fff; flex:1`), status in
`.mono` `font-size:11px`.

| Icon | Icon colour | Label | Status | Status colour |
|---|---|---|---|---|
| `#i-check` | `#4ED6A8` | `Whole body in frame` | `GOOD` | `#4ED6A8` |
| `#i-check` | `#4ED6A8` | `Enough light` | `GOOD` | `#4ED6A8` |
| `#i-cam` | `#F0B44C` | `Distance from camera` | `ADJUSTING` | `#F0B44C` |
| `#i-check` | `#4ED6A8` | `Phone steady and level` | `GOOD` | `#4ED6A8` |

### Quality meter + CTA

- `.c` `gap:6px`:
  - `.r`: `.mono.g` (`font-size:11px; letter-spacing:.1em; color:rgba(255,255,255,.55)`) `CAPTURE QUALITY`
    and `.mono` (`font-size:11px; color:#F0B44C`) `FAIR — ONE THING TO FIX`
  - `.r` `gap:4px` with **five `.tick`** bars (4px tall, equal flex):
    ticks 1–3 `background:#F0B44C`; ticks 4–5 `background:rgba(255,255,255,.18)`
    → **3 of 5 filled, amber.**
- `.btn` overridden `background:var(--night-3); color:rgba(255,255,255,.45)` — **disabled-looking**:
  `Start when this turns green`
- `.disc` `style="color:rgba(255,255,255,.5)"`, icon `#i-shield`:
  `You can start anyway — the session is then marked low-confidence in Ruth's report.`

### Components
`cam sq`, `corner` × 4, `ovl stat`, `live` (inverted/warn variant), `tick` × 5, `btn` (disabled dark), `disc` (dark).

### State
Framing-in-progress state: 3 of 4 checks pass, "Distance from camera" is `ADJUSTING`, capture quality
is 3/5 amber, primary CTA is visually disabled, and the coaching pill instructs `STEP BACK ABOUT HALF A METRE`.

---

## M5 — Live session

**Artboard:** `<div class="ab" style="width:390px;height:844px;background:var(--night)">`
— note: **no `ph` class**, so no flex column. Full-bleed. No navbar, no `.pad`, no `.disc`.

### Structure

Single child: `.cam.sq` `height:844px` (fills the whole artboard). Everything else is an
absolutely-positioned `.ovl` inside it.

Layers, bottom to top:
1. `#scene`
2. `#pose`
3. `.ovl` `inset:0` scrim:
   `linear-gradient(180deg,rgba(12,20,20,.78) 0%,rgba(12,20,20,0) 22%,rgba(12,20,20,0) 46%,rgba(12,20,20,.88) 78%)`

### Overlays, verbatim

**Status bar** — `.ovl.stat` `top:0; left:0; right:0; color:#fff`: `9:41` / `5G ▮▮▮`

**Header row** — `.ovl.r` `top:44px; left:18px; right:18px; gap:12px`
- 20×20 `#i-x`, `color:#fff`
- `.c.g` `gap:1px`:
  - `font-size:16px; font-weight:600; color:#fff`: `Sit to stand`
  - `.mono` `font-size:11px; color:rgba(255,255,255,.62)`: `SET 2 OF 2 · 01:14`
- `.live` overridden `background:rgba(31,122,77,.9)` with dot `background:#8DF0BE`: `CAPTURE GOOD`

**Rep counter** — `.ovl.readout.c` `top:108px; left:18px; padding:10px 14px`
- `.mono` `font-size:38px; font-weight:600; line-height:1; letter-spacing:-.03em`: `07`
- `.mono` `font-size:10.5px; letter-spacing:.09em; opacity:.66`: `OF 10 REPS`

**Form score** — `.ovl.readout.c` `top:108px; right:18px; padding:10px 14px; align-items:flex-end`
- `.mono` `font-size:26px; font-weight:600; line-height:1; color:#8DF0BE`: `86`
- `.mono` `font-size:10.5px; letter-spacing:.09em; opacity:.66`: `FORM`

**Joint-angle tag** — `.ovl.live.mono` `top:492px; left:214px;
background:rgba(12,20,20,.72); color:#FFC24D; letter-spacing:.03em` (no dot child):
`KNEE 88° / CAP 90°`

**Set progress ticks** — `.ovl.r` `top:214px; left:18px; right:18px; gap:3px`, **ten `.tick`** bars
(4px tall), in order:

| Rep | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Colour | `#4ED6A8` | `#4ED6A8` | `#4ED6A8` | `#4ED6A8` | `#F0B44C` | `#E8845A` | `#4ED6A8` | `rgba(255,255,255,.2)` | `rgba(255,255,255,.2)` | `rgba(255,255,255,.2)` |

→ 7 reps done (4 good, rep 5 amber/shallow, rep 6 flagged orange, rep 7 good), 3 empty.

**Cue bar** — `.ovl` `left:18px; right:18px; bottom:196px` wrapping a `.cuebar`
- `.ic` with 15×15 `#i-sound`, `color:var(--warn)`
- line 1 (`font-size:14px; font-weight:500`): `Straighten a little further at the top`
- line 2 (`.cap`, `font-size:11px`): `spoken cue · always captioned`

**Bottom control stack** — `.ovl.c` `left:18px; right:18px; bottom:26px; gap:10px`
1. Big pain button —
   `<div style="display:flex;align-items:center;justify-content:center;gap:10px;height:74px;border-radius:12px;background:rgba(249,231,220,.96)">`
   - 13×13 dot, `border-radius:50%`, `background:var(--pain)`
   - `font-size:19px; font-weight:600; color:var(--pain)`: `That one hurt`
2. `.mono` `font-size:10.5px; color:rgba(255,255,255,.55); text-align:center; letter-spacing:.04em`:
   `TAGS THIS REP · WE ASK ABOUT IT IN THE BREAK`
3. `.r` `gap:10px` with two `.btn.dk.g` at `height:46px; background:rgba(255,255,255,.14)`:
   - 17×17 `#i-pause` + `Pause`
   - 17×17 `#i-skip` + `Skip`

### Components
`cam sq` (full-bleed), `ovl stat`, `live` (green "capture good" variant + amber angle variant),
`readout` × 2, `tick` × 10, `cuebar`, `btn dk` × 2.

### State
Mid-set: set 2 of 2, rep 7 of 10, elapsed `01:14`, form 86, capture good, knee at 88° against a 90° cap,
rep 6 already flagged in the tick strip, one active spoken cue displayed.

---

## M6 — Safety block

**Artboard:** `<div class="ab" style="width:390px;height:844px;background:var(--night)">`
— **no `ph` class**. No navbar.

### Structure

Single child `.cam.sq` `height:844px`, containing:
1. `#scene` (**no `#pose` overlay** — tracking display is suppressed)
2. `.ovl` `inset:0; background:rgba(12,20,20,.72)` — flat dim, not a gradient
3. `.ovl.stat` `top:0; left:0; right:0; color:#fff`: `9:41` / `5G ▮▮▮`
4. Header `.ovl.r` `top:44px; left:18px; right:18px; gap:12px`
5. Bottom sheet `.ovl.c` `left:0; right:0; bottom:0; background:var(--surf);
   border-radius:20px 20px 0 0; padding:20px 20px 20px; gap:14px`

### Content, verbatim

**Header**
- 20×20 `#i-x`, `color:#fff`
- `.c.g` `gap:1px`:
  - `font-size:16px; font-weight:600; color:#fff`: `Sit to stand`
  - `.mono` `font-size:11px; color:#F2A79C`: `SET 2 · PAUSED BY SAFETY`
- (no `.live` pill here — unlike M5)

**Sheet — block statement** (`.r` `gap:11px; align-items:flex-start`)
- 34×34 tile, `border-radius:8px; background:var(--dang-w)`, centred 19×19 `#i-shield` `color:var(--dang)`
- `.c` `gap:3px`:
  - `.h1` `color:var(--dang)`: `We stopped the set`
  - `.b2` with two mono/600/`--ink` numbers:
    `Your knee bent to 96° against the 90° cap Ruth set, on three reps in a row.`

**Sheet — pain advice** (`.sunk.c` `gap:7px`)
- `.lb`: `If it hurts`
- `.b2`: `Stop and contact Ruth. If the pain is severe or you cannot bear weight, call your local emergency number. We will not ask you to carry on.`

**Sheet — log** (`.c` `gap:6px`)
- `.lb`: `Written to your log`
- `.mono` `font-size:11.5px; color:var(--ink2); line-height:1.6`, three lines separated by `<br>`:
  ```
  09:12 · BLOCKED · KNEE 96° > CAP 90°
  09:12 · REPS 6, 7, 8 · REASON ATTACHED
  09:12 · VISIBLE TO RUTH ALVAREZ
  ```
  (source encodes the `>` as `&gt;`)

**Sheet — actions** (`.c` `gap:9px`)
- `.btn.dang`: `Stop and contact Ruth`
- `.btn.sec`: `Switch to the seated version`
- Tertiary text link —
  `<div style="text-align:center;font-size:14.5px;font-weight:500;color:var(--ink2);padding:4px">`:
  `End session`

### Components
`cam sq`, flat dim `ovl`, `ovl stat`, bottom sheet (`--surf`, top radius 20px), `sunk`,
`btn dang`, `btn sec`, text link.

### State
**Blocking overlay state.** The camera keeps running underneath but is dimmed at 72% and the pose overlay
is removed. No affordance on this screen resumes or continues the exercise — the three actions are
stop/contact, switch to a seated variant, or end the session.

---

## M7 — Rest check-in

**Artboard:** `.ab.ph`, 390 × 844, light `--page`. No navbar.

### Vertical stack

1. `.stat`
2. `.pad.r` — `padding-top:6px; padding-bottom:12px` (header)
3. `.pad.c` — `gap:12px` (body)
4. `<div class="g"></div>`
5. `.pad.c` — `gap:9px; padding-bottom:16px` (footer)

### Content, verbatim

**Header**
- `.c.g` `gap:2px`:
  - `.h1`: `Set 2 done`
  - `.mono` `font-size:11.5px; color:var(--ink3)`: `48S REST · 2 QUESTIONS`
- `.chip.k-pain`: `REP 6 FLAGGED`

**Replay viewport** — `.cam` `height:172px; background:#08100F`
- single layer `#poseonly` (skeleton on near-black)
- `.ovl.chip.k-dk` `top:10px; left:10px`: `REP 6 · 00:47 INTO SET 2`
- Transport row — `.ovl.r` `left:10px; right:10px; bottom:10px; gap:9px`:
  - 16×16 `#i-play`, `color:#fff`
  - `.track.g` overridden `background:rgba(255,255,255,.2); position:relative; overflow:visible`
    - fill `<i style="width:46%;background:#3BE3D2">` → **playhead at 46%**
    - pain marker `<span>` absolutely at `left:78%; top:-2px`, 9×9 circle, `background:var(--pain)`
  - `.mono` `font-size:10.5px; color:rgba(255,255,255,.7)`: `0:03/0:06`

**Privacy note** — `.disc` `style="margin-top:-4px"`, 13×13 `#i-lock`:
`Skeleton only — there is no video of this rep, because none was ever kept.`

**Body-map card** — `.card.hair.c` `gap:10px`
- `.h2`: `Where was it?`
- Map container: `background:var(--sunk); border-radius:8px; height:126px; position:relative`
  containing an inline `<svg viewBox="0 0 320 126">` figure drawn in `#B9C4C6`:
  head `ellipse cx=186 cy=18 rx=11 ry=12`; torso `rect x=169 y=32 w=34 h=40 rx=8`;
  arms `rect x=154 y=35 w=11 h=32 rx=5` and `rect x=207 y=35 w=11 h=32 rx=5`;
  legs `rect x=171 y=74 w=13 h=44 rx=6` and `rect x=188 y=74 w=13 h=44 rx=6`;
  **pain marker** `circle cx=177 cy=92 r=13 fill=#B5410A` with halo
  `circle cx=177 cy=92 r=18.5 stroke=#B5410A opacity=.42` and leader line `path M108 92 h48`.
  Absolutely-positioned label `.mono` at `left:14px; top:84px; font-size:11px; font-weight:600;
  color:var(--pain)`: `LEFT KNEE`
- `.cap`: `Tap the spot. We log the region, not a diagnosis.`

**Pain-scale card** — `.card.hair.c` `gap:10px`
- `.h2`: `How did that left knee feel?`
- `.r` `gap:7px` with five equal `.c.g` cells
  (`align-items:center; gap:2px; padding:9px 0; border-radius:8px`):

| Value | Label | Background | Text colour | Selected |
|---|---|---|---|---|
| `1` | `None` | `var(--ok-w)` | `var(--ok)` | no |
| `2` | `Mild` | `#EAF2E2` | `#4F7A1F` | **yes** — `box-shadow: inset 0 0 0 2px #4F7A1F` |
| `3` | `Moderate` | `var(--warn-w)` | `var(--warn)` | no |
| `4` | `Strong` | `var(--pain-w)` | `var(--pain)` | no |
| `5` | `Severe` | `var(--dang-w)` | `var(--dang)` | no |

  Number is `.mono` `font-size:17px; font-weight:600`; label is `font-size:10.5px`.
- `.cap`: `Your answer is what gets recorded. What we saw only decided which question to ask.`

**Footer**
- `.btn`: `Continue — 1 exercise left`
- Tertiary text link —
  `<div style="text-align:center;font-size:14.5px;font-weight:500;color:var(--ink2);padding:4px">`:
  `I need to stop here`
- (no `.disc` in the footer — the only `.disc` on this screen is the privacy note above)

### Components
`chip k-pain`, `cam` (`poseonly` on `#08100F`), `chip k-dk`, `track` (with 46% fill + 78% marker),
`disc` (lock), `card hair` × 2, inline body-map SVG, 5-step pain scale, `btn`, text link.

### State
- Rest state between sets; rep 6 flagged.
- Replay scrubber sits at 46% of a 0:06 clip (`0:03/0:06`), with the pain event marked at 78%.
- Body map already has `LEFT KNEE` selected/marked.
- Pain scale has value `2 — Mild` selected (2px inset ring).

---

## M8 — Session summary

**Artboard:** `.ab.ph`, 390 × 844. **Navbar present, `Today` active.**

### Vertical stack

1. `.stat`
2. `.pad.c` — `padding-top:10px; gap:14px` (body)
3. `<div class="g"></div>`
4. `.pad.c` — `gap:9px; padding-bottom:12px` (footer)
5. `.navbar`

### Content, verbatim

**Title block** — `.c` `gap:4px`
- `.lb`: `Tuesday · 11 min 24 s`
- `.d1`: `Session done`

**Streak card** — `.card.c` `gap:9px; background:var(--teal-w); padding:14px`
- `.r` `gap:8px`: 16×16 `#i-flame` `color:var(--teal-d)` + `.lb` `color:var(--teal-d)`:
  `13 days in a row — your longest yet`
- `.r` `gap:4px` with **seven `.tick`** bars, all `background:var(--teal); height:6px` (all filled)

**Stat grid** — two `.r` rows, each `gap:10px; align-items:stretch`, each holding two
`.card.hair.c.g` at `gap:2px; padding:13px`.
Each cell: `.lb` label, then `.mono` `font-size:25px; font-weight:600; letter-spacing:-.02em` value,
then `.mono` `font-size:10.5px` sublabel.

| Cell | Label | Value | Sublabel | Sublabel colour |
|---|---|---|---|---|
| 1 | `Reps` | `28/28` | `ALL SETS FINISHED` | `var(--ok)` |
| 2 | `Form` | `82` | `+6 VS LAST TIME` | `var(--ok)` |
| 3 | `Discomfort` | `2/5` | `LEFT KNEE · REP 6` | `var(--pain)` |
| 4 | `Capture` | `Good` | `SCORES TRUSTWORTHY` | `var(--ink3)` |

**Observations** — `.c` `gap:10px`
- `.lb`: `What we noticed`
- Three `.r` `gap:10px; align-items:flex-start` rows, each led by a 5×5 dot
  (`border-radius:50%; margin-top:8px; flex:none`) and a `.b2`:

| Dot colour | Text |
|---|---|
| `var(--ok)` | `Your left side reached 4° further than last Tuesday.` (the `4°` is `.mono`, `font-weight:600`, `color:var(--ink)`) |
| `var(--ok)` | `You slowed the lowering phase — that is what we asked for.` |
| `var(--pain)` | `Rep 6 is saved for Ruth with its skeleton.` |

**Footer**
- `.btn`: `Done for today`
- `.btn.sec`: `Send a note to Ruth`
- `.disc` (`#i-shield`): `Coaching aid — not a medical device.`

**Navbar** — `Today` (on) · `Progress` · `Program` · `Sharing`

### Components
`card` (teal-w tinted), `tick` × 7 (6px), `card hair` × 4 in a 2×2 grid, bullet dots, `btn`, `btn sec`,
`disc`, `navbar`.

### State
Completed-session state: all 7 streak ticks filled, all four stat tiles populated, one pain-coloured
observation.

---

## M9 — Progress

**Artboard:** `.ab.ph`, 390 × 844. **Navbar present, `Progress` active.**

### Vertical stack

1. `.stat`
2. `.pad.c` — `padding-top:8px; gap:12px` (title + segmented control)
3. `.pad.c` — `gap:12px; padding-top:12px` (four cards)
4. `<div class="g"></div>`
5. `.pad` — `padding-bottom:10px`, wrapping a `.disc`
6. `.navbar`

### Content, verbatim

**Title** — `.d1`: `Progress`

**Segmented control** — `.seg` with three options: `This week` (**`.on`**), `Month`, `All time`

**Card 1 — streak** (`.card.hair.c` `gap:11px`)
- `.r`: `.h2.g` `13-day streak`, `.mono` `font-size:11px; color:var(--ink3)` `6 OF 7 DAYS`
- `.r` `gap:6px` with seven day columns; each column is `.c.g`
  (`align-items:center; gap:5px`) = a `.mono` `font-size:10px; color:var(--ink3)` letter above a
  `width:100%; height:30px; border-radius:6px` bar:

| Day letter | Bar |
|---|---|
| `M` | `background:var(--teal)` |
| `T` | `background:var(--teal)` |
| `W` | `background:var(--teal)` |
| `T` | `background:var(--teal)` |
| `F` | `background:var(--teal)` |
| `S` | `background:var(--sunk)` (missed) |
| `S` | `background:var(--teal-w); box-shadow: inset 0 0 0 1.5px var(--teal)` (today / outlined) |

**Card 2 — form score chart** (`.card.hair.c` `gap:10px`)
- `.r`: `.h2.g` `Form score`, `.chip.k-ok` `IMPROVING`
- Inline `<svg viewBox="0 0 318 92" style="width:100%;height:92px">`:
  - two gridlines `#E2E8E9` at `y=20` and `y=52` (full width)
  - area fill `#DCEBE8`: `M6 72 L58 64 L110 68 L162 48 L214 40 L266 44 L312 18 L312 92 L6 92 Z`
  - line `#0D6E68` `stroke-width:2.2`: `polyline 6,72 58,64 110,68 162,48 214,40 266,44 312,18`
  - endpoint `circle cx=312 cy=18 r=4.5 fill=#0D6E68`
  - endpoint label `text x=286 y=12`, IBM Plex Mono 11px, `#0D6E68`, weight 600: `82`
  - baseline label `text x=4 y=86`, IBM Plex Mono 9.5px, `#7C8C8F`: `62`

**Card 3 — symmetry** (`.card.hair.c` `gap:11px`)
- `.h2`: `Left vs right — knee extension`
- Row A — `.c` `gap:5px`:
  - `.r`: `.b2.g` `Left (operated)`, `.mono` `font-size:14px; font-weight:600; color:var(--pain)` `118°`
  - `.track` with `<i style="width:82%;background:var(--pain)">` → **82% fill**
- Row B — `.c` `gap:5px`:
  - `.r`: `.b2.g` `Right`, `.mono` `font-size:14px; font-weight:600; color:var(--ok)` `134°`
  - `.track` with `<i style="width:95%;background:var(--ok)">` → **95% fill**
- `.cap`: `The gap has closed 9° in three weeks.`

**Card 4 — discomfort** (`.card.hair.c` `gap:10px`)
- `.h2`: `Discomfort by region`
- `.r`: `.b2.g` `Left knee`, `.mono` `font-size:13px; font-weight:600` `2.1`, `.chip.k-ok` `IMPROVING`
- `.r`: `.b2.g` `Lower back`, `.mono` `font-size:13px; font-weight:600` `1.4`, `.chip.k-mute` `STABLE`

**Disclaimer** — `.disc` (`#i-shield`): `Coaching measurements, not a clinical assessment.`

**Navbar** — `Today` · `Progress` (on) · `Program` · `Sharing`

### Components
`seg` (with `.on`), `card hair` × 4, weekday bar row, inline area chart SVG, `track` × 2 (82% / 95%),
`chip k-ok` × 2, `chip k-mute`, `disc`, `navbar`.

### State
Segmented control on `This week`. Streak card shows 5 completed days, one missed (Saturday, sunk grey)
and one outlined "today" (Sunday). Form-score line ends at `82`, chart baseline `62`.

---

## M10 — Sharing & privacy

**Artboard:** `.ab.ph`, 390 × 844. **Navbar present, `Sharing` active.**
Screen title in the sheet caption is `Sharing &amp; privacy` (renders `Sharing & privacy`).

### Vertical stack

1. `.stat`
2. `.pad.c` — `padding-top:8px; gap:5px` (title block)
3. `.pad.c` — `gap:10px; padding-top:14px` (cards)
4. `<div class="g"></div>`
5. `.pad` — `padding-bottom:10px`, wrapping one `.btn.dang`
6. `.navbar`

### Content, verbatim

**Title block**
- `.d1` with `<br>`:
  ```
  Who can see
  your data
  ```
- `.b2`: `Switch any of this off at any time. It takes effect immediately.`

**Never-shared card** — `.card.c` `gap:7px; background:var(--teal-w)` (no `hair`)
- `.r` `gap:7px`: 15×15 `#i-lock` `color:var(--teal-d)` + `.lb` `color:var(--teal-d)`:
  `Never shared, by design`
- `.b2` `color:var(--teal-d)`:
  `Camera video. Pose runs on this phone and each frame is dropped as it is read — there is nothing to share, not even with us.`

**Three recipient cards** — each `.card.hair.c` `gap:9px`, containing a `.r` `gap:11px`
(36×36 avatar circle · `.c.g` `gap:1px` name + `.mono` meta · 44×26 toggle) then a `.b2` scope line.

Toggle markup: `width:44px; height:26px; border-radius:13px; position:relative; flex:none`
with a 20×20 white knob inset 3px — **on** = `background:var(--teal)` + knob at `right:3px`;
**off** = `background:var(--line-2)` + knob at `left:3px`.

| Avatar bg | Name (`15px/500`) | Meta (`.mono` `10.5px`, `--ink3`) | Toggle | Scope line (`.b2`) |
|---|---|---|---|---|
| `var(--teal-w)` | `Ruth Alvarez` | `PHYSIOTHERAPIST · SINCE 4 JUN` | **on** (teal) | `Full sessions, form scores, pain reports, safety events.` |
| `var(--sunk)` | `Dad (James)` | `CAREGIVER · SINCE 12 JUN` | **on** (teal) | `Whether you did today's session. Nothing else.` |
| `var(--sunk)` | `Northgate study` | `INVITATION · PENDING` | **off** (`--line-2`) | `Anonymised movement data only.` |

**Access log** — `.sunk.c` `gap:8px`
- `.lb`: `Who opened your data`
- Three `.r` rows, `.b2.g` on the left and `.mono` `font-size:10.5px; color:var(--ink3)` on the right:

| Event | Timestamp |
|---|---|
| `Ruth viewed Tuesday's session` | `2H AGO` |
| `Ruth exported a report` | `MON 09:12` |
| `Dad checked today's status` | `MON 20:04` |

**Footer**
- `.btn.dang`: `Download or delete everything`
- (no `.disc` on this screen)

**Navbar** — `Today` · `Progress` · `Program` · `Sharing` (on)

### Components
`card` (teal-w tinted), `card hair` × 3, custom pill toggle (on/off variants), avatar circles, `sunk`,
`btn dang`, `navbar`.

### State
Two consents on (Ruth Alvarez, Dad), one off/pending (Northgate study). Access log is populated with
three entries.

---

## Cross-screen notes

- **Placeholder people:** the patient is **Maya**; the physiotherapist is **Ruth Alvarez** (referred to
  as "Ruth" in body copy); the caregiver is **Dad (James)**; the research invitation is **Northgate study**.
- **Placeholder session data:** exercise `Sit to stand`, set 2 of 2, rep 7 of 10, elapsed `01:14`,
  form score `86` live / `82` at summary, knee `88°` against a `90°` cap, block event at `96°`,
  rep 6 flagged with pain level `2 — Mild` on the left knee, session length `11 min 24 s`,
  streak `12` on M2 and `13 days` on M8/M9, program `1/3 · ~9 MIN LEFT`, date `Tuesday · week 3`.
- **Every number is IBM Plex Mono.** Rep counts, angles, timers, scores, dates in `.lb`, and log lines all
  use `.mono` or `.lb`. No measurement is rendered in the sans body face anywhere in M1–M10.
- **Live vs replay is a deliberate visual distinction.** Live views (M1 hero, M4, M5, M6) render `#scene`
  (the room and the body). Replay/reference views (M3, M7) render `#poseonly` on a near-black plate
  (`var(--night)` on M3, `#08100F` on M7) with copy explaining that no video exists.
- **`btn.sm` and `.b1` are defined in the design system but unused on M1–M10.**
