# CONTEXT.md — severedarchive portfolio (resume point)

Last updated: 2026-08-03, after the owner's revision pass. All six slices are done and deployed (branch `desktop-windows`; `main` is at the same commit). **Read this first when picking the project back up.**

## What this is

Single-screen portfolio site for severedarchive (motion/visual artist: Blender renders set to music, metalheart/chromeheart, neo-2000s). A **desktop**: video files open in draggable, closable windows over a fullscreen video backdrop, with a huge overprint wordmark behind everything. Zero scrolling on any device.

- **Live:** https://decoy-dev.github.io/severedarchive/ — serves `main`, but only when the deploy workflow is run by hand (`gh workflow run deploy.yml --ref main`). **Confirm the live build stamp before assuming any work is deployed.** CONTEXT has been wrong about this before.
- **Repo:** decoy-dev/severedarchive. `main` and `desktop-windows` now point at the same commit — the branch was merged after Slice C, so "28 commits ahead" is no longer true.
- **Local:** the tree this was last worked in. `raw/` (107MB of source video) is gitignored, was never pushed, and exists only on the machine that encoded it.

## Where we are

The v2 archive-stack build was replaced by a desktop window manager. Work was re-cut mid-flight from a 17-task plan into six slices (see "Why the plan changed" below).

| Slice | State |
| --- | --- |
| A — headless contracts | ✅ done |
| B — navigation surfaces (explorer + grid) | ✅ done |
| C — window media lifecycle, playback tiers | ✅ done |
| D — mobile | ✅ done |
| E — cleanup + docs | ✅ done |
| F — deploy | ✅ done |

All six slices are complete and deployed. The owner's 2026-08-03 revision pass (wordmark fit, thumbnail LIST, standby pane, refusal blowout, About ASCII object, close-button target) is also in and live.

## The live window dashboard — done, 2026-08-03

The standby pane is no longer only a prompt. With nothing open it reads `AWAITING SELECTION` plus the selected file; once anything is open it becomes a **dashboard for the active windows**, filling the box: one card per window, top of the z-stack first, each with a static grid (slot, z, run, frame, ratio, year) and a live one re-read every animation frame (POS, SIZE, TIME, FRAMES, DROP, BUF, RDY, SRC, VOL, AUDIO). Click a card to raise it, ✕ to close it. First open in a page load plays a ~2.4s bring-up log; after that cards just appear.

How the wiring landed, and the trap in it:

- **The rule was real and it was broken first.** `ArchiveExplorer` must not import `DesktopContext` (selection contract rule 1). The dashboard was built that way, it worked, and every test passed. What is open now travels the same way the opener does: `lib/windowRegistry.tsx` provides above `Desktop`, `Desktop` publishes into it from an effect, and the explorer reads. `src/components/surfaceIndependence.test.ts` is the executable version of the rule — it did not exist before, which is why nothing caught it.
- **The live half is not React state.** A rAF loop in `WindowDashboard` samples and writes `textContent` straight to the cells; re-rendering three cards 60×/s next to five decodes is not affordable. Reads are batched before writes, and an unchanged string is not written at all, so a still desktop costs nothing.
- **Sampling still goes through the owners.** The window's node comes from the registry (`WindowView.node`, backed by the map `Desktop` already keeps for drag), the element from `mediaController.videoFor(id)` — added for this. No `document.querySelector`, no finding media by DOM shape; `mediaLookup.test.ts` enforces it.
- Position has to be sampled from the live node: anime drags by transform and never tells React, so `OpenWindowInfo.x/y` is the spawn position forever.

**Tests: everything is green.** `npm test` 137/137, `npm run lint` clean, `npm run e2e` **75 passed / 54 skipped / 0 failed**. There are no expected-red tests, so **any** failure is a regression.

**Node compatibility:** `src/test/setup.ts` restores `localStorage` under vitest's jsdom environment. Node 26 defines an inert `localStorage` global, vitest skips copying any jsdom window key that already exists as a Node global, and `selection.test.tsx` then dies in `beforeEach`. It is a shim for the test environment only — no production code depends on it.

## Current UX

