# severedarchive — ownership and lifecycle contract

**Date:** 2026-07-31
**Branch:** `desktop-windows`
**Status:** preflight. Settles the contracts for Tasks 10–17 before any further code is written.
**Supersedes:** the ownership-relevant portions of `docs/superpowers/plans/2026-07-31-desktop-windows.md` Tasks 10–14. Where this document and the plan disagree, **this document wins.** The spec (`2026-07-31-desktop-windows-design.md`) still governs look, motion and product behaviour.

## How to read this

Everything here is an **invariant or an acceptance criterion**. It says what must be true, not how to type it.

- Prose in the body is **binding** unless marked otherwise.
- Anything in a fenced code block is **CANDIDATE** — a signature or shape offered because it is clearer shown than described. An implementer may deviate and must report the deviation. No code block here has been executed.
- Statements marked **VERIFIED** were checked by direct inspection during this preflight; the evidence is cited inline.
- Statements marked **UNVERIFIED** name the experiment that would settle them. Do not treat them as facts.

The reason for that split is on the record: the previous plan supplied unreviewed code recipes alongside requirements, several were defective, and implementers treated them as authoritative (`docs/CODEX-REVIEW.md` §C.4).

## Binding rulings this design must satisfy

From the project owner, not open for revisiting:

1. The terminal/explorer window is a **fixed background layer**. Never raises above file windows, not part of the focus stack. **It is NOT draggable** — see ruling 7.
2. Video is **true-frame**. Aspect ratio belongs to `.fw-body`, not the window. The window is 40px taller than the media. No pillarboxing or letterboxing anywhere.
3. The desktop/mobile split is a **width query at 861px**, deliberately not a pointer-capability query.
4. Max 3 concurrent windows; the 4th is refused with a white flash and a large `BUFFER FULL` overprint.
5. Focused window plays full-res with audio. Unfocused windows play the 240p thumb, muted, under a deliberate grain/scanline overlay.
6. Zero page scrolling at 1440 / 768 / 390.

**Added 2026-07-31, after this document's first draft. These supersede anything below that contradicts them.**

7. **The terminal/explorer window is not draggable at all.** §7.1 flagged that at ~1420×880 in a 1440×900 viewport it has ~44px of travel, which reads as UI wobble rather than window movement. Ruling: drop the drag entirely and treat it as a fixed panel. Remove the `__terminal__` draggable, its `registerTerminal` context member, `data-drag-handle` on `.tw-titlebar`, and the `will-change: transform` that existed to serve it. This closes §7.1 and removes the terminal from `Desktop`'s scope bookkeeping.

8. **The reparent animation is a single-element FLIP on the media host, not `createLayout`.** §4.9 established that `createLayout` writes inline `width`/`height`/`translate` onto animating nodes and stamps `data-layout-id`, colliding with the inline styles React already drives on `.file-window`. The owner's original request named the `createLayout` "swap parent" API specifically; he has been shown the conflict and ruled for the single-element FLIP. **The visual result is unchanged** — the video is still visibly pulled out of the explorer and into the new window, same easing, same duration. Only the mechanism changes: measure the host's box before and after the move, then animate that one element with `animate()`. `createLayout` is not to be used anywhere on this branch.

---

## 1. Ownership table

One row per stateful resource. "Owner" means the single place that may mutate it; everything else reads or requests.

Two module names recur. Both are **candidate names** for things that must exist:

- **`mediaController`** — a non-React module that owns every archive `<video>` element and their placement. One instance, created by `Desktop`.
- **`ArchiveSelection`** — a React context provider mounted in `App`, **above** `Desktop`, that owns which file is selected, what activating a file means, and the list/grid view mode.

