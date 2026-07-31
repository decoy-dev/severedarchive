# Codex review — severedarchive desktop rebuild

**Date:** 2026-07-31  
**Reviewed branch:** `desktop-windows` at `5571e07`  
**Input handoff:** `docs/CODEX-HANDOFF.md`  
**Scope:** Review only. No application source code was changed.

## Executive summary

Tasks 1–9 are generally faithful to the brief and the implementation is in good shape for work in progress, but the remaining plan has several lifecycle and ownership gaps that should be resolved before Task 10 begins. The largest risk is not an isolated bug in the current code; it is the proposed React/anime.js media-reparenting architecture across Tasks 10–14.

The cheapest high-leverage change is a fresh-context preflight over the remaining plan. For every stateful resource—preview video, file window, focus rank, playback tier, drag instance, layout animation, and mobile player—write down:

1. Who owns it?
2. Who creates it?
3. What transitions it?
4. Who destroys or restores it?
5. Which test proves the complete lifecycle?

Do that before dispatching Task 10. It should expose the current contradictions while they are still cheap to fix.

## A. Code review

### Medium priority

#### 1. Cascade positions can collide after a window closes

`Desktop.open()` derives the next cascade slot from `cur.length` (`src/components/Desktop.tsx:55-62`). After opening three windows, closing an earlier one, and opening another, the new window can receive the same position as a surviving later window. `closeWindow()` densifies z-order but retains positions (`src/lib/windowManager.ts:24-25`), while `cascadePosition()` has no identity or occupancy awareness (`src/lib/windowManager.ts:31-44`).

Touch: replace count-based placement with an unoccupied-slot search, monotonic open sequence, or position collision avoidance. Add a unit test for open A/B/C → close A or B → open D.

#### 2. Window size, aspect ratio, and drag bounds have an unstable contract

The draggable is initialized when the window element mounts (`src/components/Desktop.tsx:80-111`), but `FileWindow` discovers the reparented video asynchronously and may change its aspect ratio later (`src/components/FileWindow.tsx:17-28`). Anime's bounds are therefore established against a box whose dimensions can subsequently change. There is no resize observation or explicit draggable refresh.

The CSS box also applies the media ratio to the entire window (`src/components/FileWindow.tsx:36-40`) even though the window includes a fixed 40px title bar (`src/index.css:438-460`). The body itself therefore does not preserve the video's true aspect ratio.

Touch: define whether aspect ratio belongs to `.fw-body` or the full window; size from metadata before attaching drag where possible; otherwise observe size changes and refresh/recreate bounds. Test portrait, square, and landscape files near the right and bottom edges.

#### 3. The terminal/explorer is outside the focus and z-order model

The terminal is draggable under the private `__terminal__` id, but that id is never present in `WinState[]` (`src/components/Desktop.tsx:16,114-117`). `focusWindow()` is therefore a no-op for it (`src/lib/windowManager.ts:18-21`). File-window z-index is React-owned while terminal drag/focus behavior is effectively separate. As more animation code arrives, imperative z-index changes could diverge from React state.

Touch: decide whether the terminal is a first-class desktop window. If it is, include it in one authoritative focus stack with a non-closable flag. If it is intentionally background-only, remove the implication that grabbing it focuses it and document its fixed layer.

#### 4. The drag-boundary e2e test does not prove the stated behavior

The current test exercises a top-left drag and checks the wrong/insufficient edges; it does not verify the bottom boundary. That can pass while right/bottom overflow or post-resize stale bounds remain broken (`tests/e2e/desktop.spec.ts`, drag-boundary case around line 45).

Touch: assert the actual bounding rectangles after aggressive drags into all four corners, allowing only the deliberate elastic overshoot during motion and requiring settlement inside the viewport. Include a portrait window because it exercises the size-change path.

#### 5. `BUFFER FULL` is unlikely to announce reliably

The assertive live region is conditionally inserted together with its already-populated text (`src/components/Desktop.tsx:156-160`). Assistive technologies commonly require the live region to exist before its content changes.

Touch: mount a persistent visually hidden status/live region and update its text or counter when refusal occurs. Keep the visual flash separate and hidden from accessibility APIs.

#### 6. Volume UI can disagree with the adopted video's actual state

`FileWindow` starts its local volume at zero (`src/components/FileWindow.tsx:16`) and only pushes later slider changes to the video (`src/components/FileWindow.tsx:46-51`). It never reads `volume` or `muted` when a video is reparented. A playing preview can therefore be audible while the UI shows zero, or vice versa.

Touch: make playback state authoritative in one owner and hydrate the control when the media element is adopted. Avoid separate unsynchronized React and DOM state.

#### 7. Expanded volume controls can crush long portrait-file titles

