# Codex handoff — severedarchive desktop rebuild

**Date:** 2026-07-31
**Branch:** `desktop-windows` (16 commits ahead of `main` at `c6905e4`)
**Your remit:** review only. Do not modify code. Point at what needs touching and why.

---

## 1. What this project is

Single-screen portfolio site for severedarchive, a motion/visual artist (Blender renders set to music; metalheart/chromeheart, neo-2000s). A CRT-terminal window rendered in liquid glass floats over a fullscreen video backdrop. **Zero scrolling on any device** is a hard product constraint.

- Live: https://decoy-dev.github.io/severedarchive/ (still serving `main`, not this branch)
- Stack: React 19, TypeScript strict, Vite 8, Tailwind 4 (tokens in plain CSS), anime.js 4.5, Vitest, Playwright
- All 12 videos are Pexels stock placeholders. About/Links copy is placeholder.

Read `CONTEXT.md` for the pre-existing project background. **Note it is now partly stale** — it still describes the archive stack this branch replaces, and Task 16 is supposed to correct it.

---

## 2. The owner's brief, verbatim

This is what Chris asked for. It is the yardstick — assess the work against *this*, not against my plan.

> Great news, he really likes it so far. I feel that I'm only about 40% done, though. There's a lot of polish I want on this. For instance, we need to consider the realistic use case here. I want to double the amount of videos in the archive and try to understand how we'll make that look in both the stack and grid views. The stack still feels a bit janky to me, and the layout could make a bit more sense. Again, we're trying to replicate the feeling of windows in a "desktop", so files shouldn't just get a bar on the bottom with the name and the volume bar, I think the name should be on the top in the video window's own bar, and the volume should be a UI element that gets clicked and expanded. I also think that the stack when hovering the group of videos has a janky animation, it's really fast to expand and isn't a smooth lerp like I would like. Perhaps we should make it look like a 2 column file explorer instead? And when you click on an option it opens a separate window up that can be dragged or closed separately. We certainly need to make sure the site doesn't become too heavy with several videos open. There's also some things that feel a little odd or out of place, like the alert notification. I would also maybe like to see "SEVEREDARCHIVE" in the top left corner of the backmost window removed, and maybe get added as large, heavy text behind the window instead, pinned to the top left corner, for that overprint look and feel. I also think that a lot of the UI elements on the page in general are quite small and hard to read/see.

Follow-up requirements he added mid-design:

> When clicking a video from the file viewer panel, it would be neat if a window got made and then the "swap parent animation" from animejs was used to pull the video out of the file viewer and into the viewer window. Also the draggable windows should be bound to the edges of the user's browser via constructor function in animejs, there's a bit of an elasticity or bounce when a window reaches the edge of the screen, found in animejs "Scope"

> It would be better I think if the unfocused, low res videos had a bit of a pixelated or grainy overlay on them so it looks "intentionally" bad while still being actually lightweight.

### Decisions he made when asked

| Question | Ruling |
|---|---|
| Where do windows live? | **Free-floating on the desktop**, not contained in the terminal window |
| Fate of STACK / GRID views | Explorer replaces STACK; **GRID survives** |
| Concurrency cap | **3 windows**; 4th is refused with a white flash + large `BUFFER FULL` overprint, fading fast |
| Source of 6 new videos | **Pull more Pexels placeholders** (not re-cuts of existing footage) |
| Alert notification | **Delete entirely** |
| Mobile behaviour | Explorer becomes a **single finger-slidable row**; tap plays as primary view; **no windows on mobile** |
| Type scale | **Substantial bump** — base 13→15px, 12px hard floor |
| Grid click behaviour | Grid is **"just a larger version of the file explorer columns"**; clicking opens the video in explorer view; **no focused video inside grid view** |
| Wordmark weight | **Bring in a second display face** (this overrode the previously binding single-font rule) |
| Unfocused windows | **Play the 240p thumb, muted** (plus his degradation-overlay idea above) |
| Wordmark stacking | **"Above the glass, but below the first terminal window"** |
| Motion-rule exceptions | Sanctioned `max-width`, `filter`, and mobile `overflow-x` as exceptions to transform/opacity-only |
| Touch tablets | **Keep the 861px width split** — touch tablets deliberately DO get draggable windows. Do not gate on pointer capability |