| # | Resource | Owner | Created by | Transitioned by | Destroyed / restored by | Test that proves the full lifecycle |
|---|---|---|---|---|---|---|
| 1 | The explorer preview `<video>` | `mediaController` | `mediaController.acquire(fileId)` on first demand for that file | `mediaController.reconcile()` when the selection changes, a window opens/closes, or a slot registers/unregisters | `mediaController.release(fileId)` when no live slot wants the file; teardown is `pause` → `removeAttribute('src')` → `load()` → detach to the attic | `mediaController.test.ts` — "preview node is the same object before and after a window opens and closes" |
| 2 | A file window's media element | `mediaController` (same object as row 1 — a file has exactly one node, in at most one place) | as row 1 | `reconcile()` on open/focus/close; slot priority window > mobile primary > explorer preview | `Desktop.close()` calls `mediaController.detachFrom(windowSlot)` **synchronously before** `setWindows`, so React never unmounts a body that still contains the node | `mediaController.test.ts` — "open → node parent is the window slot; close → node parent is the preview slot or the attic, never a detached tree" |
| 3 | Window position (`x`, `y`) and cascade `slot` | `Desktop` React state, via `windowManager` pure functions | `openWindow()` allocates the lowest free slot index | `createDraggable` moves the window by CSS transform only; `x`/`y` are never written after spawn | `closeWindow()` frees the slot | `windowManager.test.ts` — "open A,B,C → close B → open D takes slot 1 and no two open windows share a position" |
| 4 | z-order / focus rank | `Desktop` React state, via `windowManager.focusWindow` | `openWindow()` assigns top rank | pointerdown on a window root; `onGrab` from the draggable; open of an already-open file | `closeWindow()` re-densifies | `windowManager.test.ts` (existing, keep) + `desktop.spec.ts` — "clicking the back window raises it above the others" |
| 5 | Playback tier (which encode plays where, and whether it plays) | `mediaController`, using `VideoDirector` as its policy object | `Desktop` constructs one `VideoDirector` and hands it to the controller | `reconcile()` recomputes `{focusId, backgroundIds}` from (open windows, focusedId, selection, perf tier) and calls `setFocus` / `setBackground` | on `release`, the controller calls `director.unregister(fileId)` | `videoDirector.test.ts` (extended) + `desktop.spec.ts` — "with three windows open, at most one video has a `_full` src and at most 5 videos are unpaused" |
| 6 | Volume / muted | `mediaController`, as a per-file record that outlives any single placement | default `{volume: 0, muted: true}` on first `acquire` | `VolumeControl` → `FileWindow` → `mediaController.setVolume(fileId, v)`. Never writes the DOM directly. Focus policy mutes unfocused windows **without** discarding the stored level | record is dropped only on `release` | `FileWindow` unit/dom test — "a window adopting a node already at 0.6 renders VOL at 060, not 000" |
| 7 | The drag instance (`createScope` + `createDraggable`) | `Desktop`, keyed by window id in a ref map | `attachDrag(id, el)` on the window root's ref callback | anime's own `ResizeObserver` and per-grab `updateBoundingValues()` keep bounds current (see §4.5) | `Desktop.close()` reverts the scope before removing the window; scope also reverts on desktop unmount | `desktop.spec.ts` — "a portrait window dragged hard into each of the four corners settles fully inside the viewport ±24px" |
| 8 | The reparent animation | `mediaController` (it is the only caller; the animation is an implementation detail of `moveTo`) | on each placement change where both the old and new rect are non-zero | runs once per move; a move arriving mid-animation cancels the previous one | self-reverting; must leave **no** inline style on any React-rendered node (see §4.9) | `desktop.spec.ts` — "500ms after opening a window the node is inside `.fw-body` and has no residual inline `transform`" |
| 9 | The selected file | `ArchiveSelection` provider in `App` | initial value `DEFAULT_FRONT_ID` | `select(id)` from row hover / row focus / arrow keys / mobile tap; `activate()` also selects | never destroyed; survives tab switch, view switch and window close | `desktop.spec.ts` — "select file09, switch to ABOUT and back, the preview still shows file09" |
| 10 | View mode (list / grid) | `ArchiveSelection` provider | read from `localStorage['severedarchive.archiveView']`, legacy `stack` → `list` | the LIST/GRID toggle; `activate({via:'tile'})` forces `list` | persisted on every change; never destroyed | `archive.spec.ts` — "grid tile click switches to list and opens that file's window" |
| 11 | The mobile primary player | `mediaController` — it is a slot named `primary`, not a special component | slot registers when the mobile branch mounts | `select(id)` moves the node into the primary slot | slot unregisters on unmount; controller reconciles | `desktop.spec.ts@mobile` — "tapping a tile plays a `<video>` in `[data-primary-view]` and opens zero windows" |
| 12 | The terminal/explorer layer | `Desktop`, but **not** in `windows` state | `registerTerminal(el)` | drag only. It has no z-rank, no focus rank, and no entry in the focus stack | reverted on desktop unmount | `desktop.spec.ts` — "with a file window open, dragging the terminal does not raise it above the file window" |
| 13 | Backdrop file id | derived, not owned — a pure read of `ArchiveSelection.selectedId` | — | changes when selection changes | — | existing `focus.spec.ts`, extended |

Two rows deserve emphasis because they are where the current plan goes wrong.

**Rows 1 and 2 are the same object.** A file has exactly one media node. Treating "the preview video" and "the window video" as two resources is what produced the reparenting hazard. They are one resource with a placement.

**Row 12 exists to be empty.** The terminal is listed so that no future task quietly gives it a focus rank. Today `attachDrag` passes the same `onGrab: () => focusWindow(cur, id)` for the terminal as for file windows (`src/components/Desktop.tsx:107`). It is a harmless no-op because `__terminal__` is never in `windows` — but it is exactly the implication the owner ruled out. `attachDrag` must take an explicit flag and the terminal must pass "does not focus".

---

## 2. The media node lifecycle, settled

### 2.1 What is wrong today

The plan has `ArchiveExplorer` render `<video data-preview-video key={file.id} …>` (Task 10 Step 1) and then has `Desktop` call `body.appendChild(preview)` on that node (Task 11 Step 2). That is a React-rendered element moved out of its React-recorded parent.

**VERIFIED — this crashes the app, it does not degrade.** React 19's deletion path resolves the nearest host ancestor *in the React tree* and calls `parentInstance.removeChild(child)` unguarded (`node_modules/react-dom/cjs/react-dom-client.development.js:22204-22205`, called at `:14320-14332`). The `key={file.id}` on the preview video means any selection change deletes the old video and mounts a new one. If that node is away in a window, the DOM throws `NotFoundError`, React catches it as a commit-phase error, and with no error boundary above `App` the entire root unmounts. The page goes blank.

The trigger is not exotic. Open a window, then move the mouse to any other row.

Two further defects in the same area:

- `document.querySelector('[data-preview-video]')` returns whichever preview exists, not the file that was clicked (`Task 11 Step 2`). Opening from the grid, or opening with the keyboard after the hover has moved on, adopts the wrong file's node.
- `FileWindow`'s aspect-ratio effect does the same global lookup (`src/components/FileWindow.tsx:20-28`) and silently keeps 16:9 if it finds nothing.

### 2.2 The chosen approach

> **One media node per file, authored by React inside a per-file host `<div>` that React does not own. Only the host is ever reparented, and only by `mediaController`. Every surface renders an empty, stable slot.**

Concretely:

- `mediaController` keeps `Map<fileId, { host: HTMLDivElement }>`. The host is created with `document.createElement('div')` and never enters any React tree as a child.
- The `<video>` inside the host **is** React-rendered, via `createPortal(<video …/>, host)`, rendered by a single `<MediaLayer>` component mounted once in `App`. So `src`, `muted`, `loop`, `playsInline`, `poster` and event handlers stay declarative and diffable.
- Surfaces render slots: `.preview-frame` in the explorer, `.fw-body` in a window, `.primary-view` on mobile. A slot is an ordinary React div with a ref callback that calls `mediaController.registerSlot(name, el)` / `unregisterSlot(name)`.
- `reconcile()` is the only function that moves anything. It computes a desired `slot → fileId` map from current state and issues the minimum set of moves.