1. Boot log, then the terminal window draws in. No notification — it was deleted.
2. `SEVEREDARCHIVE` renders as huge Archivo Black display type across the top, **sized to fit the viewport in full** (10.1vw against a measured 9.657em string), **behind** the window layer so the glass blurs and refracts it. It used to bleed off both edges; the owner asked for the whole word to read. `smoke.spec.ts` asserts the fit.
3. Tabs: ARCHIVE / ABOUT / LINKS. Arrow keys switch tabs.
4. ARCHIVE defaults to **LIST** — a two-column explorer. On the **right**, a two-column thumbnail grid (the Windows medium-icons shape), each tile led by a video/photo glyph rather than an index number. On the **left**, one full-height box: `> AWAITING SELECTION.` plus the hovered file's metadata inside it, replaced by the live window dashboard as soon as anything is open. Tiles are on the right because cascading windows were landing on them and making them unclickable.
5. **Nothing plays on hover.** Hover and keyboard focus only select — they move the backdrop and the metadata readout. The explorer registers no media slot at all, so no decode happens anywhere in the pane.
6. **Clicking a tile opens a draggable window**, and that is the only thing that starts playback. Max 3 windows; a 4th is refused by blowing the whole stage out to near-white for 450ms with `BUFFER FULL` punched through it in black.
7. Focused window plays `_full` with audio available; unfocused windows drop to the 240p `_thumb`, muted, under a scanline/grain overlay so the low resolution reads as intentional.
8. Windows are **true-frame** — the aspect ratio applies to `.fw-body`, so the window is 40px taller than the media. No pillarboxing at any ratio.
9. GRID is the same file list as large poster tiles. Clicking a tile returns to LIST and opens that window. There is no focused video inside grid view.
10. **ABOUT** carries the extruded upload mark rendered through an ASCII pass, to the right of the copy — real 3D, so turning it changes the character density on its side faces. Its chunk and SVG are warmed on idle after boot, so the first visit does not pop in. Not mounted below 641px (no room, and it keeps the three.js chunk off phones).
11. **Mobile chrome:** the terminal's top margin is asymmetric (38px against 10px elsewhere) so the overprint wordmark has a band to be read in — at a uniform margin the panel started at y10 against a wordmark running y4–30 and hid it. The primary player is capped at 42vh so the space it gives up is split around it rather than pooling beneath. The build stamp is hidden: it sat behind the tab bar and could not be read, and it is a deploy check for someone who is not on a phone. Every tile carries its media-kind glyph over the poster, with a scrim, because these thumbnails run from near-black to pale mint and a hairline icon vanishes on half of them.
12. **Below 861px the explorer does not render at all.** `ArchiveMobile` takes its place: one true-frame primary player, the file's metadata, and a single horizontally-scrolling row of poster tiles. Tapping a tile selects it; swiping the player advances selection; the row keeps the selected tile in view. No window is ever created, and GRID still works at every width. Mobile is the one surface where a video still plays in place.
13. Build stamp bottom-right (`BLD <sha> · <utc>`) — compare against `git log --oneline -1` to detect a cached page.

## Architecture map

**The media lifecycle is the load-bearing part.** Two separate page-blanking crashes were found and fixed in it; do not restructure it casually.

