# CONTEXT.md — severedarchive portfolio (resume point)

Last updated: 2026-08-03, paused after Slice E (branch `desktop-windows`; `main` is at the same commit). **Read this first when picking the project back up.**

## What this is

Single-screen portfolio site for severedarchive (motion/visual artist: Blender renders set to music, metalheart/chromeheart, neo-2000s). A **desktop**: video files open in draggable, closable windows over a fullscreen video backdrop, with a huge overprint wordmark behind everything. Zero scrolling on any device.

- **Live:** https://decoy-dev.github.io/severedarchive/ — serves `main`, but only when the deploy workflow is run by hand. **Confirm the live build stamp before assuming this work is deployed.**
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
| **F — deploy** | ⬜ **next** |

**Tests: everything is green.** `npm test` 114/114, `npm run lint` clean, `npm run e2e` **55 passed / 32 skipped / 0 failed** across all three Playwright projects. This is the first point in the branch where that is true — there are no expected-red tests any more, so **any** failure now is a regression. (114, not the 120 of Slice D: `stackLayout.test.ts` went with the module it tested. The 32 skips are viewport-gated by design.)

**Node compatibility:** `src/test/setup.ts` restores `localStorage` under vitest's jsdom environment. Node 26 defines an inert `localStorage` global, vitest skips copying any jsdom window key that already exists as a Node global, and `selection.test.tsx` then dies in `beforeEach`. It is a shim for the test environment only — no production code depends on it.

## Current UX (on the branch, not live)

1. Boot log, then the terminal window draws in. No notification — it was deleted.
2. `SEVEREDARCHIVE` renders as huge Archivo Black display type pinned top-left, bleeding off both edges, **behind** the window layer so the glass blurs and refracts it.
3. Tabs: ARCHIVE / ABOUT / LINKS. Arrow keys switch tabs.
4. ARCHIVE defaults to **LIST** — a two-column explorer. File rows on the **right**, live preview pane on the left with metadata (tagline · duration · year · resolution). Rows are on the right because cascading windows were landing on them and making them unclickable.
5. **Clicking a row opens a draggable window.** The preview video is physically re-parented into the window with a FLIP animation and keeps playing across the move. Max 3 windows; a 4th is refused with a white flash and a `BUFFER FULL` overprint.
6. Focused window plays `_full` with audio available; unfocused windows drop to the 240p `_thumb`, muted, under a scanline/grain overlay so the low resolution reads as intentional.
7. Windows are **true-frame** — the aspect ratio applies to `.fw-body`, so the window is 40px taller than the media. No pillarboxing at any ratio.
8. GRID is the same file list as large poster tiles. Clicking a tile returns to LIST and opens that window. There is no focused video inside grid view.
9. **Below 861px the explorer does not render at all.** `ArchiveMobile` takes its place: one true-frame primary player, the file's metadata, and a single horizontally-scrolling row of poster tiles. Tapping a tile selects it; swiping the player advances selection; the row keeps the selected tile in view. No window is ever created, and GRID still works at every width.
9. Build stamp bottom-right (`BLD <sha> · <utc>`) — compare against `git log --oneline -1` to detect a cached page.

## Architecture map

**The media lifecycle is the load-bearing part.** Two separate page-blanking crashes were found and fixed in it; do not restructure it casually.

- `src/lib/mediaController.ts` — owns every media node. One `<video>` per file, held in a host div React does not own. Surfaces register **empty slots**; the controller reconciles a desired placement map into DOM moves, keyed by `fileId`, priority `window > primary > preview`. This is what makes the reparent safe from React's unguarded `removeChild`.
- `src/components/MediaLayer.tsx` — renders `src` declaratively from `wantsMedia()`. **Never write `src` imperatively** — a source-level test fails the build if you do.
- `src/lib/selection.tsx` + `activation.ts` — one file-selection contract shared by explorer, grid and (soon) mobile. `activate` always selects first.
- `src/lib/placement.ts` — pure: current state in, desired placement map + focus out. This is where the perf-tier policy lives (lite places exactly one node, the focused window or the mobile primary; full places everything). `Desktop` does nothing with the result but hand it to `reconcile`.
- `src/hooks/useIsDesktop.ts` — the single desktop/mobile split, read from `DESKTOP_MIN_WIDTH` so "windows open here" and "the mobile row renders here" cannot drift into two breakpoints.
- `src/components/ArchiveMobile.tsx` — the mobile surface. Same slot discipline as the explorer: an empty `primary` slot over a poster, never a `<video>` in JSX.
- `src/lib/windowManager.ts` — pure z-order, focus, 3-window cap, slot allocation, cascade positions. No React, no DOM.
- `src/lib/mediaMove.ts` — the single-element FLIP for the open beat.
- `src/lib/keyboard.ts` — the keydown guard (arrow keys must not fire from inside a range input).
- `src/components/` — `Desktop` (window state, drag, refusal), `FileWindow` (chrome), `VolumeControl`, `ArchiveExplorer`, `ArchiveGrid`, `TerminalWindow`, `BackgroundVideo`, `BootSequence`, panels.
- `src/data/mediaMeta.generated.ts` — build-generated `width`/`height`/`durationSec` per file, probed from `public/media/*_full.mp4`. Regenerate when media changes; a guard test fails if it drifts.
- Media: `public/media/` — `_thumb.mp4` (240p), `_full.mp4` (720p), `_poster.jpg` per file01..file12.