```ts
// CANDIDATE — src/lib/mediaController.ts
type SlotName = 'preview' | 'primary' | `window:${string}`

type MediaController = {
  registerSlot(slot: SlotName, el: HTMLElement | null): void
  /** the whole state machine: desired placement in, DOM moves out */
  reconcile(desired: { slot: SlotName; fileId: string }[], opts: { animate: boolean }): void
  setVolume(fileId: string, v: number): void
  stateOf(fileId: string): { volume: number; muted: boolean; currentTime: number }
  /** hosts that exist but are placed nowhere; for assertions and teardown */
  attic(): HTMLElement
}
```

React's contract with the DOM is never violated, **by construction rather than by care**: React only ever appends to and removes from `host`, and `host`'s parent is invisible to React.

### 2.3 The four questions, answered

**Is the video React-rendered or imperatively created?**
React-rendered (inside the portal host). The host div is imperatively created. Nothing React owns ever changes parent.

**What stops React patching a node that has moved?**
Nothing needs to. From React's view the video never moves — its parent is always `host`. Property updates (`src` swap on focus change) patch in place and are safe. Keyed remounts destroy and recreate inside `host` and are safe.

**Explorer re-render, view switch to grid, explorer unmount, while a node is away in a window?**

| Event | What happens |
|---|---|
| Explorer re-renders (hover moves, selection changes) | The `.preview-frame` slot is a stable div; its ref does not fire. `reconcile()` runs with a new desired map. If the newly selected file's node is free, it moves into the preview slot. If it is in a window, the preview slot gets **nothing** and the pane shows its poster. |
| View switches to GRID | The explorer unmounts, `.preview-frame` ref fires with `null`, the `preview` slot unregisters. `reconcile()` moves whatever was in it to the attic and pauses it. Nodes in windows are untouched. |
| Explorer unmounts (tab switch to ABOUT/LINKS) | Identical to the above. Windows are outside the terminal window entirely, so they and their media are unaffected. |
| Desktop unmounts | `mediaController.dispose()` releases every node. Only reachable on a full teardown. |

**Slot priority, binding:** `window:*` > `primary` > `preview`. A file with an open window never appears as live video in the preview pane; the pane shows that file's poster. This is what makes the desired map a total function with no ties.

**Does closing restore the node to the explorer, or destroy it?**

Closing is a **reconcile, not an animation, and never an inverse FLIP.**

1. `close(id)` calls `mediaController.reconcile(desiredWithoutThatWindow, { animate: false })` **synchronously, before** `setWindows`.
2. `reconcile` asks whether any live slot still wants that file. If the explorer preview is currently selecting it, the node moves there instantly and is re-tiered to the thumb encode. Otherwise the node is released: paused, `src` removed, `load()` called to drop the decode, host detached to the attic.
3. Then React removes the window.

The owner's brief asks for the video to be *pulled out of the file viewer into the window*. It says nothing about the return trip. **The inverse is a teardown, not an animation**, because an animated return has to answer "return to where?" and every answer is a branch that can silently do nothing: grid view is showing, the ABOUT tab is open, the selection has moved on, the viewport is mobile. One unconditional rule beats four conditional ones. If a close motion is wanted later, it belongs on the window chrome (opacity/scale on `.file-window`), which requires a `closing` flag in `WinState` and is a separate, additive decision.

**How is identity guaranteed?**

Every controller entry point takes a `fileId`. There is no lookup by DOM shape anywhere.

Binding: **`document.querySelector` must not be used to find a media element.** Two current call sites violate this and must go — `src/components/FileWindow.tsx:21` (aspect ratio) and `src/components/FileWindow.tsx:50` (volume). Both are replaced by controller calls keyed on `file.id`. Add a lint-level or review-level check for `querySelector` in `src/components`.

Acceptance test: with the explorer preview showing file03, open file09 from the grid; assert the `<video>` inside `[data-file-window="file09"]` has a `src` ending `file09_full.mp4` and that no video anywhere has file03's full encode.

### 2.4 Approaches rejected

**Rejected — the current plan (React renders the video, `Desktop` moves it).** Blanks the page on a mouse move, per the verified React path in §2.1. It also has no answer for unmount and no identity guarantee. This is the approach being replaced.

**Rejected — a fully imperative media pool (React renders no `<video>` at all).** Identical safety to the chosen approach, because the same host-move machinery does the work. It loses declarative `src`/`muted`/`poster` handling and forces a hand-written mini-renderer for element attributes, which is more bespoke code for no additional safety. The portal keeps React doing the part React is good at.

**Rejected — two elements and a ghost (never reparent anything).** The explorer preview and each window own their own `<video>`; the open animation flies a poster `<img>` from one rect to the other and cross-fades. This is the safest option on paper — zero reparenting, zero React/DOM disagreement. It was rejected for three reasons, in order of weight:
1. It abandons the mechanism the owner asked for by name, and the resulting seam (a handoff between two decoders at different buffer states) is a per-file, per-network judgement call rather than a settled contract.
2. Decode ceiling rises. A file open in a window and selected in the explorer would be decoded twice.
3. Its risk does not actually vanish, it relocates — into "does the handoff look right", which is exactly the kind of thing that only fails on someone else's connection.

If §6's Safari experiment comes back badly, this is the fallback, and the `mediaController` interface is unchanged by the swap: only the body of `reconcile`'s move step differs.

**Rejected — `createLayout` rooted on `.desktop` for the FLIP.** See §4.9. It is the plan's stated mechanism and it conflicts with React's inline styles on the very elements involved. The move animation is a single-element FLIP on the host div instead.