- `src/lib/mediaController.ts` — owns every media node. One `<video>` per file, held in a host div React does not own. Surfaces register **empty slots**; the controller reconciles a desired placement map into DOM moves, keyed by `fileId`, priority `window > primary > preview`. This is what makes the reparent safe from React's unguarded `removeChild`.
- `src/components/MediaLayer.tsx` — renders `src` declaratively from `wantsMedia()`. **Never write `src` imperatively** — a source-level test fails the build if you do.
- `src/lib/selection.tsx` + `activation.ts` — one file-selection contract shared by explorer, grid and mobile. `activate` always selects first.
- `src/lib/placement.ts` — pure: current state in, desired placement map + focus out. This is where the perf-tier policy lives (lite places exactly one node, the focused window or the mobile primary; full places everything). `Desktop` does nothing with the result but hand it to `reconcile`.
- `src/hooks/useIsDesktop.ts` — the single desktop/mobile split, read from `DESKTOP_MIN_WIDTH` so "windows open here" and "the mobile row renders here" cannot drift into two breakpoints.
- `src/components/ArchiveMobile.tsx` — the mobile surface. Same slot discipline as the explorer: an empty `primary` slot over a poster, never a `<video>` in JSX.
- `src/components/AboutAsciiObject.tsx` — three.js + `AsciiEffect`, ported from `docs/prototypes/about-ascii-3d/` with its tuned constants intact. **`strResolution: 'low'` and `invert: false` are not arbitrary** — see the comments in the file; changing either misaligns the character grid or fills the field. Lazy-loaded: three.js is ~585kB and is its own chunk, fetched only when ABOUT opens.
- `src/hooks/useMediaQuery.ts` — one reactive media query; `useIsDesktop` is the named 861px case built on it.
- `src/components/WindowDashboard.tsx` — what the explorer's box becomes once anything is open: one card per window, filling the box. Each card carries a static grid (slot, z, run, frame, ratio, year) and a **live** one re-read every animation frame. Click a card to raise, ✕ to close. A readout only — it owns no window state and renders no media; both verbs delegate to Desktop.
- `src/lib/telemetry.ts` — the live readout's formatting, pure over a sample: POS/SIZE from the window's rect, TIME, FRAMES, DROP, BUF, RDY, SRC, VOL, AUDIO from its `<video>`. The sampling is a rAF loop in the dashboard that writes `textContent` straight to the cells — **not** React state: re-rendering three cards 60×/s beside five decodes is not affordable. Reads are batched before writes, and an unchanged string is not written at all.
- `src/components/MediaKindIcon.tsx` — the video/photo glyph that replaced the 001/002 index in the explorer tiles, driven by `ArchiveFile.kind`. Inline SVG on `currentColor` so the accent rules reach it. Everything in the archive is `video` today; `photo` is drawn and unused until a still is added.
- **Nothing in the interface numbers files.** `FILE_00x` is gone from windows, cards, the grid, the mobile readout and every accessible name, and the `index` field is gone from `ArchiveEntry` — a file is its name, which `archive.test.ts` now requires to be unique. Do not reintroduce a display index.
- `src/lib/loopFade.ts` — when a looping clip should dip and when it should come back, as a pure decision over the clock. Wired to the backdrop only (`BackgroundVideo`); window playback still hard-cuts at the wrap. It is a dip through the backdrop, **not** a crossfade: a crossfade needs head and tail on screen together, i.e. a second decoder per clip, and `MAX_PLAYING` is the tightest resource in the app.
- `src/lib/windowManager.ts` — pure z-order, focus, 3-window cap, slot allocation, cascade positions. No React, no DOM.
- `src/lib/mediaMove.ts` — the single-element FLIP for the open beat.
- `src/lib/keyboard.ts` — the keydown guard (arrow keys must not fire from inside a range input).
- `src/components/` — `Desktop` (window state, drag, refusal), `FileWindow` (chrome), `VolumeControl`, `ArchiveExplorer`, `ArchiveGrid`, `TerminalWindow`, `BackgroundVideo`, `BootSequence`, panels.
- `src/data/mediaMeta.generated.ts` — build-generated `width`/`height`/`durationSec` per file, probed from `public/media/*_full.mp4`. Regenerate when media changes; a guard test fails if it drifts.
- Media: `public/media/` — `_thumb.mp4` (240p), `_full.mp4` (720p), `_poster.jpg` per file01..file12.

**Deleted in Slice E:** `ArchiveStack.tsx`, `HomeNotification.tsx`, `stackLayout.ts` (+ test), and ~110 lines of dead stack/notification CSS. `grep -rn "ArchiveStack\|HomeNotification\|stackLayout\|lib/flip" src tests` returns nothing.

## Design rules (binding)