---

## 3. Governing documents

- **Spec:** `docs/superpowers/specs/2026-07-31-desktop-windows-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-31-desktop-windows.md` (17 tasks, 5 phases)
- **Ledger:** `.superpowers/sdd/2026-07-31-desktop-windows/progress.md` — per-task completion, rulings, deferred findings, carry-forwards. **Read this; it is the densest single source of what happened.**
- Per-task briefs and implementer reports live beside the ledger as `task-N-brief.md` / `task-N-report.md`.

---

## 4. What is built (Tasks 1–9 complete)

16 commits. Phases 1–3 done; Phase 4 (explorer) not started.

| Task | Commit | What landed |
|---|---|---|
| 1 | `6dcf746` | Type-scale tokens `--fs-xs/sm/base/lg`; every literal mapped up; 12px floor |
| 2 | `c4bb508` | `@fontsource/archivo-black` installed, `--display` token |
| 3 | `c5bbe57`, `1dc0771` | Overprint wordmark; name removed from title bar; ALERT button removed; z-restack |
| 4 | `85285f9` | Six Pexels clips in 4 aspect ratios (9:16 ×2, 1:1, 3:4, 16:9 ×2); `public/media` 19MB |
| 5 | `b7ed128` | `ARCHIVE` extended to 12 entries |
| 6 | `06f0d2e`, `fac50d9` | `src/lib/windowManager.ts` — pure z-order/focus/cap/cascade, 11 unit tests |
| 7 | `94d012f`, `7651176`, `c3441c1` | `VolumeControl.tsx` — collapsed `VOL ▮▮▯` button expanding to a slider |
| 8 | `5501978` | `FileWindow.tsx` — title bar, volume, close, aspect-hugging window size |
| 9 | `e8164fe`, `3bf461a` | `Desktop.tsx` — window state, bounded drag w/ elastic edge, `BUFFER FULL` refusal, `App.tsx` rewire |

### New architecture

- `src/components/Desktop.tsx` (165 lines) — owns window state, `DesktopContext` (`open`, `registerTerminal`), `createScope`/`createDraggable` wiring, refusal animation, `Esc` handling.
- `src/components/FileWindow.tsx` (60) — chrome only; body is deliberately empty, a later task re-parents a `<video>` into it.
- `src/components/VolumeControl.tsx` (70) — disclosure pattern with `inert`, `useId`, focus restoration.
- `src/lib/windowManager.ts` (45) — pure state functions, no React, no DOM.
- `src/index.css` (491) — grew ~120 lines.

### Still present but scheduled for deletion (Task 15)

`ArchiveStack.tsx`, `HomeNotification.tsx`, `stackLayout.ts`, `flip.ts`, `tests/e2e/stack.spec.ts`. `HomeNotification` is already orphaned — nothing imports it.

---

## 5. Test state

`npm test` (Vitest): **40/40 passing.**
`npm run e2e` (Playwright, 3 projects — desktop 1440, tablet 768, mobile 390): **12 failing / 51 passing / 15 skipped.**

Every e2e failure is accounted for:

| Count | File | Cause | Owner |
|---|---|---|---|
| 4 | `desktop.spec.ts` | needs `[data-file-row]` | Task 10 (next) — these are the success signal |
| 4 | `boot.spec.ts` | notification removed | Task 15 |
| 1 | `archive.spec.ts` | 12 files now paginate, `.grid-pager` appears | Task 13 |
| 3 | `smoke.spec.ts` | asserts old title-bar text `SEVEREDARCHIVE // FILE SYSTEM` | **was an unowned plan gap**, assigned to Task 15 |