---

## 3. The file-selection contract

Three surfaces (explorer list, grid, mobile row) must not grow three selection models. One provider, two verbs.

```ts
// CANDIDATE — src/lib/selection.tsx, provider mounted in App above <Desktop>
export type ActivationVia = 'row' | 'preview' | 'tile' | 'keyboard'

export type ArchiveSelectionApi = {
  /** what the preview pane, the backdrop and the mobile primary player show */
  selectedId: string
  /** hover, roving focus, arrow keys, mobile tap. Changes what is shown. Never opens anything. */
  select: (id: string) => void
  /** click, Enter, tap. The commit. Always selects first, then applies the activation policy. */
  activate: (id: string, via: ActivationVia) => void
  view: 'list' | 'grid'
  setView: (v: 'list' | 'grid') => void
}
```

Binding rules:

1. **Surfaces call `select` and `activate`. They never decide what activation means.** No surface imports `DesktopContext.open`. `ArchiveGrid` in particular must not know that windows exist.
2. **`activate` always calls `select(id)` first.** This closes a real hole created by the 861px width ruling: on a touch tablet there is no hover, so `onMouseEnter` never fires and without this rule the backdrop and preview would never track the user's actual choice.
3. **Activation policy lives in exactly one function**, resolved by viewport width, not by which surface called:
   - width ≥ 861px → `desktop.open(id)`; additionally, if `via === 'tile'`, `setView('list')` first.
   - width < 861px → nothing further. Selection alone drives the mobile primary player. No window is ever created below 861px.
4. **`selectedId` and `view` live above the ARCHIVE panel**, so a tab switch or a list/grid switch does not reset them. This also fixes a latent bug in today's code: switching to ABOUT and back resets the stack front and therefore the backdrop.
5. `App`'s `backdropId` becomes a read of `selectedId`. `onFrontChange` is deleted.

Acceptance criteria:

- Grepping `src/components` for `DesktopContext` returns `Desktop.tsx` and one activation-policy module. Nothing else.
- The same Playwright assertion for "activating file09 shows file09" passes at 1440 (window opens), 768 (window opens, per the width ruling), and 390 (primary player, zero windows) with only the expected-surface locator differing.

---

## 4. Resolutions for known contradictions

### 4.1 `setBackground` has no caller — name the owner or delete it

**Keep the API. The owner is `mediaController.reconcile()`, and there is exactly one `VideoDirector` instance in the app, constructed by `Desktop`.**

Today two components each construct their own director (`ArchiveStack.tsx:20` with cap 1, `ArchiveGrid.tsx:11` with cap 4). Both go away: the stack is deleted, and grid tiles become static posters per spec §2, so the grid needs no director at all.

The single director is fed once per reconcile:

- `setFocus(focusedWindowFileId)` — or the mobile primary's file, or `null`.
- `setBackground([...unfocusedWindowFileIds, previewFileId])`.
- The backdrop is not registered with the director. It is a separate always-on element whose lifecycle `BackgroundVideo` already owns correctly.

The director's constructor cap must be raised from the per-component values to the desktop ceiling (candidate: 5). Its existing `loadeddata` resync pattern and its "judge against the element's real `paused`, not a shadow ledger" comment (`src/lib/videoDirector.ts:48-50`) stay exactly as they are — they encode a lesson that a src swap resets `paused` underneath you, which the tier swap will hit constantly.

Test: the two cases already drafted in Task 12 Step 1, plus one that proves the director sees exactly one focus id when three windows are open.

### 4.2 Task 14 lite tier renders `<img>` while its test asserts `<video>`

**VERIFIED that the test can never pass as written.** `detectPerfTier` returns `lite` for `width < 480` (`src/lib/perfTier.ts:10`) and the mobile Playwright project is 390px (`playwright.config.ts`). The mobile project is the only one that runs that test, and it is always lite.

**Product ruling: the primary/focused surface always gets a real `<video>`, at every tier.** Tapping a tile that shows a still image is a broken promise, and the owner's brief says tapping plays as the primary view.

Perf tier changes *which encode and how many decodes*, never whether the content exists:

| Surface | tier `full` | tier `lite` |
|---|---|---|
| Focused window / mobile primary | `_full`, audio available | `_full`, audio available |
| Unfocused window | `_thumb`, muted | poster `<img>`, no decode |
| Explorer preview pane | `_thumb`, muted | poster `<img>`, no decode |
| Grid tiles | poster `<img>` | poster `<img>` |
| Backdrop | `_thumb` | poster `<img>` (already true) |
| Glass | `backdrop-filter` on | flat fill (already true) |

This matches existing precedent — `FileCard.tsx:17` already reads `showVideo = tier === 'full' || focused`. It means one decode on a phone, which is the same budget the site ships today.

Consequence to carry: `prefersReducedMotion()` also forces lite (`perfTier.ts:8`), so a reduced-motion desktop visitor sees poster-only unfocused windows. That is correct — it is the content that must survive reduced motion, not the ambient decoration.

Test: `[data-primary-view] video` at 390px, plus a lite-project assertion that unfocused windows contain an `<img>` and not a `<video>`.

### 4.3 `cascadePosition(cur.length, …)` collides after a close

**Fix: allocate an explicit slot index, not a count.**

`WinState` gains `slot: number`. `openWindow` assigns the lowest index in `0 … MAX_WINDOWS-1` not currently held by an open window. `closeWindow` frees it implicitly by removing the record. `cascadePosition` keeps its current signature and semantics — it is already a pure function of a slot index; only its caller was wrong.

Because the cap is 3 and the slot space is 3, this is exact: no collision is possible, positions stay in the intended cascade, and reopening after a close reuses the vacated slot rather than drifting.

Rejected alternative: a monotonically increasing open counter. It never collides either, but after a handful of open/close cycles every window clamps to the same bottom-right corner, which reads as a bug.