- Font: **VT323** for all interface text, single weight. It replaced Share Tech Mono at the owner's request; because its glyphs are small and light for their em, the type tokens were lifted +3px (`--fs-xs` 15 / `--fs-sm` 16 / `--fs-base` 18 / `--fs-lg` 20) so the 12px apparent floor still means what it says. Changing the face back means bringing those down again. Emphasis NEVER from `font-weight`. **One exception:** Archivo Black (`--display`), used only for the wordmark and `BUFFER FULL`.
- Accent `#b6ff2e` on active/hover only. `--alert` `#ff3524` is now unused: the refusal type is black against the blowout.
- Backdrop scrim is `rgba(4,6,8,0.66)` — raised from 0.45 because the archive doubled and brought in bright clips that washed out every glass surface. Global, deliberately not per-clip adaptive.
- **Zero page scrolling, ever.** `.stage` uses `overflow: clip`, NOT `hidden` — `hidden` makes it a scroll container, and the oversized wordmark gave it ~215px of hidden overflow that browsers would scroll to reveal a focused row, shunting the whole desktop sideways. Do not change this back.
- Animations transform/opacity only. **Sanctioned exceptions:** volume control `max-width`, degradation `filter`, mobile row `overflow-x`, and the refusal blowout's `filter` on `.stage` (owner-requested). In that keyframe `contrast()` must come **before** `brightness()` — filters apply left to right, and lifting the blacks first is what makes a near-black clip blow out with everything else. Brightness alone left the dark clips dark and the black type vanished against exactly the surface it was meant to punch through.
- anime.js v4 modular API only (`import { animate, createDraggable, createScope } from 'animejs'`). **`createLayout` is banned** — the reparent is a single-element FLIP.
- No engine-conditional media paths. Chromium, WebKit and Firefox were all measured keeping `<video>` playing across a same-document reparent (`readyState` 4→4, buffered intact).
- Desktop/mobile split is a **width query at 861px**, deliberately not pointer capability — touch tablets get the full desktop.
- The terminal/explorer window is a **fixed background layer**: not draggable, never raises, not in the focus stack.
- **A window's drag handle is its title, never the whole title bar.** The bar was the handle with the controls inside it, so pressing ✕ or VOL started a drag — anime takes pointer capture, and a press that drifts 2–3px then delivers its click to the capture target instead of the button. The ✕ did nothing for anyone who does not click perfectly still, and the volume slider dragged the window. `.fw-title` stretches to fill the bar, so the grabbable area still looks like the whole bar. The ✕ also commits on `pointerdown` (with `onClick` kept for the keyboard), so no re-render or reconcile downstream can swallow it. `explorer.spec.ts`'s "a press that drifts still closes" is the guard.
- The window title bar shows `NAME.MP4` only. `FILE_00x` was dropped there because a portrait bar is ~250px and the index pushed the name into VOL; the index still leads every dashboard card, the grid, and the ✕'s accessible name.
- The ABOUT object's chunk and its SVG are warmed on idle after boot (`preloadAboutObject`, called from `AppShell`), so the first visit renders instead of popping in. The width gate matches `hasRoom` — a phone must never fetch 590kB of three.js for something it will not mount.
- The backdrop loop is a **cross dissolve**, not a dip: near the tail, a second element starts the same clip from zero and fades in over the first, so head and tail are on screen together and nothing ever darkens. `lib/loopFade.ts` decides when to hand over. An earlier dip-to-floor version was a fade to black and was wrong.
- **`lazy` + `Suspense` is banned for the ABOUT object.** React throttles hiding a Suspense fallback (~300ms) so a fast resolution cannot flicker, which held the column empty for 300ms even with the chunk, SVG, extruded solid and WebGL context all warmed. The module is resolved into state instead. Measured: 393ms → 54ms from click to live.
- The ABOUT object's renderer and extruded geometry are built once at start-up (`warmAboutObject`) and **never disposed** — the object is a singleton, and a retained WebGL context costs what the old code paid per visit, minus the wait.
- The session dot pulses every 5s and drives a grainy wave across the title bar (`lib/pulseWave.ts`, `SessionPulse.tsx`). **One uniform reach**, so the front travels at one speed in every direction. Per-direction reaches were tried — they make the front land on both edges together, but the right side then crawls while the left races, which reads as two waves leaving one dot. The right edge is ~100px away and lights almost at once; it stays lit because there is no hard back edge.
- The window dashboard runs a ~2.4s bring-up the **first time** anything is opened in a page load, then never again. The flag is module scope in `WindowDashboard.tsx` on purpose: the component unmounts whenever the last window closes and on every trip to ABOUT, so component state would replay it.
- Git: commits under Chris's identity as-is. **NEVER** any `Co-Authored-By`, "Generated with Claude Code", or AI attribution anywhere in the repo.
- The DCY.DSGN ASCII header comment stays verbatim at the top of `index.html`.
- The wordmark is **cut in half by the panel's top edge** at every width, positioned against `--panel-top` rather than against `--frame` so it holds on mobile too (frame 10px, panel top 38px). `smoke.spec.ts` and `mobile.spec.ts` assert the ratio.
- Closing a window **dissolves** it first (`lib/dissolve.ts`, ~420ms) and only then closes. The close is deferred rather than animated on the way out: the media node belongs to the controller and `closeWindow` reconciles it away synchronously, so starting that first would leave the dissolve painting over an empty frame.
- The About object is centred in the **gap between the VISIBLE EDGE of whatever is to its left and the panel's inner right edge**, read structurally (previous sibling's *children*, plus parent padding) at fit time. The children's edges, not the track's: `.panel-block` is `max-width: 560px`, so measured at 2000px the copy's grid track ended at 1055px while its blocks ended at 664px — centring in the gap that starts at 1055 puts the mark ~195px right of where the eye puts it. That is the offset that survived five rounds of fixes, and it survived them because every verification measured against the same track edge the placement did. `src/lib/asciiBand.ts` owns the arithmetic and is unit-tested. The band falls back to the element's own box when the sibling is **above** rather than beside it (`isBeside`): in the one-column layout the copy spans the full width, so its right edge IS the panel's, and using it threw the mark off the right of the screen — visible only once paint containment stopped hiding it. Read — NOT in the middle of its own grid column. Those coincide only when the copy fills its track, and it does not always: measured at 2000px wide, the copy ended at 53% here and 38% on the owner's machine, so the gap's centre was 135px further left for him while the mark sat where its column put it. The mark was centred; it was centred in the wrong space. The previous sibling is in the ResizeObserver for the same reason. `.ascii-object` uses `contain: layout style`, **never `strict`** — strict includes paint containment, which clips to the column, and when the copy is narrow the centring translate is ~160px against ~15px of slack, so the clip silently clamped it and the mark stayed off to the right whatever the fit computed.
- The About object is centred by the **centroid** of its lit characters, not the centre of their bounding box, and the poses are sampled uniformly in TIME rather than in angle. Both matter: sparse outliers where the rim light catches an edge push a bounding box much further than they push the eye, and the sway eases so equal angles under-weight the poses it lingers in. Verified in pixels over 18–30s (the four sways at 3600/3000/4200/2600ms do not repeat sooner): bbox 0.3px, mass −2.8px. It swings ±40px as it turns, so a single frame always looks off — that is the rotation.
- Closing a window **clips** it apart (`dissolveClipPath`), it does not draw over it. There is no `destination-out` for `mix-blend-mode` — that is a canvas operator — so an overlay cannot punch through, and painting cells leaves the panel standing as a rectangle filling in.
- The glass margin is **one layer with a hole in it** (`.glass-frame`, clipped to a picture-frame polygon), never four strips. Four strips is where every version of the corner seam came from: adjacent `backdrop-filter` surfaces each blur their own box and rasterise their own edge, so their join shows whatever the geometry — exact tiling left a hairline, and overlapping them by a pixel put a strip under the translucent terminal where its edge drew across the footer instead. There is no arrangement of four boxes that works. Do not reintroduce them.
- The admin login lives in the terminal footer (`AdminLogin.tsx`), and authenticating opens `AdminPanel` — upload form and ABOUT/LINKS editor. It holds no secret and decides nothing — the Worker answers, and a wrong passcode and an unconfigured deployment are both 401 by design. `ALLOWED_ORIGIN` is a **comma-separated allow-list** and includes the dev origins; the Worker echoes whichever asked, because `credentials: include` makes a browser refuse `*`.
- Link icons are **Lucide's** `mail`/`mail-open`/`inbox` (ISC) on their native 24-unit grid. Instagram stays hand-drawn on a 32-unit grid because Lucide carries no brand marks. Do not hand-draw replacements for the others — that is what these replaced.
- The favicon is the traced upload mark (`public/favicon.svg`, same source as the About object) and **flips ink with `prefers-color-scheme`** — a favicon is 16px against a strip that is near-white in one theme and near-black in the other, so one baked-in colour is a smudge in half of them. The 32px PNG beside it is only for browsers that refuse an SVG favicon, and is a mid-grey because it cannot know the theme.