The title bar is a single flex row and the expanded control can grow to 180px (`src/index.css:406-414,444-456`). `.fw-title` lacks `min-width: 0`, overflow handling, and ellipsis. Long names on narrow portrait windows can overlap or force controls out of bounds.

Touch: make the title the shrinkable region with ellipsis, keep controls non-shrinking, and test the longest filename at the narrowest supported window width.

### Lower priority / cleanup

- `Desktop.open(id)` accepts ids absent from `ARCHIVE`, consuming a cap slot and focus rank while rendering no window (`src/components/Desktop.tsx:55-67,140-142`). Validate before state mutation.
- The global archive arrow-key handler can intercept arrow keys meant for range inputs once the volume control is present. Ignore events from interactive controls or scope navigation to the file list.
- The file metadata includes at least one duration mismatch relative to the actual media. Prefer generated metadata or verify the hand-authored values.
- Permanent `will-change: transform` on large glass surfaces forces long-lived compositing (`src/index.css:95-105,438-443`). Apply it only during drag or confirm with profiling that it is beneficial.
- `.tw-bell` rules are orphaned (`src/index.css:158-159`), the lite `.file-window` rule duplicates the generic lite glass behavior (`src/index.css:131-137,462`), and `--fs-lg` is unused.
- The refusal overlay's `z-index: 50` is trapped inside `.desktop`'s stacking context, so siblings outside that context can still paint over it (`src/index.css:80-91,465`). Verify the flash truly covers everything or move it to the appropriate top-level layer.
- `file07` is the only placeholder with audio and contains inherited Vimeo handler metadata. `CONTEXT.md` should not claim all clips are silent.
- `scripts/process-media.sh` should discover source files rather than hard-code `file01..fileNN`; the existing loop already failed silently when the archive doubled.

## B. Brief compliance

### Faithful and already visible

- **Overprint wordmark:** implemented with the requested second display face, removed from the terminal title bar, and layered behind the first window while remaining above the glass backdrop.
- **Type scale:** the base size and hard floor were raised, and existing literal sizes were migrated to tokens.
- **Alert removal:** the visible alert was removed. Only orphaned component/CSS/test cleanup remains.

### Faithful but not yet proven end to end

- **Top-mounted file-window title bar:** present in `FileWindow`, with filename and close control in the window chrome. It is not yet exercised with actual reparented video content, long titles, or all aspect ratios.
- **Click-to-expand volume:** implemented with good disclosure/focus mechanics, but media-state synchronization and narrow-titlebar layout remain unresolved.
- **Elastic browser-edge drag:** anime.js draggable bounds and spring-like release are present. Boundary tests are incomplete, and resizing after attachment may stale the bounds.
- **Three-window cap:** the pure state cap and visual refusal exist. Invalid ids can consume slots, and the screen-reader refusal path is not reliable.

### Correctly deferred to Tasks 10–14

- **Two-column explorer replacing stack:** not built yet.
- **Swap-parent opening animation:** not built yet.
- **Focused/full-res versus unfocused/240p playback:** not built yet.
- **Pixelated/grainy degradation overlay:** not built yet.
- **Grid as a larger explorer with no focused grid video:** not built yet.
- **Mobile single slidable row, inline primary playback, and no floating windows:** not built yet.

Deferral itself is not drift, but the remaining plan does not yet specify these features tightly enough to guarantee the requested result.

### Plan-level drift and quiet drops to fix before implementation

#### React ownership versus imperative video reparenting

Task 10 proposes a React-owned keyed preview `<video>`, then Task 11 proposes moving that node outside its React-rendered parent. The plan does not define how reconciliation behaves after the move, what happens on explorer rerender/unmount, or who returns/destroys the node. This is the largest remaining architecture risk.

#### Closing a window does not reverse the requested swap

The planned close path removes the window but does not clearly animate or restore the media element to its explorer/grid source. The owner's request describes pulling a video from the viewer into a separate window; the inverse lifecycle should be specified, even if the visual close motion is intentionally simpler.

#### Preview selection is not identity-safe

The proposed global preview lookup can locate whichever preview video currently exists rather than prove it belongs to the requested file. Grid selection could request one file while Task 11 moves another file's preview node.

#### `setBackground` is planned but not wired

Task 12 introduces a background/playback hook, but the remaining plan does not show the caller that drives it. A public API with no transition owner is a likely dead path.

#### Degradation behavior is incomplete

The plan focuses degradation on unfocused file windows but does not fully state whether the explorer, grid, terminal preview, and mobile primary player use low-resolution media, overlays, or both. The user asked for intentionally degraded unfocused/low-res videos, not just one window state.

#### Explorer rows omit requested usefulness details