Test (`windowManager.test.ts`): open A, B, C → close B → open D. Assert `D.slot === 1`, assert `cascadePosition` for the three live windows yields three distinct `{x,y}` pairs, and assert the same after `close A → open E`.

### 4.4 `FileWindow`'s aspect-ratio lookup is a one-shot passive effect that silently keeps 16:9

**Fix: delete the runtime lookup. Aspect ratio comes from static, build-generated metadata.**

`ArchiveFile` gains `width: number`, `height: number`, `durationSec: number`, generated by `ffprobe` (see §4.8). Then:

- The window's box is known **before** it mounts, so `Desktop.open` can hand `cascadePosition` the true size instead of the fabricated `{720, 405}` it uses today (`src/components/Desktop.tsx:60`).
- `.fw-body` gets `aspect-ratio` from metadata at first paint. There is no effect, no retry, no race with the reparent, and no silent 16:9 fallback because there is no fallback path at all.
- The drag box never changes size after mount, which removes most of §4.5's problem rather than mitigating it.
- The whole media lifecycle becomes unit-testable in jsdom, because nothing depends on `videoWidth` ever being populated.
- The spec's requested "resolution" metadata line in the preview pane (§2 of the spec, flagged as dropped by the review) is satisfied by the same field.

This is the highest-leverage single change in this document. It resolves four separate findings at once.

**True-frame invariant, binding:** `.fw-body`'s rendered aspect ratio must equal `file.width / file.height` within 0.5%, and the `.file-window` root's height must equal the body's height plus exactly the title bar (40px) plus the glass border (2px). The window root must not carry `aspect-ratio`. The current inline `aspectRatio: ar` on the root (`FileWindow.tsx:39`) is what produces the ruled-out pillarboxing and must be removed.

The existing `min(52vw, 720px, ${ar * 62}vh)` width cap must be restated against the body rather than the window, because `62vh` of *window* is not `62vh` of *media* once the chrome is counted. State it as an invariant — "the media box fits within the viewport minus frame, chrome and a margin" — and let the implementer pick the expression.

Test: `desktop.spec.ts` opens file08 (406×720, portrait) and file09 (720×720, square) and asserts the measured `.fw-body` ratio against the metadata, and `windowRect.height - bodyRect.height === 42 ± 1`.

### 4.5 Drag bounds captured at attach time versus a window that resizes

**Partly a non-issue, and the review overstates it. VERIFIED by reading `node_modules/animejs/dist/modules/draggable/draggable.js`:**

- The draggable creates a `ResizeObserver` and observes **both** the container and the target (`:409-419`), calling `refresh()` on a 150ms debounce.
- `handleDown` calls `updateBoundingValues()` on **every grab** (`:844`).

So bounds are not frozen at attach time. A window that grows after mount will have correct bounds by the time anyone drags it.

**The real defect is placement, not bounds.** `Desktop.open` computes `size = {w: min(720, 52vw), h: min(405, 52vh)}` and feeds that to `cascadePosition` (`Desktop.tsx:60`). For a 9:16 file at 1440×900 the true window is roughly 315×598, not 720×405 — so the clamp is computed against the wrong box and the window can spawn overflowing the viewport bottom, with no drag involved and therefore no `updateBoundingValues` to correct it.

**Fix:** §4.4's metadata makes the true size available at `open()` time. Pass it. Then the spawn position is correct and both mechanisms agree.

Binding invariant: **a freshly spawned window is fully within the desktop bounds before any user interaction.** Do not rely on the release spring to correct a bad spawn.

Test: for each of a 16:9, a 9:16, a 1:1 and a 3:4 file, open it at 1440×900 and at 861×700 and assert the window rect is inside the viewport; then drag hard into all four corners and assert it settles inside ±24px. The existing drag test only exercises the top-left corner of a landscape window (`tests/e2e/desktop.spec.ts` ~line 45) and must be replaced.

### 4.6 `App.tsx:29` binds `keydown` on `window` with no target check

**VERIFIED.** ArrowLeft/ArrowRight switch tabs from anywhere, including from inside the volume slider — so adjusting volume with the keyboard also switches tabs and unmounts the panel underneath the control the user is holding.

**Ownership: exactly one `window`-level `keydown` listener exists in the application, registered by `Desktop`.** It handles only the two genuinely global keys and consults one shared guard.

| Key | Scope | Handled by |
|---|---|---|
| ArrowLeft / ArrowRight | global | the single listener → an `onTabShift` callback passed down from `App` |
| Escape | global | the single listener → close the focused file window; no-op if none is open |
| ArrowUp / ArrowDown / Enter | **local** | `onKeyDown` on the explorer's row list. Not global, so no guard is needed and no other surface can intercept them. |

The guard, applied to both global keys:

```ts
// CANDIDATE — src/lib/keyboard.ts
export const isInteractiveTarget = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null
  if (!t) return false
  if (t.isContentEditable) return true
  return !!t.closest('input, textarea, select, [role="slider"], [role="textbox"]')
}
```

Note that anime's draggable already declines to grab a `type === 'range'` target (`draggable.js:836`), so the slider is protected from the drag but not from the tab switch. Both need the same protection and the guard is the place to put it.

`ArchiveGrid`'s second Escape listener (`ArchiveGrid.tsx:39-43`) is deleted in the same slice that deletes the focus stage, so the two-listener race resolves rather than being ordered.

Test: focus the volume slider in an open window, press ArrowRight, assert the tab is unchanged and the volume increased.

### 4.7 Which surfaces get the grain/degradation overlay

The brief covers unfocused windows; the owner separately asked for intentionally-degraded low-res video generally. Settled:

| Surface | Media | Overlay | Why |
|---|---|---|---|
| Explorer preview pane | `_thumb` (240p) | **Yes** — scanlines + noise + slight desaturation, always on | It is by definition a low-res preview. Not overlaying it is what makes it look broken. |
| Unfocused file window | `_thumb`, muted | **Yes** | The owner's stated case. |
| Focused file window | `_full`, audio | **No** — the overlay fades out over ~200ms | The fade *is* the focus feedback. The picture visibly resolves. |
| Mobile primary player | `_full` | **No** | It is the mobile equivalent of a focused window. |
| Grid tiles | poster `<img>` | **No** | There is no video to degrade. Grid is a wall of posters per spec §2. |
| Backdrop | `_thumb` | **No** | It already sits under a scrim and every glass surface's blur. Adding grain fights the refraction that the overprint wordmark depends on. |

Binding: the overlay is pure CSS on the **slot**, not on the media node — `.preview-frame::after`, `.fw-body::after`. It must not be attached to the node, because the node moves and would carry its treatment into a surface that should not have it. This is the reason to state it: it is the one place where "the node moves" leaks into styling.

Corollary, binding: **the media host carries its own presentation** (`width:100%; height:100%; object-fit` and nothing else), so a node looks the same wherever it lands. Slots contribute box size only. Note the global default is `object-fit: cover` (`src/index.css:45`), which crops — under the true-frame ruling the host must set this explicitly rather than inherit whatever the destination happens to specify.

Open, marked for the owner: whether the grid's poster tiles should carry a *static* grain for visual consistency. Cheap either way, purely cosmetic, no decode cost. Not decided here.

### 4.8 `archive.ts` durations are wrong on 11 of 12 files

**VERIFIED by `ffprobe` against `public/media/*_full.mp4`.** Only `file02` is correct.

| id | claimed | actual | id | claimed | actual |
|---|---|---|---|---|---|
| file01 | 00:12 | 00:10 | file07 | 00:13 | 00:09 |
| file02 | 00:10 | 00:10 | file08 | 00:07 | 00:05 |
| file03 | 00:08 | 00:12 | file09 | 00:15 | 00:12 |
| file04 | 00:11 | 00:12 | file10 | 00:09 | 00:05 |
| file05 | 00:09 | 00:12 | file11 | 00:11 | 00:10 |
| file06 | 00:14 | 00:10 | file12 | 00:10 | 00:12 |

**Ruling: metadata becomes build-generated, not hand-verified.** Hand-verification fixes today's twelve values and re-breaks the moment the archive changes — which it already did once, and `scripts/process-media.sh` already failed silently on that same change.

Shape: `scripts/process-media.sh` (or a sibling) emits a generated file — candidate `src/data/mediaMeta.generated.ts` — containing `{ [id]: { width, height, durationSec } }` per file, produced by `ffprobe` over whatever is actually in `raw/`. `archive.ts` keeps the hand-authored editorial fields (name, tagline, year) and merges the generated ones. Duration is formatted for display from `durationSec` rather than stored as a string.

Two things this buys beyond correctness: §4.4's aspect ratios come from the same pass, and the display can round consistently instead of twelve independent guesses.

Guard test: a unit test that asserts every `ARCHIVE` id has a generated metadata entry, so a file added to `raw/` without a re-run fails the suite instead of shipping.

Adjacent, same slice: `scripts/process-media.sh` should discover `raw/*` rather than loop `file01..fileNN`. It has already silently skipped new files once. This was raised as out of scope earlier; it is now load-bearing, because the generated metadata is only as complete as the discovery loop.

### 4.9 Reparent animation versus React's inline styles

Not on the original list, but it is the mechanism the plan specifies and it does not work as specified.

**VERIFIED by reading `node_modules/animejs/dist/modules/layout/layout.js`:** `createLayout` stamps `data-layout-id` on every element in its root subtree (`:260-265`) and writes inline `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` and `translate` directly onto animating nodes (`:1470-1510`).

The plan roots it at `.desktop` (`Task 11 Step 2`), which contains every `.file-window`. `FileWindow` also writes inline `width`, `left`, `top` and `zIndex` from React (`FileWindow.tsx:36-40`). Any React re-render during the 520ms beat — and there will be several, since the window has just mounted and focus state is changing — overwrites what anime just wrote. The result is a visible glitch, not a crash, but it is a glitch that will only appear under timing.

**Binding invariant: the reparent animation must not depend on any React-rendered node's inline style surviving the beat.**

`createLayout` on `.desktop` cannot satisfy that, because both parents are React-rendered and the root must contain both. **The move animation is therefore a single-element FLIP on the host div** — measure the host's rect, `appendChild`, measure again, animate the delta to zero with `animate()` on transform and opacity only. The host is not React-styled, so nothing can clobber it, and only one element is measured instead of the whole desktop subtree (12 explorer rows, 3 windows, the terminal) twice at the most contended moment in the app.

**Flag for the owner:** this deviates from his explicit "use the swap parent animation from animejs" instruction. The visible result is the same — the video is measured in the pane, moved, and animated from where it was to where it now is, which is what `createLayout` does. `createLayout` earns its keep when many siblings reflow around a move; here exactly one element moves. If he wants the library mechanism specifically, the swap is behind one function and can be substituted, and §6 names the experiment that would settle which looks better.

Also binding: record `{currentTime, paused, volume, muted}` before the move and restore after, **unconditionally**. This makes `reparentKeepsPlaying()`'s user-agent sniff (`Task 11 Step 1`) unnecessary — the fallback becomes "restore state after every move", which is correct on every engine and needs no browser detection. Delete the sniff rather than shipping it.

### 4.10 Carried-forward items with an owner assigned

Not contradictions, but they need a home so they stop being deferred:

| Item | Slice |
|---|---|
| `aria-live` region inserted with its text never announces (`Desktop.tsx:157`) — mount a persistent visually-hidden status region, update its text on refusal | C |
| `open(id)` unguarded for ids absent from `ARCHIVE` (`Desktop.tsx:141-142`) — validate before mutating state | A |
| Volume UI can disagree with the adopted node's real state (`FileWindow.tsx:16,48-52`) | C (row 6 of the ownership table) |
| `.fw-title` needs `min-width: 0` + ellipsis so the expanded volume control cannot crush a long portrait-window title | C |
| `.refusal` z-index 50 trapped inside `.desktop`'s stacking context, so `.build-tag` paints over the flash | E |
| Permanent `will-change: transform` on `.terminal-window`, a full-viewport `backdrop-filter` surface | E |
| `.tw-bell` orphaned rules, `--fs-lg` unused, `[data-tier='lite'] .file-window` duplicates the generic `.glass` rule | E |
| `CONTEXT.md` wrongly claims all placeholders are silent; only file07 has audio | E |

---

## 5. Revised task breakdown

The external review proposes five slices (10+13, 11+12, 14, 15+16, 17). **Adopted with one refinement: a new headless Slice A is split out in front of it.**

Reason to refine rather than adopt as-is: the review's first slice builds the selection contract *inside* the explorer task. But the same contract has to serve grid, mobile and the media controller, and building a cross-cutting contract inside a UI task is precisely the process that produced the drift this preflight exists to fix. Slice A has no visual output, which is the point — it can be fully unit-tested, and if it is wrong it is wrong cheaply.

Everything else in the review's sequencing is right and is kept, including its reasoning that Tasks 10–12 must not simply be merged into one large task.

### Slice A — contracts, headless

**Deliverable:** generated media metadata; `mediaController`; `ArchiveSelection` provider; `windowManager` slot allocation; the keyboard guard. No surface changes. The existing stack keeps rendering and the site stays deployable.

**Acceptance criteria**
- `ARCHIVE` carries build-generated `width`, `height`, `durationSec`; a guard test fails if any id lacks generated metadata.
- `windowManager` allocates and frees slots; `openWindow` rejects unknown ids.
- `mediaController` reconciles a desired placement map into DOM moves, keyed by `fileId`, with `window > primary > preview` priority.
- `ArchiveSelection` exposes `select`/`activate`/`view`; `activate` always selects first; the activation policy is one function.
- One `keydown` listener contract documented and the guard implemented.
- No `querySelector` for media anywhere in `src/components`.

**The one test that proves it:** a jsdom lifecycle test that drives `mediaController` through acquire → preview → open window → focus swap → open second window → close first → view switch to grid → explorer unmount, asserting after every step that each file's node is exactly one object, that its `parentElement` is the slot the priority rule predicts, and that released files have no `src` attribute. This is possible without a browser only because §4.4 removed the dependency on `videoWidth`.

**Review:** required. It changes state ownership and lifecycle.

### Slice B — navigation surfaces (was Tasks 10 + 13)

**Deliverable:** `ArchiveExplorer` two-column list with a slot-based preview pane and full metadata block including resolution; `ArchiveGrid` reduced to poster tiles calling `activate({via:'tile'})`; `FileCard` focus stage and `SND` toggle stripped; `src/lib/flip.ts` deleted; `ArchivePanel` toggle becomes LIST/GRID with the `stack` → `list` migration.

**Acceptance criteria**
- Rows and the preview frame are both activation targets (spec §2).
- The preview pane reserves its exact box from metadata and shows a poster whenever its file's node is elsewhere. No `min-height` hack.
- Neither the explorer nor the grid imports `DesktopContext`.
- Zero page scroll at 1440 / 768 / 390 with 12 rows at the new type scale.

**The one test that proves it:** select file09, switch to GRID, click file03's tile — assert the view returns to LIST, file03's window opens, the preview pane shows file03's poster (not its video, per slot priority), and the backdrop is file03.

**Review:** required. It crosses the React/DOM boundary via slots and changes responsive behaviour.

### Slice C — window media lifecycle and playback tiers (was Tasks 11 + 12)

**Deliverable:** the move animation behind `mediaController`; playback-tier reconciliation through the single `VideoDirector`; the degradation overlay on the surfaces in §4.7; volume hydration; true-frame `.fw-body` sizing; correct spawn placement; the persistent live region.

**Acceptance criteria**
- Opening a window moves the node and it keeps playing across the move; `currentTime` is preserved.
- `.fw-body` ratio matches metadata within 0.5%; window height is body + 42px; no window root carries `aspect-ratio`.
- Focused window has audio available and no overlay; unfocused windows are muted, on `_thumb`, overlaid.
- A window adopting a node at volume 0.6 renders `060`.
- No inline `transform` remains on the host 500ms after a move.
- A window that spawns is fully inside the viewport before any interaction, for all four aspect classes.

**The one test that proves it:** open three windows in sequence, focus each in turn, close the middle one, and assert at every step — exactly one `_full` src exists, unpaused videos ≤ 5, every open window's body contains exactly one video whose id matches its own, and the closed file's node is either in the preview pane or has no `src`.

**Review:** required, independently, per the review's recommendation. This is the highest-risk slice on the branch.

### Slice D — mobile (was Task 14)

**Deliverable:** the single swipeable row; the `primary` slot; the lite policy table from §4.2; no windows below 861px.

**Acceptance criteria**
- `[data-primary-view] video` exists at 390px (lite) — the contradiction in §4.2 is resolved in the implementation, not in the assertion.
- Zero windows are created at any width below 861px.
- Horizontal overflow is confined to the row; the page never scrolls.
- Swiping the primary view advances selection.

**The one test that proves it:** at 390px, tap tile 2 then swipe the primary view left — assert the primary player is a `<video>` showing file03, `[data-file-window]` count is 0, and `document.scrollingElement.scrollTop` stays 0.

**Review:** required, and separate from Slice C, because the interaction model differs even though the machinery is shared.

### Slice E — cleanup and documentation (was Tasks 15 + 16)