## Governing documents

- **`docs/superpowers/specs/2026-07-31-ownership-contract.md`** — the authoritative design for all remaining work. Ownership table, media lifecycle, selection contract, and Slices A–F with acceptance criteria and one proving test each. **Start here.**
- `docs/superpowers/specs/2026-07-31-desktop-windows-design.md` — the v3 feature spec.
- `docs/superpowers/plans/2026-07-31-desktop-windows.md` — Tasks 1–9 are accurate history. **Tasks 10–17 are marked superseded and must not be implemented** — they crash the page.
- `docs/CODEX-REVIEW.md` — external review that triggered the re-plan.
- `.superpowers/sdd/2026-07-31-desktop-windows/progress.md` — the ledger (gitignored, local only). Every ruling and deferred finding.

## Why the plan changed

A fresh-context preflight found that the original Tasks 10 and 11 **crashed the page**: Task 10 rendered the preview `<video>` with `key={file.id}`, Task 11 moved that node out with `appendChild`, and React 19's unguarded `removeChild` then deleted against the wrong parent on the next hover — `NotFoundError`, root unmounts, page blanks. Both tasks passed review individually; the bug lived only in their interaction.

The remaining work was re-cut along **ownership boundaries** instead of file boundaries, and the plan stopped prescribing code (every defect in phases 1–3 traced back to speculative code written into the plan and reasonably trusted by implementers). Dispatches now carry acceptance criteria and invariants, not recipes.

