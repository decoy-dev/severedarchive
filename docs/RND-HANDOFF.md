# Handoff — the R+D tab, console publishing for it, and the window-feel pass

**Date:** 2026-09-08
**Status:** Live. Ships **empty** (owner's call at go-live) — the R+D tab shows its
designed empty state until the first upload. **No R+D upload, edit or removal has
yet completed through the live pipeline**; the first real one is the test.
**Live commit:** `4d9a0d9`
**Worker version:** `e30dd278-440a-413e-ad9c-31f06e864d2c` — `severedarchive-admin`

## What changed

A fourth tab, **R+D** (between ARCHIVE and ABOUT): "experiments, side quests, proof
of life and concepts." A six-wide wall of compressed thumbnails that scrolls inside
the terminal body; a tile unfolds into a focus view that loads the full still on
demand, with the caption standing in a column beside the image, ◄ ► paging (keys,
side arrows on desktop, a touch row + swipe below 861px), and a retract on close.
Stills only.

Publishing is in the existing console — a new **R+D** tab beside
ARCHIVE / ABOUT / LINKS — not a second uploader. It posts `collection=rnd` to the
same `/api/upload`; the Worker, both workflows and the write/edit scripts thread
that one field through to `src/data/rnd.json` and `rnd_`-prefixed renditions,
reusing the photo ladder unchanged. Per-entry EDIT / REMOVE lives in the focus view
(owner only). Admin is reachable on phones via a compact ◈ glyph at the end of the
bottom tab strip.

SEO: a build-time Vite plugin bakes an `ImageGallery` JSON-LD block, a `<noscript>`
gallery and an image sitemap out of `rnd.json`, so every upload is indexable on
its own deploy with no manual step.

Same pass, on the archive: windows **materialize** on open (a dithered cell mask
over the real panel), drag has **momentum without rubberband**, a dragged window
no longer covers the next one opened, the title bar can no longer be flicked off
the top of the viewport, and the (i) note spans the window so it cannot be clipped.

## Where things live

| Concern | File |
|---|---|
| The collection: rows, join with media meta, URL helpers | `src/data/rnd.json`, `src/data/rnd.ts` |
| The tab: state, header, empty state | `src/components/RndPanel.tsx` |
| The wall, tile, focus view | `RndGrid.tsx`, `RndCard.tsx`, `RndLightbox.tsx` |
| Tab registration, `#rnd` deep link | `TerminalWindow.tsx` (`TABS`), `App.tsx` (`TAB_ORDER`, `tabFromHash`/`syncHash`) |
| Console R+D upload tab | `AdminPanel.tsx` (`rndDraft`, `uploadRnd`, shared `uploadFailure`) |
| Per-entry edit / remove | `RndAdminPanel.tsx` (edit-only; `file` prop is non-null) |
| Compact mobile login | `AdminLogin.tsx` (`compact` prop), `TerminalWindow.tsx` (`.tw-tab-admin`) |
| Shared form bits | `EntryFields.tsx` (`hideKind`, `UploadLimitsHint kind`) |
| Worker: `collection` validation + dispatch payload | `server/worker.ts` (`COLLECTIONS`, `readCollection`) |
| Ingest: id prefix, `COLLECTION` env | `.github/workflows/ingest.yml` |
| Edit/remove: `COLLECTION` env, **poster path fix for stills** | `.github/workflows/edit.yml` |
| Data-file writers | `scripts/write-entry.mjs`, `scripts/edit-entry.mjs` |
| SEO builders + sitemap CLI | `scripts/rnd-seo.mjs`, `scripts/gen-sitemap.mjs`, `scripts/rnd-seo.d.mts`, `vite.config.ts` (`rndSeo`) |
| Window arrival | `src/lib/materialize.ts` (+ `materialize.test.ts`) |
| Drag physics, z-rank | `Desktop.tsx` (`attachDrag`), `FileWindow.tsx` (`--fw-z`), `index.css` (`.file-window` z-index) |
| All R+D styling | `index.css`, the `/* ══ R&D ══ */` block; admin additions (`.admin-compact`, `.admin-pop`, `.admin-body` ≤560px) |

## How an R+D upload lands

Console R+D tab → `POST /api/upload` with `collection=rnd` (kind forced `photo`,
`existingNames` from `RND`) → Worker stages the raw as a draft-release asset and
dispatches `ingest-media` **with `collection` in the payload** (`github.ts` passes
the payload through verbatim; no change there) → `ingest.yml` derives
`id = rnd_ + lowercase(name)` and runs the photo ladder unchanged →
`COLLECTION=rnd node scripts/write-entry.mjs` appends to `rnd.json` →
`gen-media-meta.mjs` picks the `rnd_` renditions up **with no change** (it globs
`public/media/*_full.*`; one shared `mediaMeta.generated.ts` serves both
collections) → commit → deploy → `vite build` runs `rndSeo`, which rewrites
`public/sitemap.xml` at `buildStart` and injects the JSON-LD + `<noscript>` block.

Edit / remove: `POST` / `DELETE /api/entry/rnd_<id>` with `collection=rnd` →
`edit.yml` → `COLLECTION=rnd node scripts/edit-entry.mjs`, which touches
**only `rnd.json`** — `overrides.json` is never read or written for rnd (there are
no built-in R+D entries to override).

## Configuration

Nothing new on the Worker: no secrets, no `[vars]`. `collection` is a request
field, defaulting to `archive` when absent, **422 on anything else** — so the
pre-existing archive console keeps working byte-for-byte and a bad value can never
become a surprise path in a workflow shell step.

`ENTRY_ID_RE` already permits the prefix (`rnd_` + a ≤31-char name is ≤35 chars
against its 41 cap).

## Decisions worth not relitigating

**A parallel collection with a prefix, not a `collection` column.** `archive.ts`
builds one `ARCHIVE` from `entries.json` + source + overrides and **throws at load**
on any id without metadata; a column would have meant filtering it out of every
archive surface. A separate `rnd.json` + `rnd.ts` leaves the archive model untouched.
The `rnd_` prefix (rather than a `public/media/rnd/` subdirectory) is what lets
`gen-media-meta.mjs` stay unchanged and rules out an id collision.
`archive.test.ts`'s invariant became "every generated id is claimed by ARCHIVE
**or RND**" for the same reason.

**The focus view is an overlay inside `.tw-body`, not a modal.** The title bar,
tabs and footer stay lit; Escape / arrows are captured in the capture phase so the
app's window-level tab-shift listener never sees them.

**Caption beside the image, for every orientation on desktop.** It started as a
below-the-image caption, then portrait-only side caption (a tall image is
height-constrained and a caption stacked under it steals the one axis it needs),
then the owner asked for the side layout everywhere. Below 861px it stacks, with
the caption budgeted to ≤50% of the stage and its body scrolling — never clamped —
so a phone still shows the picture.

**Contrast in the focus view is solved with opaque surfaces, not a blur.** Scrim
`rgba(7,9,11,.92)`, `--panel-solid` backings on the caption and every control,
resting glyphs at `--text`; acid stays hover / focus / focus-ring only. A
`backdrop-filter` was considered and rejected: it cannot guarantee luminance
contrast over moving video and costs compositor work.

**No `+ ADD` tile on the wall; no VIEW POST in the focus view.** Publishing has one
pathway (the console). Uploads do not collect a post link, so the link was a lie.

**The arrival is a mask and writes nothing else.** `mask-image` only — never
`transform` (the drag's, the recede's, the lock-on's), never `opacity`/`filter`
(the recede's). The glass blur stays on throughout: a first draft switched
`backdrop-filter` off during the beat and the blur coming back at the end read as a
pop, which the owner had explicitly ruled out.

**Drag: momentum yes, elasticity no.** `containerFriction: 1` clamps hard while
dragging. `releaseContainerFriction: 1` is the load-bearing value — anime only
animates *past* the bound and back (the rubberband) when this is below 1; at 1 a
throw stops flush at the edge. Glide length is the flick speed through
`releaseStiffness 200 / releaseDamping 28`, `maxVelocity 5`, on `outCubic`. The
owner approved the feel by hand; do not tune it by harness (see below).
`containerPadding` is per-edge `[0, -24, -24, -24]`: the sides and bottom may hang
24px off, the **top is hard** so the title bar can never leave the screen.

**z-order is state-owned.** anime's Draggable writes an inline `z-index` from a
library-global counter on every grab. React now hands the rank over as `--fw-z`
and `.file-window` resolves `z-index: calc(10 + var(--fw-z)) !important` — the
`!important` is what beats the library write. The enlarged rule (`60 !important`,
more specific) still wins.

## Things that will bite

- **Removing R+D entries by hand** (as at go-live) means regenerating
  `mediaMeta.generated.ts` (`npm run gen:media-meta`) and the sitemap
  (`node scripts/gen-sitemap.mjs`). `rnd.ts` throws at load on an entry without
  metadata, and `archive.test.ts` fails on metadata without an entry.
- `rndSeo` is `apply: 'build'`. **The dev server has no JSON-LD / noscript** —
  check `dist/index.html`, not the browser, when verifying SEO.
- `rnd.test.ts` is written to hold for an **empty** collection (every invariant is
  over `RND`, the date test uses a fixture). Do not reintroduce `RND[0]`.
- The console cannot be exercised locally against `vite dev` alone — login answers
  "backend unreachable" without the Worker. `wrangler dev` needs the secrets.
- `edit.yml`'s poster-only step used to `test -f ${id}_full.mp4` and so **failed
  for every photo edit** (archive photos included). It now picks whichever ladder
  exists. Any caption-only edit of a still before `4d9a0d9` would have failed the
  run.
- **Do not judge drag momentum with the desktop-automation harness.** It can pause
  before `mouseup`, which zeroes the captured velocity, and a run then reads as
  "no glide" when the tuning is fine. It cost a round of false negatives here.
- The window-manager / archive unit tests were still fixtured on `file01`–`file12`
  a fortnight after the owner deleted them, so `npm test` was red on `main` for
  reasons unrelated to any change. `windowManager.test.ts` now mocks `isArchiveId`;
  `archive.test.ts` asserts over whatever is live.

## Open items

- **e2e not re-run this session.** 13 specs; `about.spec`, `responsive.spec`,
  `admin.spec` and `window.spec` reference the tab strip, and the strip now has
  four tabs in a new order. Expect some assertions to need updating. Run
  `npm run e2e` before the next deploy.
- **First live R+D upload / edit / remove** — unexercised end to end. When it
  happens, confirm the row is actually *read* on the site (the `content.json`
  lesson in CONTEXT), not just that the deploy went green.
- Mobile checks were Firefox Responsive Design Mode at 320×480 / 390 / 768; no
  real-device or Mobile Safari pass on the compact login popover or focus captions.
- `AboutAsciiObject` is a 587kB lazy chunk (pre-existing; Vite warns). Reducing it
  is a visual-asset decision, not a build tweak.