**Deliverable:** delete `ArchiveStack`, `HomeNotification`, `stackLayout`, `stack.spec.ts` and the dead CSS; fix `boot.spec.ts` and `smoke.spec.ts`; clear the §4.10 cosmetic backlog; make `process-media.sh` discover `raw/*`; update `CONTEXT.md`.

**Acceptance criteria:** `npm run build && npm test && npm run lint && npm run e2e` fully green across all three Playwright projects. Zero expected-red remaining. `grep -rn "ArchiveStack\|HomeNotification\|stackLayout\|lib/flip" src tests` returns nothing.

**The one test that proves it:** the full e2e suite at 0 failures. This is the first point in the branch where that is true, so it is the meaningful gate.

**Review:** not required if the diff is deletions plus test updates and the suite is green. This is the review's "mechanical" category.

### Slice F — deploy (was Task 17)

Unchanged from the plan. Push, trigger the workflow explicitly, compare the live build stamp against the local SHA.

### Ordering note

A and B can overlap only if B does not begin before A's controller interface is frozen. C depends on both. D depends on A and C. E depends on everything. F is last.

---

## 6. Open questions and the experiments that would settle them

These are not resolved. Do not let an implementer resolve them by assertion.

**1. ~~Safari and Firefox behaviour across a same-document media reparent.~~ RESOLVED 2026-07-31 — experiment taken, WebKit passes.**

The WebKit Playwright browser was installed and the spike re-run. Result:

| engine | paused after move | currentTime | readyState | buffered ranges |
| --- | --- | --- | --- | --- |
| Chromium | `false` | 0.504 → 1.105 | 4 → 4 | 1 → 1 |
| WebKit | `false` | 0.495 → 1.095 | 4 → 4 | 1 → 1 |
| Firefox | `false` | 0.487 → 1.082 | 4 → 4 | 1 → 1 |

**All three engines pass identically.** None pauses on a same-document reparent; none tears down the decoder or drops buffered data. Playback continues uninterrupted everywhere.

**Consequence: the UA-sniffing fallback is deleted, not written.** `reparentKeepsPlaying()` from the original Task 11 plan must not be implemented — there is no engine-conditional path. §4.9's unconditional state restore still stands, because it also covers the ordinary case of a node arriving with stale `volume`/`muted`, but it is no longer load-bearing for a browser quirk.

There is no engine-conditional path anywhere in the media lifecycle.

**2. Whether the decode ceiling is actually survivable.** The design's ceiling is 1 full + 2 thumb + 1 preview thumb + 1 backdrop thumb. Nobody has measured it. *Experiment:* Playwright with three windows open for 10 seconds, reading `video.getVideoPlaybackQuality().droppedVideoFrames` per element and CDP `Performance.getMetrics`. If it fails, the spec already names the first cut — pause the explorer preview whenever any window is open — and that should be a one-line policy switch in `reconcile`, not a redesign.

**3. Single-element FLIP versus `createLayout` for the open beat.** §4.9 argues the technical case; it does not settle taste. *Experiment:* implement the move behind `mediaController` with the single-element FLIP, record it headlessly at 60fps, and show the owner. If he wants `createLayout` specifically, the substitution is local — but it requires solving the inline-style conflict first, most plausibly by suppressing React re-renders of the window chrome for the duration of the beat, which is its own new hazard.

**4. Whether grid tiles should carry a static grain.** Cosmetic, cheap either way, not decided here.

**5. Whether volume persists per file across close and reopen.** This document assumes yes, held in the controller's per-file record for the session. It is a defensible default, not a ruling.

---

## 7. Problems created by the binding rulings

Raised because they are real, not to reopen the rulings.

**The terminal is draggable but occupies almost the entire viewport.** It is sized `inset: var(--frame)`, so at 1440×900 it is roughly 1420×880 inside a 1440×900 container. With `containerPadding: -24` it can travel about 44px in any direction before it hits its bound. A drag with 44px of travel does not read as "moving a window"; it reads as the UI wobbling. Combined with the ruling that it never raises, its draggability is close to decorative. Two coherent options — give it a genuine window size so dragging means something, or drop its draggability and let it be what the ruling says it is, a fixed background layer. Currently it is neither. **Needs a decision before Slice C wires the final drag configuration.**

**True-frame plus the mobile primary player.** "No letterboxing, ever" is easy inside a window whose body is sized from metadata. On mobile the primary player fills a panel body of fixed shape, and a portrait clip in a landscape-ish panel must either bar, crop, or leave the panel's own background visible around a correctly-proportioned media box. The third is the only one consistent with the ruling, and it should be stated as such before an implementer reaches for `object-fit: cover`. Note the global stylesheet default is already `cover` (`src/index.css:45`), so the wrong behaviour is what happens if nobody writes anything.

**The 861px width split removes hover from tablets, which removes preview.** On a touch tablet `onMouseEnter` never fires, so under the plan's design the preview pane and the backdrop would never track the user's choice. §3's rule 2 (`activate` always selects first) closes this, and it is only a small hole because tapping opens a window that shows the video anyway. Worth recording that the width ruling created it, so the rule is not later "simplified" away.

**Five concurrent decodes at 1440 is the stated ceiling, and it is the ruling's direct consequence** — three windows, all playing, plus preview, plus backdrop. It follows from "max 3 windows" and "unfocused windows still play". §6's experiment 2 is the check. If it fails, the cut is the explorer preview, and that is a ruling the owner should make rather than an implementer.

---

## 8. What this document deliberately does not settle

- Any visual detail already settled by the spec: window chrome layout, refusal timing, wordmark treatment, type scale.
- Window resize handles, minimise/maximise, position persistence across reloads. Out of scope per spec §13, and nothing here should be built to accommodate them.
- Real content. All twelve clips remain Pexels placeholders and all editorial metadata is throwaway.