---

## 6. Outstanding bugs and deferred findings

None are fixed. Chris said "we'll address bugs later."

**Accessibility**
1. `Desktop.tsx:157` — `aria-live="assertive"` on an element inserted *together with* its text. Live regions must pre-exist to announce. **The `BUFFER FULL` cap refusal is visual-only for screen readers.** Only real a11y regression on the branch.

**Correctness / robustness**
2. `FileWindow.tsx:36-45` — aspect-ratio effect is a **one-shot passive lookup keyed on `file.id`, with no retry**. If no `<video>` is in `.fw-body` when it fires, the window silently keeps a wrong 16:9 ratio forever. Correctness currently depends entirely on Task 11 re-parenting inside `useLayoutEffect`. Silent failure mode, zero fallback.
3. `FileWindow.tsx:33,47-51` — volume state only ever **pushes** to the video, never reads from it on mount. A re-parented video carrying inherited volume/muted shows 0 on the control while playing at its old level.
4. `Desktop.tsx:141-142` — `open(id)` is unguarded for ids absent from `ARCHIVE`: consumes a cap slot, becomes `focusedId`, renders nothing.
5. Two window-level `Escape` listeners coexist (`Desktop.tsx:118-125` and `ArchiveGrid.tsx:40`). Self-resolves at Task 13.

**Cosmetic / cleanup**
6. `index.css:465` — `.refusal` is `z-index: 50` inside `.desktop` (a `z-index: 2` stacking context), so `.build-tag` (z 6) paints over the white flash.
7. `index.css:104` — permanent `will-change: transform` on `.terminal-window`, a full-viewport `backdrop-filter` surface. Composited for the whole session rather than only while dragging.
8. `--fs-lg: 17px` has no consumer anywhere.
9. `.tw-bell` / `.tw-bell:hover` CSS orphaned after the ALERT button was removed.
10. `[data-tier='lite'] .file-window` duplicates the generic `[data-tier='lite'] .glass` rule; `.file-window` already carries `.glass`.
11. Mobile `.tw-titlebar` raised 38→44px beyond the brief; wants a visual glance.
12. `file07_full.mp4` carries `Vimeo Artax Video Handler` container metadata from the Pexels source. `file07` is also the only clip with an audio track (AAC 48kHz) — the other 11 are silent, and `CONTEXT.md` still wrongly claims all placeholders are silent.

**Design smell raised, deliberately out of scope**
13. `scripts/process-media.sh` hardcodes a `file01..fileNN` loop instead of scanning `raw/`. It silently skips new files when stale — it already did, and had to be edited from `..file06` to `..file12`.

---

## 7. What remains (Tasks 10–17)

- **10** — Two-column explorer (`ArchiveExplorer.tsx`), replaces stack in `ArchivePanel`
- **11** — Swap-parent open animation via `createLayout` + `layout.update()` — the FLIP reparent Chris specifically asked for
- **12** — Playback tiers (focused = full res + audio, unfocused = 240p muted) + the deliberate degradation overlay
- **13** — Grid becomes a larger explorer; delete FLIP zoom and `SND` toggle
- **14** — Mobile single-row explorer, in-place playback, no windows
- **15** — Delete stack + notification + dead CSS; rewrite `boot.spec.ts`; fix `smoke.spec.ts`
- **16** — Update `CONTEXT.md`
- **17** — Deploy and verify

---

## 8. Verified technical facts (do not re-litigate)

Established by direct inspection of `node_modules/animejs@4.5.0` and a headless spike:

- `createLayout(root)` + `layout.update(cb, params)` with `swapAt` / `enterFrom` / `leaveTo` is the swap-parent API.
- `createDraggable` options: `container`, `containerPadding`, `containerFriction` (default `0.8`, clamped 0–1, applied as `(1 - friction) * dragSpeed`), `releaseContainerFriction`, `releaseEase`.
- **Re-parenting a playing `<video>` within the same document does NOT pause it in Chromium.** Spike: `paused` stayed `false`, `currentTime` advanced 0.403→0.908, `readyState` held 4. Safari/Firefox unverified — only the Chromium Playwright browser is installed; `layoutSwap.ts` will carry a UA-sniffing fallback.
- `createScope({root, mediaQueries}).add(cb)` takes a constructor callback and accepts a React ref or a bare element.
- Chris's instruction attributed the drag bounds to anime's "Scope". They actually live in `createDraggable`. Scope is still used, for React-ref rooting, the media-query split, and teardown.

---

## 9. How the work has been executed, and what I want challenged

I have been running the Superpowers **subagent-driven development** loop. Per task:

1. Extract the task's text from the plan into a standalone brief file.
2. Dispatch a fresh implementer subagent with the brief path plus hand-written context it cannot know.
3. Implementer writes code, runs tests, commits, writes a report file.
4. Generate a diff package; dispatch a separate reviewer subagent with a task-specific constraints lens.
5. Any Critical/Important finding → fix round (resume the same implementer) → scoped re-review. Up to 5 rounds.
6. Append outcome to the ledger; move on.

**Cost so far: 9 tasks, ~20 subagent dispatches, roughly 1.5M subagent tokens.**

### What the process has actually caught

Worth weighing against its cost — most defects were in **my plan**, not in the implementations:

- Task 3: the wordmark colour I specced rendered it invisible (measured max delta 17/255). Root cause turned out to be a z-index tie, not the colour.
- Task 6: two untested branches in test code my plan supplied verbatim.
- Task 7: `tabIndex={-1}` (my spec) hides from Tab order but not from screen readers. Then the *fix* introduced a focus-stripping bug that only the scoped re-review caught.
- Task 9: my reduced-motion refusal animated a container whose children were `opacity: 0` — invisible under reduced motion, **and my own e2e assertion couldn't catch it** because `toBeVisible()` ignores opacity. Also `container: rootRef.current` is null when the drag attaches, and anime silently falls back to `document.body`.
- Task 9 review pixel-compared the wordmark refraction against the parent commit to prove a z-index change hadn't regressed it.

### Questions I want you to answer

1. **Is the review layer earning its cost, or is it over-fitted?** Tasks 2 and 5 were trivial and passed clean. Should mechanical tasks skip the review dispatch, and if so what is the objective test for "mechanical"?
2. **Is the per-task fix-round loop the right shape**, or would batching findings across a whole phase and fixing once be cheaper without losing the catch rate?
3. **Should the remaining 8 tasks be resequenced?** Tasks 10–12 are tightly coupled (explorer → reparent → playback tiers) and the coupling has already produced two carry-forward hazards. Would one combined task with one review be better than three with three?
4. **Am I over-instructing the subagents?** My dispatch prompts run 600–900 words. Some of that is genuinely load-bearing (carry-forwards, expected-red inventories); some may be noise.
5. What is the cheapest change to my process that most improves outcomes for Tasks 10–17?

---

## 10. Your task

Read the code on `desktop-windows`, the spec, the plan, and the ledger. Then report:

**A. Code review.** Bugs, risks, and design problems in what has been built. Prioritise by severity. Cite `file:line`. Include anything on the deferred list in §6 you think is worse than its current rating — and anything not on the list at all.

**B. Brief compliance.** Against §2, where is the work faithful, where has it drifted, and what has been quietly dropped? Be specific about the things Chris named himself: the top-mounted window title bar, the click-to-expand volume, the swap-parent animation, the elastic edge, the overprint wordmark, the degradation overlay, the 3-window cap, the UI type scale, and the grid-as-larger-explorer model.

**C. Process assessment.** Answer §9's five questions with concrete recommendations for Tasks 10–17.

Do not change any code. Point at what needs touching, where, and why.