The planned preview is not clearly clickable as part of the file affordance, and the metadata design does not include resolution even though the brief frames this as a file-explorer model. Make the complete row/thumbnail activation target and metadata contract explicit.

#### Mobile test and implementation contradict each other

Task 14's lite-tier implementation path renders an image while its test expects a video. Decide the product behavior first: the owner's brief says tapping plays as the primary view, so a video element is the more faithful contract unless lite mode explicitly requires poster-only behavior.

#### Terminal focus participation disappeared

The current code comment says the explorer is a window, but the state model excludes it. The remaining plan should either restore terminal/explorer participation in desktop focus ordering or explicitly declare its fixed background role.

## C. Process assessment

### 1. Is independent review earning its cost?

Yes, selectively. It caught real regressions and, more importantly, defects in the plan's supplied implementation recipes. It is not cost-effective for every task.

Gate independent review by **behavioral risk**, not lines changed. Require it when a task has any of these traits:

- changes state ownership or lifecycle;
- crosses React/DOM/library boundaries;
- adds async behavior, animation teardown, media, focus, or accessibility semantics;
- changes responsive behavior across tiers;
- changes persistence, concurrency, or resource limits;
- has expected-red tests or relies on browser-only behavior;
- carries unresolved findings into another task.

Mechanical dependency additions, static data expansion, dead-file deletion, and exact token substitutions can skip a separate reviewer when scoped tests and a clean diff prove the change.

### 2. Per-task fix rounds or phase batching?

Review coherent behavioral slices. Reviewing every tiny task creates ceremony, while waiting until an entire phase makes ownership errors expensive.

Recommended rhythm:

1. Implement a coherent slice.
2. Run its scoped tests and write a compact report.
3. Review the completed slice once.
4. Fix Critical/Important findings immediately.
5. Do one short regression review after the fix.

Do not batch known high-severity findings until phase end. Low-priority cleanup can accumulate into Task 15.

### 3. Resequence Tasks 10–17

Use these slices:

1. **Tasks 10 + 13 — navigation surfaces:** build explorer and convert grid to the same file-selection contract. This prevents two divergent selection models.
2. **Tasks 11 + 12 — media lifecycle:** implement open/reparent/close/focus/playback-tier behavior as one owned state machine. Review this slice independently.
3. **Task 14 — mobile lifecycle:** reuse the selection/media contract without floating windows, but keep its verification separate because the interaction model is different.
4. **Tasks 15 + 16 — cleanup and documentation:** remove dead code/tests and bring context current.
5. **Task 17 — deploy and production verification.**

Tasks 10–12 should not simply become one large task under the current plan. First unify the ownership contract, then combine work by coherent slice as above.

### 4. Are the subagents over-instructed?

The problem is not primarily the 600–900 word length. It is prescribing unreviewed code recipes alongside requirements. That makes plan defects look authoritative and encourages locally correct implementations of a globally wrong lifecycle.

Dispatch prompts should emphasize:

- acceptance criteria;
- existing interfaces and invariants;
- known risks/carry-forwards;
- expected-red inventory;
- allowed scope;
- required verification and report format.

Implementation mechanics should be binding only when already proven. Otherwise label them as candidate approaches and require the implementer to report deviations. A useful target is roughly 250–400 words of task-specific dispatch context plus links to the governing spec/plan/ledger; reports can usually stay within 300–500 words.

### 5. Cheapest improvement with the most leverage

Run a fresh-context preflight on the remaining plan before Task 10. The reviewer should produce a one-page ownership/lifecycle table covering every stateful resource and every transition: explorer → window, grid → explorer/window, focus change, cap refusal, close, breakpoint change, tier change, and unmount.

Do not begin implementation until each row has one owner and one verification path. This is cheaper than another blanket review layer and directly targets the class of defects the existing review process has repeatedly found.

## Recommended next actions for Claude

1. Amend the plan before Task 10; do not patch these contracts ad hoc during implementation.
2. Define a single file-selection API shared by explorer, grid, and mobile.
3. Define a single media lifecycle/state machine with explicit node ownership, identity checks, open/focus/close transitions, and cleanup.
4. Decide whether the terminal is part of the focus stack.
5. Correct the Task 14 lite-mode contradiction.
6. Upgrade drag tests to all edges and size classes.
7. Keep current source bugs in the ledger and fix them in the slice that owns the affected lifecycle; send dead CSS/docs-only items to Tasks 15–16.

## Verification performed during this review

- Production build passed.
- Unit tests passed: 40/40.
- Lint/check passed.
- `npm audit` reported 0 vulnerabilities.
- The full Playwright run reproduced the documented expected-red classes; no unexplained failure class was found.
- The worktree was clean before this review document was added.

