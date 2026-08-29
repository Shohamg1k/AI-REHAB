# AI Rehab Coach — SVG artboards for Figma

47 screens exported as SVG, ready to drag into Figma. Generated from the rendered HTML designs, so
geometry, type metrics and line breaks match what you reviewed.

## Before you import

Make sure **IBM Plex Sans** and **IBM Plex Mono** are available in Figma. Both ship with Figma's
Google Fonts library, so this is usually automatic — check by searching the font picker.

This matters more than usual: every line of text is positioned absolutely. If a different font
substitutes, lines will not reflow, they will sit in the wrong place.

## Import

1. In Figma, `File > Place image…` or simply **drag the .svg files onto the canvas**. Multi-select
   works — you can drop a whole folder's worth at once.
2. Each file lands as one frame at its true pixel size (390×844, 834×1194, 1194×834, 1440×900).
3. Rename the frame to match the filename if you want the IDs preserved as layer names.

Everything arrives editable: text is real text, shapes are vectors, colours are fills.

## What is in each folder

| Folder | Count | Contents |
|---|---|---|
| `01-mobile-tablet/` | 13 | The current design pass — 10 mobile screens (390×844) and 3 tablet (834×1194 portrait, 1194×834 landscape) |
| `02-coverage/` | 27 | The feature-coverage set — 8 patient screens, 12 in-context states, 7 clinician and internal-tool screens |
| `03-desktop-clinician/` | 7 | The earlier desktop and clinician pass. **Older visual language** — these predate the second design pass and do not match `01`/`02` |

`manifest.json` lists every file with its dimensions.

## Known limits of the SVG route

These are inherent to SVG, not defects in the export:

- **No auto-layout.** Frames are flat, absolutely positioned. Rebuilding auto-layout on the screens
  you intend to iterate on is manual work.
- **No components or variables.** Fills carry hex values, not references to the token library. The
  `AIR Color` and `AIR Scale` collections already exist in the Figma file — you would rebind by hand.
- **Text is per-line.** A wrapped paragraph arrives as several text layers, one per rendered line.
  Merge them into a single text box if you need to edit the copy.
- **Blur and backdrop-blur are flattened.** Frosted overlays arrive as flat semi-transparent fills.
- **The camera scene** (room, chair, patient) imports as a vector group. It is a mockup of the
  self-view, not an asset — replace it with a real frame grab if you ever want a marketing render.

If you get Figma connector quota back, a native rebuild produces auto-layout, components and
variable bindings, and is the better long-term artifact. This route exists because that one is blocked.

## Re-running the export

`_source/` holds everything needed. Requires Node 18+ and Chrome installed at the default Windows path.

```bash
cd figma-svg/_source && node export.mjs . ../
```

`pagescript.js` is the DOM-to-SVG converter that runs inside the page; `export.mjs` drives headless
Chrome over the DevTools protocol. Edit the HTML sources, re-run, and the SVGs regenerate.