## Outstanding bugs and deferred work

**Needs a decision**
- **The 28/24px window cascade is too tight.** Three 16:9 windows are all 720×446 at 1440px, so the back two are ~97% covered — "max 3 windows" currently reads as a stack of one. Either widen the cascade, vary spawn size, or offset more aggressively. **The window dashboard now has a stake in this.** It fills the explorer box (x 104–1020, y 225–774 at 1440×900), which sits under the cascade, so with the buffer full each card is read down its left edge and through the band below y 645. That is an accepted trade — the owner asked for the box filled with stats — but it is why each card's ✕ *leads* the card instead of trailing it: the left ~40px is the only column windows never reach. `explorer.spec.ts`'s "every card can be closed with the buffer full" is the guard, and it is what breaks first if the cascade is re-based.
- **Decode ceiling has never been measured.** 1 full + 2 thumb + 1 preview + 1 backdrop = 5 concurrent decodes. If it fails on real hardware, the contract names the first cut: pause the explorer preview whenever a window is open.

**Left over from Slice D — needs a decision**
- **The terminal chrome still switches at 640px while everything else switches at 861px.** Between 641 and 860 (the 768px tablet project) you get the mobile archive inside desktop chrome — tabs on top rather than at the bottom. Not broken, just inconsistent. Moving the `@media (max-width: 640px)` chrome block to 860 is a one-line change but a visible one at tablet, so it was left alone.
- The contract contradicts itself on 768px: §3 says "768 (window opens)" while §3 rule 3 and §4 both say no window below 861. The implementation follows 861, `desktop.spec.ts` enforces it, and the prose is what is wrong.

**Consequences of the owner's 2026-08-03 revisions**
- **The preview→window FLIP no longer has a source.** The signature open beat was the preview video physically re-parenting into the window and continuing to play. With the pane holding no media, a window now builds its node directly and `flipMove` has nothing to fly. The machinery is untouched and still load-bearing for windows and mobile — only the desktop origin is gone. If the motion is wanted back, the natural origin is the clicked thumbnail's rect.
- `--alert` and the `.refusal-flash` element are gone from the refusal; the element was deleted with the white fill.

**Left over from Slice E — needs a decision**
- **Liquid refraction is now an orphaned subsystem.** `.stack-stage.liquid` was its only consumer and went with the stack, so `supportsLiquidRefraction()` (`perfTier.ts`), the `#liquid-refraction` SVG filter in `index.html`, the `main.tsx` wiring and `scripts/gen-displacement-map.mjs` are all unreferenced. Nothing currently applies refraction to any surface. It was left intact rather than half-deleted: reapplying it to `.glass` (windows, terminal) is a product decision, and deleting it is one too. Pick one.

**Fixed in Slice E**
- `boot.spec.ts` and `smoke.spec.ts` rewritten against what the app now is. Both gained a test rather than just losing assertions: boot asserts nothing is waiting to be dismissed, smoke asserts `.stage` clips rather than scrolls — a guard for the `overflow: clip` ruling, which had none.
- The boot log said `6 FILES INDEXED` long after the archive doubled to 12. Now derived from `ARCHIVE.length`.
- `.tw-bell` and the duplicate `[data-tier='lite'] .file-window` rule deleted.
- `.refusal` was unreachable behind `.build-tag`: the flash is z-index 50 inside `.desktop`, but `.desktop` is 2 and the stamp was 6, so the stamp painted over every descendant regardless. `.desktop` → 3, `.build-tag` → 2.
- Two backlog entries were already fixed and are struck: `process-media.sh` discovers `raw/file*.mp4` (it does not enumerate), and `--fs-lg` is in use at `.preview-meta-head`.

