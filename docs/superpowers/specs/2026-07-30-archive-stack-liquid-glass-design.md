# severedarchive — archive stack + liquid glass design

**Date:** 2026-07-30 (v2 feature spec; extends `2026-07-30-severedarchive-portfolio-design.md`)
**Scope:** two changes to the live site: (1) the ARCHIVE tab defaults to a video **stack** with a grid toggle; (2) a site-wide **liquid glass** surface system replacing the flat near-opaque panels.

## 1. Archive stack

### Interaction

- **Default view:** one primary card, centered-left in the panel, playing **full-res** with the existing focus contract (VideoDirector `setFocus`, sound toggle, metadata HUD below; no Close control — the stack has no unfocused state).
- **The stack:** the other five cards layer behind and to the right, each showing a ~24px poster sliver with its `FILE_00N` index label rotated 90° on the visible edge. Descending scale and z-index with depth.
- **Fan (desktop):** hovering the right-edge zone (the sliver region) fans slivers to ~72px, revealing poster + label per card. Clicking a fanned card animates it to front (~420ms outExpo); the displaced front card returns to its sequence slot; slivers re-pack.
- **Touch:** horizontal swipe on the front card advances next (swipe left) / previous (swipe right); tapping a visible sliver brings that card to front. On advance, the fan flashes briefly (~600ms) so the sequence stays legible.
- **Keyboard:** `n` / `p` cycle next/previous. (Left/right arrows remain tab switching.)
- **Order model:** fixed sequence (archive order), rotating front pointer. Bringing card 4 forward does not reshuffle the sequence; the stack always renders the next files in archive order behind the front card.

### View toggle

- Terminal-styled text toggle in the ARCHIVE panel's top-right: `STACK` / `GRID` (active one accent-highlighted, same convention as tabs).
- Grid view is the existing `ArchiveGrid` unchanged (cards, pager, FLIP zoom, Esc).
- Choice persists in `localStorage` (`severedarchive.archiveView`); default `stack`.
- Works on all viewports; on mobile the stack is the same model (front card near-full-width, slivers along the right edge).

### Tiers / motion

- Playback: front card full-res playing + background video = 2 playing videos max in stack view (lighter than the grid's 5). Slivers are poster `<img>`s — never videos.
- Lite tier: identical structure; front card still plays (focus), base-glass fallback per §2.
- `prefersReducedMotion()`: reorder/fan transitions snap instantly (existing gate pattern).

## 2. Liquid glass system

### Base glass recipe (all browsers, every glass surface)

- Panel fill drops from ~78% to **42% opacity** near-black (`rgba(10, 13, 16, 0.42)`); `backdrop-filter: blur(18px) saturate(1.6) brightness(1.08)`. (Tuning during the visual pass may adjust ±20% — final values land in `--glass-*` tokens.)
- **Rim light:** 1px top/left border in brighter translucent white (`rgba(255,255,255,.28)` range), darker bottom/right — beveled-thickness illusion.
- **Specular sheen:** diagonal white gradient overlay, 4–6% opacity, masked to the surface's top third.
- Soft outer shadow for lift.
- **Surfaces:** terminal window shell, tab row, notification, stack/focus HUD, stack front-card frame. Scanlines render on top of glass (CRT-over-glass is the target blend). Mono type and hairline data chrome unchanged.
- Concurrent backdrop-filter surfaces capped at ~4 (window, tabs/notification, HUD, front card) plus the existing margin strips.

### Hero refraction (progressive enhancement, exactly one element)

- The stack's **front card frame** gets true liquid refraction: SVG `feDisplacementMap` applied via `backdrop-filter: url(#...)`, using a **static, pre-generated** displacement map (edge-refraction ring — video bends at the card border) blended with a specular rim.
- Gated: Chromium-only capability (`CSS.supports('backdrop-filter','url(#x)')`-style detection) AND full tier. Card frame is fixed-size per breakpoint so the map never rebuilds (resize is the documented perf cliff).
- Safari/Firefox/lite: base glass recipe, visually seamless fallback.

### Lite tier

- Unchanged from today: opaque panels, vignette margin strips, no backdrop-filter anywhere.

## Architecture

- `ArchivePanel.tsx` (new, thin): owns view state + localStorage, renders toggle, mounts `ArchiveStack` or `ArchiveGrid`. App's ARCHIVE tab mounts this.
- `ArchiveStack.tsx` (new): stack state (front index over fixed order), fan state, swipe wiring; front card registers with the existing `VideoDirector` as focus.
- `src/lib/stackLayout.ts` (new, pure): `stackLayout(count, frontIndex, fanned) → {x, scale, z, sliver}` per position — vitest-tested.
- `src/hooks/useSwipe.ts` (new, ~30 lines, pointer events, no dependency).
- `src/lib/glass.css` additions live in `index.css` as a `.glass` utility class + per-surface application; displacement SVG inlined once in `index.html` (or a React portal) with the data-URL map generated at build time by a small script (`scripts/gen-displacement-map.mjs`) committed with its output.
- `ArchiveGrid.tsx`, `FileCard.tsx`, `VideoDirector`, FLIP lib: unchanged.

## Testing

- vitest: `stackLayout` position math (front at 0 offset, sliver widths, fan widths, wrap-around order).
- e2e `stack.spec.ts`: front video playing (`!paused` + advancing `currentTime`); hover right edge → fan visible (desktop project); click fanned card → `data-front` changes and new front plays full-res; `n`/`p` cycle; toggle → grid renders and old grid specs' entry helper covers both; toggle persists across reload; swipe advances (mobile project, touch emulation); zero scroll in all stack states.
- Existing grid e2e keeps passing: specs that assume the grid navigate via a shared `gotoGrid(page)` helper (dismiss notification → click GRID toggle).
- Glass: e2e asserts computed `backdrop-filter` contains `blur` on `.terminal-window` (full tier) and `none` on lite; hero refraction asserted only as "present when supported" (capability-conditional check), never required.
- Visual pass: headless screenshots at 3 widths, judged before commit.

## Out of scope

Reordering the archive sequence, stack drag gestures beyond swipe, refraction on more than one element, any grid changes.
