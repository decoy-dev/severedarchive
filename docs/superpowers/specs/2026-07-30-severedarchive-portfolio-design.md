# severedarchive — portfolio site design

**Date:** 2026-07-30
**Client:** severedarchive (friend of Chris) — motion/visual artist; Blender renders set to music, still renders, metalheart/chromeheart + neo-2000s aesthetics.
**Reference set:** client's XP-Bliss window mockup (sharp central window, blurred-video glass margins, tabs at top-left); BRT Satellite Broadcast System still (amber terminal, dense panels, corner brackets); Aliens UA 571-C sentry screen (CRT menu grid); "Citizen Corporation" ID-card UI video (tab row, scanlines, dithered graphics, footer pager, button row).

## Concept

A single locked screen — zero scrolling anywhere, desktop and mobile — styled as a retro terminal operating system rendered in glass over live video. A full-bleed background video plays behind everything; the central "window" shows it sharp, and the margin between window and viewport edges shows it blurred (the glassmorphism lives in that border zone, per the client's mockup). All chrome is CRT-terminal-inspired: mono type, hairline borders, dense data labels, status readouts, static scanline texture, corner brackets.

Videos are the content: they appear as "files" in an archive grid, playing as small loops, and zoom to a focused stage on click. No project pages. The home/greeting appears as a notification pop-up, not a page.

## Visual language

- **Palette:** near-black panels, white/grey terminal text, hairline grey borders. Neutral/mono overall — the client's videos carry the color. One restrained silver/ice base accent plus a single hot accent — acid green — used only for active states; red appears solely in the notification alert. No gradients-as-depth, no amber/cyan phosphor cosplay.
- **Type:** terminal monospace (JetBrains Mono or similar) for everything; dense uppercase micro-labels (`FILE_001 // CHROME_SEQ.MP4`, `CONNECTED`, fake cache/PID readouts).
- **Texture:** static repeating-gradient scanlines over panels (never animated), notched/bracketed panel outlines à la BRT screen.
- **Glass:** `backdrop-filter: blur` on the margin frame only. Weak-device fallback: pre-rendered dark vignette frame, no live blur.

## Layout

- **Desktop/tablet:** centered terminal window over the background video; blurred glass margin around it. Title bar (`SEVEREDARCHIVE // FILE SYSTEM` + status readouts + notification bell), tab row at the window's top-left: `ARCHIVE`, `ABOUT`, `LINKS`.
- **Mobile:** purpose-built layout, not a shrunken desktop. Window goes near-full-bleed with a thin glass rim; navigation moves to a bottom tab bar for thumb reach; archive is a single-column stack of 2–3 cards per page; focused video takes over the full window. Same terminal language, different arrangement.
- **No scroll:** `overflow: hidden`, `100dvh` lock, like the 444 site. Content that exceeds the window paginates.

## Interaction

1. **Boot:** brief terminal boot beat (few log lines, fast), window draws in.
2. **Home notification:** greeting arrives as a terminal alert pop-up (`INCOMING TRANSMISSION` style) over the window — name, one-liner, dismiss. Dismiss reveals ARCHIVE tab. Re-summonable from the title-bar bell.
3. **Tabs:** click (or arrow keys) to switch; quick terminal-redraw transition of the window body. No routes — one screen.
4. **Archive grid:** fixed set of cards per page sized to fit the window (≈6 desktop / 4 tablet / 2–3 mobile), terminal pager `◄ 01/02 ►` for overflow (Citizen Corporation footer style).
5. **Card zoom (FLIP):** clicking a card lifts and zooms it to a large focused stage inside the window while remaining cards reshuffle around it — the client's "swap positions / zoom on click" ask. Focused state: full-res video, sound toggle, title/metadata readout. Click again / Esc / another card returns it. anime.js v4 drives it.

## Architecture

- **Stack:** Vite + React + Tailwind; shadcn primitives only where they fit the terminal chrome (heavily reskinned); Magic UI only on genuine aesthetic match — most chrome is bespoke. anime.js v4 modular API (`import { animate, createTimeline, stagger }`) for all motion. Static `dist/` output, no server.
- **Components:** `App` (screen lock, background video layers) → `GlassFrame` → `TerminalWindow` (title bar, status, tabs) → `ArchiveGrid` (+ `FocusStage`, pager), `AboutPanel`, `LinksPanel`, `BootSequence`, `HomeNotification`.
- **Video director:** one `useVideoDirector` hook owns all `<video>` play/pause state — playback cap, offscreen pausing, focus swaps route through it.

## Performance budget (older devices)

- Background loop ≤720p, heavily compressed; grid thumbs ~240p low-bitrate; full-res loads only on focus.
- Tiered playback: max 4–6 thumbs playing simultaneously; offscreen/other-tab videos paused. Low-power signals (`prefers-reduced-motion`, low `deviceMemory`, small screens) degrade grid to poster frames, only focused video plays.
- Animation is transform/opacity only; no layout thrash; scanlines static.
- Blur fallback per Visual language above.

## Content & assets

- 6–8 license-safe stock clips (Pexels/Coverr) skewing chrome/liquid-metal 3D, abstract loops, Y2K textures. ffmpeg pipeline per clip: background/thumb/full variants + poster frame.
- All archive metadata in one swappable `src/data/archive.ts`.
- About copy: short placeholder pointed at his real lane (motion/visual artist, Blender renders set to music, metalheart/chromeheart, neo-2000s). Links tab: placeholder Instagram/email/etc. Minimal, terminal-flavored; VOICE.md not applied (personal brand, not Chris's).
- DCY.DSGN ASCII header comment from 444's `index.html` verbatim at top of this site's `index.html`.

## Deployment

- Local project: `~/severedarchive-build`.
- GitHub: `decoy-dev/severedarchive` (public), Vite `base` configured for Pages, deployed this session.

## Verification

Headless Playwright (never headed) at 1440 / 768 / 390 widths: layout integrity, zero page scroll, tab switching, notification dismiss, card zoom animation, pager. Confirm playback cap behavior via DOM state.

## Out of scope

Project detail pages, CMS, real client content, sound design, analytics.