**Smaller, unassigned**
- `BUFFER FULL` does not announce to screen readers reliably (live region inserted with its text).
- Window shows its poster for ~100–300ms after opening while `_full` loads — a real reload, not a seamless upgrade.
- `file10`'s tagline says "square format test" but `file10` is 3:4; `file09` is the actual square.
- `file07` is the only clip with an audio track and carries inherited Vimeo container metadata.
- About-page ASCII object (`public/assets/about-upload-mark.svg`, generated by `scripts/trace-about-symbol.py`) is committed but **not yet referenced anywhere in `src/`**.

## Admin backend (in progress)

Spec: **`docs/superpowers/specs/2026-08-04-admin-backend.md`** — read it before touching any of this.

Owner decisions: GitHub stays the store, auth must be genuinely private, **only renditions are committed and raws never are** (uploads included). Those three do not fit a purely static site — a passcode the browser checks is one a visitor can read — so a Cloudflare Worker holds the two secrets and nothing else, GitHub Actions runs ffmpeg, and raws stage as a **draft-release asset** (outside the git tree) that the run deletes.

- `server/auth.ts` — PBKDF2 passcode records (iteration count carried in the record), HMAC session tokens. Constant-time compares; signature verified **before** the payload is parsed. A malformed env var reads as "no", never as a pass or a crash.
- `server/ratelimit.ts` — fixed-window counter over a KV-shaped store. Keyed on `CF-Connecting-IP` because `X-Forwarded-For` is caller-supplied and keying on it would defeat the limit entirely. Refused attempts are counted too.
- `server/entry.ts` — upload validation and `byNewest`. The name is the identity now that nothing is numbered, so duplicates are rejected; `postUrl` is http(s)-only because it becomes an href.
- `server/github.ts`, `server/worker.ts` — staging, dispatch, and the three endpoints. No response ever carries a secret or an upstream message.
- `wrangler.toml` — config only. Secrets go in with `wrangler secret put`, never the repo.
- `.github/workflows/ingest.yml` + `scripts/process-upload.sh` — the transcoder. The ladder is duplicated from `process-media.sh`'s per-file loop and **must stay in step with it**: a thumb whose ratio drifts from its full is the letterboxing the true-frame ruling forbids.

**The app reads uploads now.** `archive.ts` imports `src/data/entries.json` (written by the ingest run, empty until the first upload) and puts those entries **on top, newest first**, with the hand-arranged twelve beneath in their order. The twelve deliberately carry no `date`: they have a `year` and a curated sequence, and inventing a day for each to sort by would reorder an arrangement nobody asked to change. Give one a real date and it joins the sort.

The `(i)` control (`InfoPopover.tsx`) sits in the window title bar and in each dashboard card's control column, and shows the description and date. Legacy entries fall back to their tagline and show the year alone rather than a fabricated day. On the dashboard it is a **sibling** of the card, never a child — the card is itself a button, and a button inside a button is invalid markup React reports at runtime (it did).

**Editing existing entries** (`EntryEditPanel.tsx`, `POST`/`DELETE /api/entry/:id`, `.github/workflows/edit.yml`, `scripts/edit-entry.mjs`). Signing in puts EDIT in each focused window's title bar. Rulings worth keeping:

- Edits to the twelve originals land in **`src/data/overrides.json`** and are merged over the entry at load, rather than a workflow rewriting `archive.ts` — data a bad edit can only make wrong, not source a stray quote can break. `removed` drops an entry entirely and the run deletes its three renditions in the same commit.
- Patches apply **before** the sort and before the metadata lookup. Before the sort because a patch may set a `date` and the promise above is that this makes an entry join it; before the lookup because a removed entry's generated metadata is gone with its files and `ARCHIVE` throws on a missing one.
- **The id never changes.** It names every rendition on disk, so a rename is a display-name change and a replacement file is transcoded to the *same* id, overwriting in place.
- Removal needs the name typed back, compared **trimmed and case-folded and nothing else**. Reusing `normaliseName` here accepted `GLASS RITE!` as confirmation of `GLASS_RITE` — it maps spaces to underscores and strips punctuation. A test caught it.
- **Both admin panels are portalled to `document.body`.** They are `position: fixed` with a high z-index, which is not the same as being above everything: z-index orders siblings within a stacking context, and these were rendered inside one (the publish panel in the terminal, the editor in the file window). Neither could be dragged, because the pointerdown never reached the handle. A window is worse still — it takes a `clip-path` while it dissolves, and a clip applies to fixed descendants.

