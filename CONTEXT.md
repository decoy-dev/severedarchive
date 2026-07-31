# CONTEXT.md - severedarchive portfolio (resume point)

Last updated: 2026-07-31 (build `2758d7b`). This file is the session resume point: read it first when picking the project back up.

## What this is

Single-screen portfolio site for severedarchive (motion/visual artist: Blender renders set to music, metalheart/chromeheart, neo-2000s). CRT-terminal window rendered in liquid glass over a fullscreen video backdrop, zero scrolling on any device.

- **Live:** https://decoy-dev.github.io/severedarchive/
- **Repo:** decoy-dev/severedarchive (public), single branch `main`
- **Local:** ~/severedarchive-build

## Current UX (as deployed)

1. Boot log beat, then the terminal window draws in; "INCOMING TRANSMISSION" notification greets (re-summon via ALERT [1] in the title bar).
2. Tabs: ARCHIVE / ABOUT / LINKS. Arrow keys switch tabs. Mobile gets a bottom tab bar.
3. ARCHIVE defaults to the **stack view**: front card plays full-res inside a glass frame that hugs the video's intrinsic aspect ratio (16:9, 9:16, 3:4 all display true-frame). Other files are poster slivers on the right.
   - Desktop: hovering the right edge fans the slivers (labels visible, hovered strip magnifies ~7%); the fan pushes the stage away proportionally (dead space absorbed first, then translate, then scale; compositor transform transition). Click a sliver to bring it to front with a push transition (incoming slides from the sliver side, outgoing poster shoved out left). `n`/`p` cycle.
   - Touch: swipe the stage to advance/go back; slivers are tappable; NO fan (gated behind `hover: hover and pointer: fine` and width > 640).
   - The fullscreen backdrop crossfades to the front video's thumb encode; a dark scrim (rgba(4,6,8,0.45)) keeps chrome legible.
   - HUD: filename/metadata plus a terminal VOL slider (video.volume; placeholder encodes are silent, real content will have sound).
   - STACK/GRID toggle (persists in localStorage `severedarchive.archiveView`); grid is the older card grid with FLIP zoom, kept intact.
4. Default front card for the draft: `FILE_003` via `DEFAULT_FRONT_ID` in `src/data/archive.ts` (one-line change to alter).
5. Build stamp bottom-right (`BLD <sha> · <utc>`): compare with `git log --oneline -1` to detect a cached page.

## Architecture map

- `src/App.tsx` - screen lock, tier, tab state, backdropId state, boot/notification gating, build tag.
- `src/components/` - BackgroundVideo (crossfade layers), TerminalWindow (chrome + entrance), ArchivePanel (view toggle), ArchiveStack (stack view), ArchiveGrid + FileCard (grid view, FLIP focus), AboutPanel, LinksPanel, BootSequence, HomeNotification.
- `src/lib/` - videoDirector (playback cap + focus, judges live element state, loadeddata resync pattern), perfTier (full/lite + prefersReducedMotion + supportsLiquidRefraction), stackLayout, paginate, flip.
- `src/hooks/` - useSwipe (pointer events, mouse ignored), useCardsPerPage.
- `src/generated/displacementMap.ts` - build-time PNG data URL for the SVG refraction filter (regen: `npm run gen:map`). Filter SVG inlined in index.html, href injected in main.tsx.
- Media: `public/media/` - per file01..file06: `_thumb.mp4` (240p), `_full.mp4` (720p), `_poster.jpg`. bg.mp4 exists but is no longer referenced.

## Design rules (binding)

- Font: Share Tech Mono only, single weight, never font-weight for emphasis. NEVER JetBrains Mono.
- Accent `#b6ff2e` on active/hover states only; `#ff3524` only in the notification dot.
- Glass tokens in `:root` (`--glass-fill` rgba(10,13,16,0.5), blur 18px, rim colors). `.glass` utility; children of glass hosts need `position: relative; z-index: 2` (sheen stacking, see comment in index.css). Lite tier (`data-tier='lite'`: reduced motion, deviceMemory <= 4, width < 480) kills all backdrop-filter and plays posters in place of grid thumbs.
- Zero scrolling, ever. Animations transform/opacity only (known sanctioned exceptions: sliver width lerp on desktop fan, hover-only).
- anime.js v4 modular API only (`import { animate, createTimeline, stagger } from 'animejs'`).
- Git: commits under Chris's identity as-is. NEVER any Co-Authored-By, "Generated with Claude Code", or AI attribution anywhere in the repo.
- DCY.DSGN ASCII header comment stays verbatim at the top of index.html.

## Workflows

- Dev: `npm run dev`. Tests: `npm test` (29 vitest), `npm run e2e` (Playwright, ALWAYS headless, projects desktop 1440/tablet 768/mobile 390; mobile is lite tier).
- Deploy: **push does NOT trigger Actions** (verified suppressed platform-side; scopes and settings are fine). Deploy with:
  `gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive`
  then verify the live build stamp matches HEAD. Re-test the push trigger occasionally; it may be new-account throttling.
- Swap in real content: drop source mp4s in `raw/`, edit `src/data/archive.ts` entries, run `./scripts/process-media.sh`, commit, deploy. Set `DEFAULT_FRONT_ID` to whichever file should lead.

## Open items

- All 7 videos are Pexels stock placeholders; About/Links copy is placeholder (`mailto:hello@example.com`, commissions `#` link looks broken if clicked).
- Placeholder `_full` encodes are silent, so the VOL slider is inaudible until real content lands.
- Grid view's focus stage still uses object-fit cover and a SND toggle (not matched to the stack's contain + volume slider). Match if the grid view survives.
- No e2e coverage for reduced-motion paths, touch gestures, or the refraction (visual/probe verified only, per Chris's lean-process preference).
- Design docs: `docs/superpowers/specs/` and `docs/superpowers/plans/` hold the v1 and v2 specs/plans. `.superpowers/sdd/` ledgers are local-only (gitignored).
