# severedarchive — desktop window manager design

**Date:** 2026-07-31 (v3 feature spec; supersedes the stack portions of `2026-07-30-archive-stack-liquid-glass-design.md`)
**Scope:** the page stops being a single terminal window and becomes a **desktop**. The archive stack is replaced by a two-column file explorer; clicking a file opens a real draggable, closable window. Archive doubles to 12 files. Site-wide legibility pass.

## 1. Desktop shell

The root becomes a desktop that owns window state. Three layers, back to front:

1. **Backdrop** — fullscreen video (unchanged: crossfades to the focused file's thumb encode).
2. **Wordmark** — `SEVEREDARCHIVE` set large, pinned top-left, bleeding off the top and left edges.
3. **Window layer** — the explorer window plus up to three file windows, ordered by a z-stack.

The wordmark sits *below* the window layer specifically so every glass surface's `backdrop-filter` blurs and refracts it. That refraction is the point of the overprint — the letterforms distort behind the windows as they move.

### Window model

- **Explorer window** — the existing `TerminalWindow` (tabs ARCHIVE / ABOUT / LINKS). Draggable, **not closable**, so the desktop can never be emptied. Spawns centered-left.
- **File windows** — one per open file, max 3. Draggable, closable, focusable. Spawn in a cascade (each +28px right, +24px down from the last) clamped to stay on screen.
- **Focus** — clicking anywhere in a window raises it to the top of the z-stack and makes it the focused window. Exactly one window is focused at any time.
- **Close** — `✕` in the title bar. `Esc` closes the focused file window (never the explorer).

### The 3-window cap

Opening a 4th file is **refused**, not silently handled:

- The screen flashes white (full-viewport overlay, opacity 0 → 0.85 → 0) and `BUFFER FULL` prints across the desktop as large overprint type in the wordmark face, fading out fast. Total beat ≈ 450ms.
- No window opens. Nothing closes. The user closes one themselves.
- Reduced motion: no flash; `BUFFER FULL` appears and fades on opacity alone.

## 2. Two-column file explorer

Replaces `ArchiveStack` entirely inside the ARCHIVE tab.

### Layout (desktop)

| Left column | Right column |
| --- | --- |
| 12 file rows | Preview pane |
| `003  GLASS_RITE.MP4` | live thumb encode + metadata block |

- **Rows** — index, name, extension. Hover/keyboard-focus a row and the preview pane swaps to that file. Accent (`#b6ff2e`) marks the hovered/selected row only.
- **Preview pane** — plays the file's **240p thumb encode**, muted, looping. Below it: tagline · duration · year · resolution, set as a dim metadata block.
- **Click a row** (or the preview) → opens that file's window (§3).
- **Keyboard** — up/down move the selection, Enter opens. Left/right stay tab switching. The stack's `n` / `p` cycling is removed along with the stack.

### View toggle

`LIST` / `GRID`, top-right of the panel, persisting in the existing `localStorage` key `severedarchive.archiveView` (values migrate: any stored `stack` reads as `list`).

**GRID is the same list at a larger scale** — a wall of poster tiles, nothing more. There is no focused video in grid view. Clicking a tile switches the panel back to `LIST` and opens that file's window, so the interaction model is identical everywhere. The old FLIP zoom-to-stage and its `SND` toggle are deleted.

## 3. The swap-parent open animation

The single `<video>` element for a file exists in exactly one place at a time. Opening a window *moves* it rather than creating a second one.

Using `createLayout` from anime.js 4.5:

```js
import { createLayout } from 'animejs'

const layout = createLayout(desktopEl)          // root spanning both parents
layout.update(() => {
  windowBodyEl.appendChild(previewVideoEl)      // real DOM move
}, { duration: 520, ease: 'outExpo', swapAt: { opacity: 1 } })
```

`layout.update()` records the element's position before the callback, applies the DOM mutation, measures after, and FLIP-animates the delta — so the video appears to be **pulled out of the explorer's preview pane and into the new window**, tracking size and position across the reparent. `enterFrom` handles the window chrome fading in around it.

Closing reverses it: the video returns to the preview pane if that file is still selected, otherwise the window fades out and the element is destroyed.

**Constraint:** the explorer preview pane must reserve its box while the video is away (the pane holds a poster still), or the reparent measures against a collapsed layout and the animation reads wrong.

## 4. Window chrome

Explicitly replacing the old bottom bar. Nothing lives at the bottom of a window.

```
┌────────────────────────────────────────────┐
│ FILE_003 · GLASS_RITE.MP4      VOL ▮▮▯  ✕ │  ← title bar
├────────────────────────────────────────────┤
│                                            │
│                  video                     │
│                                            │
└────────────────────────────────────────────┘
```

- **Title bar** — the drag handle (`trigger` for the draggable). File index and name on the left, controls on the right. Focused windows get a brighter rim and full-opacity title; unfocused windows dim to `--dim`.
- **Volume** — collapsed to a `VOL ▮▮▯` button whose three bars show the current level at a glance. Click and it expands **inline in the title bar**, sliding the title left and revealing a horizontal slider (~120px) plus a numeric readout. Click elsewhere or blur to collapse. Expansion is a width + opacity transition, ~220ms.
- **Metadata does not appear in the window.** Tagline, duration, year and resolution live in the explorer preview pane.
- Window size hugs the video's intrinsic aspect ratio, as the stage does today (16:9, 9:16, 3:4 all display true-frame), capped to fit the viewport.

## 5. Dragging, bounds and bounce

`createDraggable` per window, created inside a `createScope` rooted on the desktop ref:

```js
createScope({ root: desktopRef, mediaQueries: { desktop: '(min-width: 861px)' } })
  .add((scope) => {
    if (!scope.matches.desktop) return
    const drag = createDraggable(windowEl, {
      trigger: titleBarEl,
      container: desktopEl,          // browser edges
      containerPadding: -24,         // windows may hang 24px off-screen
      containerFriction: 0.82,       // resistance while dragging past the edge
      releaseContainerFriction: 0.55,// lower than drag friction ⇒ overshoot on release
      releaseEase: createSpring({ stiffness: 120, damping: 14 }),
      onGrab: () => focusWindow(id),
    })
    return () => drag.revert()       // scope cleanup on unmount
  })
```

- `containerFriction` is clamped 0–1 and applied as `(1 - friction) * dragSpeed`; `0.82` gives a firm but rubbery edge. `releaseContainerFriction` below it produces the elastic settle back into bounds.
- Scope's constructor-function form gives us React-ref rooting, the desktop/mobile split as a media query, and automatic teardown on unmount — no manual cleanup bookkeeping.
- Reduced motion: `releaseEase` drops to `outQuad` and `releaseContainerFriction` rises to `1` (hard stop, no bounce).

## 6. Performance

The desktop must survive three open windows on a mid-range laptop.

### Playback tiers

- **Focused window** — `_full` (720p), audio enabled, volume from its own control.
- **Unfocused windows** — `_thumb` (240p), muted, still playing.
- **Explorer preview pane** — `_thumb`, muted.
- **Backdrop** — `_thumb` of the focused file (unchanged).

Ceiling with three windows open: **1 full-res + 4 low-res decodes** (2 unfocused windows, the explorer preview, the backdrop). `VideoDirector` extends from a single-focus cap to a focus-plus-background model; the `loadeddata` resync pattern stays.

If that proves too heavy in testing, the first thing to cut is the explorer preview — it pauses whenever any file window is open.

Both encodes are preloaded per open window (`preload="auto"` on the inactive source) so the focus swap doesn't flash a reload.

### Degraded-preview treatment

Unfocused windows and the explorer preview render their low-res source under a deliberate degradation overlay, so the softness reads as an intentional low-power mode rather than a broken encode:

- Scanlines (`repeating-linear-gradient`, 2px pitch, ~8% black).
- A tiled noise/dither PNG at low opacity, `mix-blend-mode: overlay`.
- Slight desaturation and a small contrast lift.

Pure CSS, no per-frame JS, no extra decode cost. Focusing a window transitions the overlay out over ~200ms — the picture visibly *resolves*, which doubles as the focus feedback.

### Glass budget

Concurrent `backdrop-filter` surfaces cap at 5 (explorer + 3 windows + the margin strips counted as one). The stack HUD is gone, so it no longer counts. Lite tier (`data-tier='lite'`) drops `backdrop-filter` from file windows entirely and uses the flat panel fill.

## 7. Typography

### Second display face (rule change)

CONTEXT.md's binding rule was Share Tech Mono only, single weight. **That rule is now amended:** exactly one additional face is permitted, used *only* for the overprint wordmark and the `BUFFER FULL` refusal.

- Face: **Archivo Black** (heavy grotesque, OFL). Self-hosted woff2, no CDN.
- **Subset to the 9 glyphs actually used** (`S E V R D A C H I` for the wordmark, plus `B U F L` for the refusal — 13 total) via `pyftsubset`. Expected payload ~3–4KB, which removes the usual objection to a second face.
- Every other character on the site remains Share Tech Mono, single weight. Emphasis still never comes from font-weight.

### Wordmark treatment

- `font-size: clamp(96px, 13vw, 260px)`, tight negative tracking, single line.
- Anchored top-left, bleeding off both edges (it is not meant to be fully readable).
- Low-alpha fill so it reads as printed *into* the backdrop, not floating on it.
- `aria-hidden` — it is decoration; the accessible site name stays in the explorer title bar.

### Scale bump

Current type runs 9–13px. New tokens, mapped across `index.css`:

| Token | Value | Replaces | Used for |
| --- | --- | --- | --- |
| `--fs-xs` | 12px | 9px, 10px | sliver labels, build stamp, readouts |
| `--fs-sm` | 13px | 11px | tabs, title bar, footer, HUD |
| `--fs-base` | 15px | 12px, 13px | body, file rows, panel copy |
| `--fs-lg` | 17px | — | metadata headers |

**12px is a hard floor** — no literal below `--fs-xs` survives anywhere in the stylesheet. Padding and line-height rise proportionally; the zero-scroll contract must be re-verified at every breakpoint after the bump, since the explorer now carries 12 rows instead of 6.

## 8. Mobile

Below 861px there are **no windows and no dragging**. The metaphor doesn't survive a 390px viewport, so it isn't attempted.

- The explorer collapses to a **single horizontal row** of poster tiles, slid with the finger (existing `useSwipe` hook plus CSS scroll-snap).
- Tapping a tile plays that file **as the primary view in place**, filling the panel body. Metadata sits below it. One file at a time.
- Swiping the primary view advances to the next file (today's stack gesture, preserved).
- The wordmark stays, scaled down, still behind.
- Lite tier rules unchanged.

## 9. Content

The archive doubles from 6 to 12 files.

- Six new Pexels placeholder clips, chosen in **varied aspect ratios** (9:16, 3:4, 1:1) specifically to stress-test the aspect-hugging window sizing, which today only ever sees 16:9-ish content.
- Processed through the existing `./scripts/process-media.sh` (thumb / full / poster per file).
- Entries appended to `ARCHIVE` in `src/data/archive.ts` with in-voice names, taglines, durations and years.
- These remain placeholders. Everything here is throwaway when real work lands.

## 10. Architecture

### New

- `src/components/Desktop.tsx` — window state (open list, z-order, focus, cap), refusal flash, wordmark. Owns the `createScope` root.
- `src/components/FileWindow.tsx` — chrome, drag wiring, volume control, playback tier.
- `src/components/ArchiveExplorer.tsx` — two-column list + preview pane; single-row variant on mobile.
- `src/components/VolumeControl.tsx` — collapsed button ↔ expanded slider.
- `src/lib/windowManager.ts` — pure functions: z-order, cascade spawn positions, cap enforcement. Unit-tested.
- `src/lib/layoutSwap.ts` — the `createLayout` reparent helper, isolated so the FLIP handoff can be reasoned about on its own.

### Changed

- `src/App.tsx` — renders `Desktop`; loses notification state.
- `src/components/TerminalWindow.tsx` — becomes a window instance (draggable, non-closable); `ALERT [1]` and `SEVEREDARCHIVE` title text both removed from the title bar, since the wordmark now carries the name.
- `src/components/ArchivePanel.tsx` — toggle values `list` / `grid`.
- `src/components/ArchiveGrid.tsx` — poster tiles only; click delegates to open-window.
- `src/lib/videoDirector.ts` — focus-plus-background model.
- `src/index.css` — type tokens, window chrome, degradation overlay, wordmark.

### Deleted

`ArchiveStack.tsx`, `HomeNotification.tsx`, `stackLayout.ts` (+ test), `flip.ts`, the `FileCard` focus stage and its `SND` toggle.

## 11. Testing

- **Unit** — `windowManager` (cap enforcement, z-order after focus, cascade clamping), existing suites kept green.
- **E2E (headless, always)** — open a window; open three; assert the 4th is refused and no window opened; close via `✕` and `Esc`; drag a window and assert it stays within bounds; grid click switches to list and opens a window; assert no vertical scroll at 1440 / 768 / 390 with 12 files.
- **Manual/visual** — the swap-parent reparent, the edge bounce, and the degradation overlay are judged by eye, consistent with the project's lean-process preference.

## 12. Risks

- **Reparenting a playing `<video>`** — moving a video element between parents in the DOM can pause it or drop the decode in some browsers. Needs an early spike; fallback is to reparent a poster still and hand off to the video on animation complete.
- **`createLayout` + `backdrop-filter`** — FLIP transforms on a glass ancestor can force expensive re-rasterization mid-animation. May need the glass suppressed on the window during the open beat.
- **12 rows + bigger type vs. zero-scroll** — the tightest constraint in the spec. If it doesn't fit at 768px, the explorer list gets its own internal scroll region (an explicit, bounded exception to the site-wide no-scroll rule) rather than shrinking type back down.

## 13. Out of scope

Real content, About/Links copy, window resize handles, window minimize/maximize, persisting window positions across reloads.