**The thumbnail editor** (`ThumbnailEditor.tsx`, `src/lib/thumbCrop.ts`, `scripts/render-poster.sh`) — which frame the still comes from, how it is cropped, or a supplied image instead. Available on upload and on any existing entry.

- The crop is on the **still only**. An unfocused window plays `_thumb.mp4` in a box laid out from `_full.mp4`, so those two must share an aspect to 0.1% (the true-frame ruling) — cropping the thumb video would letterbox every unfocused window. Owner's choice, 2026-08-04: the clip's own framing is never touched.
- So the crop is a **zoom and a focal point**, not a free rectangle: the poster drops into a tile shaped by the clip and has to keep that shape. `cx`/`cy` are 0..1 and mean exactly what a CSS `transform-origin` percentage means — the editor previews by scaling the real video about that origin and ffmpeg cuts the rectangle derived from the same numbers. `x = cx * (width - w)` on both sides.
- **`scripts/crop-parity.test.ts` is what makes "what you drag is what you get" a fact** rather than a claim: it runs the real script and holds its crop to `cropPixels`. It found a 1px disagreement — the script measured the offset against the even-snapped crop size and `cropPixels` against the fractional rect. The script was right.
- A thumbnail-only edit re-renders from the committed `_full.mp4` and **does not re-encode the clip**; `render-poster.sh` exists separately for exactly that. A supplied image is cover-fitted to the clip's aspect (`scale=…:increase` then `crop`) so it fills the same tile without bars.
- An entry carries `thumb` only when it differs from the default. The edit script writes `thumb: undefined` rather than omitting the key, because these fields are *merged* — omitting it would leave an old crop in place and resetting to the default would silently not take.

**Still to build:** stills as entries. The pipeline renders `_full.mp4` and `_thumb.mp4` from everything it ingests and the app expects both, so a photo uploaded as an entry would publish as broken video renditions. `kind: 'photo'` and its glyph exist for when that is built; until then **PHOTO is disabled in the upload form** and the file pickers accept `video/*` only — a form must not offer what the pipeline cannot deliver. It stays selectable on an entry that is already a photo, so editing one cannot silently change what it is. (`file09 SALT_INDEX` is flagged `photo` as an icon preview and is really a video; the editor can now correct it.) Images ARE accepted, as thumbnails.

**Deployed 2026-08-04** to `https://severedarchive-admin.chris-216.workers.dev` on the Cloudflare account `chris@hvddox.com`. The KV namespace (`a43a8b8af70d449699ab1ae763970a4a`) and `SESSION_SECRET` are set. Verified live: 401 unauthenticated, 401 on a forged cookie, 403 cross-origin, 404 unknown route, and 401 — not 502 — for a login attempt while the passcode secret is unset.

**Still needed from the owner:** `ADMIN_PASSCODE_HASH` (run `scripts/hash-passcode.mjs`) and `GITHUB_TOKEN` (fine-grained, Contents + Actions write, this repo only). Until both are set, `/api/session` correctly refuses everyone.

Note the login limit is **8 attempts per IP per hour** — a locked-out owner waits out the window rather than being let in.

## Workflows

- Dev: `npm run dev` → http://localhost:5173/severedarchive/
- Tests: `npm test` (269 vitest, 98 e2e). E2e: `npm run e2e` (Playwright, **ALWAYS headless**, projects desktop 1440 / tablet 768 / mobile 390).
- Deploy: **push does NOT trigger Actions** (verified suppressed platform-side). Deploy with:
  `gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive`
  then verify the live build stamp matches HEAD.
- Swap in real content: drop mp4s in `raw/`, edit `src/data/archive.ts`, run `./scripts/process-media.sh`, regenerate `mediaMeta.generated.ts`, commit.
- `raw/` (107MB of source video) is gitignored and exists **only on this machine** — it is not backed up to GitHub.