**Deleted in Slice E:** `ArchiveStack.tsx`, `HomeNotification.tsx`, `stackLayout.ts` (+ test), and ~110 lines of dead stack/notification CSS. `grep -rn "ArchiveStack\|HomeNotification\|stackLayout\|lib/flip" src tests` returns nothing.

## Design rules (binding)

- Font: **Share Tech Mono** for all interface text, single weight. Emphasis NEVER from `font-weight`. **One exception:** Archivo Black (`--display`), used only for the wordmark and `BUFFER FULL`.
- Type floor **12px**. Tokens `--fs-xs` 12 / `--fs-sm` 13 / `--fs-base` 15 / `--fs-lg` 17.
- Accent `#b6ff2e` on active/hover only. `#ff3524` only in the `BUFFER FULL` refusal.
- Backdrop scrim is `rgba(4,6,8,0.66)` — raised from 0.45 because the archive doubled and brought in bright clips that washed out every glass surface. Global, deliberately not per-clip adaptive.
- **Zero page scrolling, ever.** `.stage` uses `overflow: clip`, NOT `hidden` — `hidden` makes it a scroll container, and the oversized wordmark gave it ~215px of hidden overflow that browsers would scroll to reveal a focused row, shunting the whole desktop sideways. Do not change this back.
- Animations transform/opacity only. **Sanctioned exceptions:** volume control `max-width`, degradation `filter`, mobile row `overflow-x`.
- anime.js v4 modular API only (`import { animate, createDraggable, createScope } from 'animejs'`). **`createLayout` is banned** — the reparent is a single-element FLIP.
- No engine-conditional media paths. Chromium, WebKit and Firefox were all measured keeping `<video>` playing across a same-document reparent (`readyState` 4→4, buffered intact).
- Desktop/mobile split is a **width query at 861px**, deliberately not pointer capability — touch tablets get the full desktop.
- The terminal/explorer window is a **fixed background layer**: not draggable, never raises, not in the focus stack.
- Git: commits under Chris's identity as-is. **NEVER** any `Co-Authored-By`, "Generated with Claude Code", or AI attribution anywhere in the repo.
- The DCY.DSGN ASCII header comment stays verbatim at the top of `index.html`.

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
- **The 28/24px window cascade is too tight.** Three 16:9 windows are all 720×446 at 1440px, so the back two are ~97% covered — "max 3 windows" currently reads as a stack of one. Either widen the cascade, vary spawn size, or offset more aggressively.
- **Decode ceiling has never been measured.** 1 full + 2 thumb + 1 preview + 1 backdrop = 5 concurrent decodes. If it fails on real hardware, the contract names the first cut: pause the explorer preview whenever a window is open.

**Left over from Slice D — needs a decision**
- **The terminal chrome still switches at 640px while everything else switches at 861px.** Between 641 and 860 (the 768px tablet project) you get the mobile archive inside desktop chrome — tabs on top rather than at the bottom. Not broken, just inconsistent. Moving the `@media (max-width: 640px)` chrome block to 860 is a one-line change but a visible one at tablet, so it was left alone.
- The contract contradicts itself on 768px: §3 says "768 (window opens)" while §3 rule 3 and §4 both say no window below 861. The implementation follows 861, `desktop.spec.ts` enforces it, and the prose is what is wrong.

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

## Workflows

- Dev: `npm run dev` → http://localhost:5173/severedarchive/
- Tests: `npm test` (114 vitest). E2e: `npm run e2e` (Playwright, **ALWAYS headless**, projects desktop 1440 / tablet 768 / mobile 390).
- Deploy: **push does NOT trigger Actions** (verified suppressed platform-side). Deploy with:
  `gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive`
  then verify the live build stamp matches HEAD.
- Swap in real content: drop mp4s in `raw/`, edit `src/data/archive.ts`, run `./scripts/process-media.sh`, regenerate `mediaMeta.generated.ts`, commit.
- `raw/` (107MB of source video) is gitignored and exists **only on this machine** — it is not backed up to GitHub.
