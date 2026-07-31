# Desktop Window Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn severedarchive from a single terminal window into a desktop where clicking a file in a two-column explorer opens a real draggable, closable video window.

**Architecture:** A `Desktop` component owns all window state (open list, z-order, focus, 3-window cap) with the ordering logic extracted into a pure, unit-tested `windowManager` module. Windows drag via anime.js `createDraggable` bounded to the viewport, created inside a `createScope` rooted on a React ref so teardown and the desktop/mobile split are declarative. Opening a window physically re-parents the `<video>` element from the explorer's preview pane into the new window, FLIP-animated by `createLayout`.

**Tech Stack:** React 19, TypeScript, Vite 8, anime.js 4.5 (`createDraggable`, `createScope`, `createLayout`, `createSpring`), Tailwind 4 (tokens in plain CSS), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-31-desktop-windows-design.md`

## Global Constraints

- **Fonts:** Share Tech Mono for all interface text, single weight. Emphasis NEVER comes from `font-weight`. Exactly one exception: Archivo Black, used only for the overprint wordmark and the `BUFFER FULL` refusal.
- **Type floor:** no `font-size` below `12px` anywhere in `src/index.css`.
- **Colour:** accent `#b6ff2e` (`--acid`) on active/hover states only. `#ff3524` (`--alert`) is now unused — the notification that owned it is deleted.
- **Zero scrolling, ever**, at 1440 / 768 / 390. The one sanctioned exception is the explorer list's internal scroll region (Task 14), and only if the row list genuinely cannot fit.
- **Animation:** transform and opacity only. anime.js v4 modular API (`import { animate, createTimeline, stagger } from 'animejs'`) — never the v3 `anime({...})` global.
  **Sanctioned exceptions** (ruled by Chris, 2026-07-31 — extends the existing list in CONTEXT.md, which already sanctions the sliver width lerp). Do not flag these as defects; do not add new ones without asking:
  1. Task 7 — the volume control expands via `max-width`.
  2. Task 12 — the degraded preview transitions `filter`.
  3. Task 14 — the mobile file row uses native `overflow-x` scrolling. The page itself still never scrolls.
- **Reduced motion:** every animation added here must check `prefersReducedMotion()` from `src/lib/perfTier.ts` and degrade to an instant state change.
- **Lite tier:** `[data-tier='lite']` drops `backdrop-filter` from file windows entirely.
- **Playwright is ALWAYS headless.** Never launch a headed browser.
- **Git:** commit under Chris's identity as-is. NEVER add `Co-Authored-By`, "Generated with Claude Code", or any AI attribution anywhere in the repo, including commit messages.
- The DCY.DSGN ASCII header comment at the top of `index.html` stays verbatim.

## Verified Facts (do not re-litigate)

These were established by direct inspection and a headless spike before this plan was written:

- **anime.js 4.5.0 exports** `createLayout` (with `layout.update(cb, params)`, `swapAt`, `enterFrom`, `leaveTo`), `createDraggable`, `createScope`, `createSpring`. Confirmed in `node_modules/animejs/dist/modules/index.d.ts`.
- **`containerFriction`** defaults to `0.8`, is clamped 0–1, and is applied as `(1 - friction) * dragSpeed`. `1` locks hard at the bound; lower values give rubber-band travel. `releaseContainerFriction` defaults to whatever `containerFriction` is. Confirmed in `draggable.js:648-649,737`.
- **Re-parenting a playing `<video>` within the same document does NOT pause it in Chromium.** Spike result: `paused` stayed `false` across the move, `currentTime` advanced 0.403 → 0.908, `readyState` held at `4` (no reload, no re-decode). The swap-parent approach is safe.
- **Desktop Safari and Firefox are UNVERIFIED** — only the Chromium Playwright browser is installed locally. Task 11 adds the guard.
- `@fontsource/archivo-black@5.3.0` exists on npm.

## File Structure

**Create:**
- `src/lib/windowManager.ts` — pure window-state functions. No React, no DOM. Unit-tested.
- `src/lib/windowManager.test.ts`
- `src/components/Desktop.tsx` — owns window state, renders wordmark + window layer + refusal flash.
- `src/components/FileWindow.tsx` — window chrome, drag wiring, playback tier.
- `src/components/VolumeControl.tsx` — collapsed button ↔ expanded slider.
- `src/components/ArchiveExplorer.tsx` — two-column list + preview pane; single-row on mobile.
- `src/lib/layoutSwap.ts` — the `createLayout` reparent helper, isolated so the FLIP handoff is reasoned about alone.
- `tests/e2e/desktop.spec.ts` — window open/close/cap/drag-bounds coverage.

**Modify:**
- `src/index.css` — type tokens, wordmark, window chrome, degradation overlay.
- `src/App.tsx` — renders `Desktop`, loses notification state.
- `src/components/TerminalWindow.tsx` — becomes a window instance; title-bar text and ALERT button removed.
- `src/components/ArchivePanel.tsx` — toggle values `list` / `grid`.
- `src/components/ArchiveGrid.tsx` — poster tiles only, click delegates to open.
- `src/components/FileCard.tsx` — focus stage and SND toggle stripped.
- `src/lib/videoDirector.ts` — focus-plus-background model.
- `src/data/archive.ts` — 12 entries.
- `package.json` — add `@fontsource/archivo-black`.

**Delete:**
- `src/components/ArchiveStack.tsx`, `src/components/HomeNotification.tsx`
- `src/lib/stackLayout.ts`, `src/lib/stackLayout.test.ts`, `src/lib/flip.ts`
- `tests/e2e/stack.spec.ts`

## Phasing

Five phases, each ending in a deployable site. Do not start a phase before the previous one is green.

| Phase | Tasks | Ships |
| --- | --- | --- |
| 1 — Legibility | 1–3 | Type scale bump + overprint wordmark |
| 2 — Content | 4–5 | 12 files in the archive |
| 3 — Window manager | 6–9 | Draggable, closable, capped windows |
| 4 — Explorer | 10–13 | Two-column explorer + swap-parent open + grid rework |
| 5 — Mobile & cleanup | 14–17 | Mobile row view, degradation overlay, deletions |

---

## Phase 1 — Legibility

### Task 1: Type scale tokens

**Files:**
- Modify: `src/index.css:4-21` (`:root` block), then every `font-size` literal in the file

**Interfaces:**
- Produces: CSS custom properties `--fs-xs`, `--fs-sm`, `--fs-base`, `--fs-lg` on `:root`.

- [ ] **Step 1: Add the tokens to `:root`**

In `src/index.css`, inside the existing `:root` block, after the `--mono` line:

```css
  /* type scale — 12px is a hard floor; no literal below --fs-xs anywhere */
  --fs-xs: 12px;
  --fs-sm: 13px;
  --fs-base: 15px;
  --fs-lg: 17px;
```

- [ ] **Step 2: Replace every font-size literal**

Map each existing literal to a token. The current values and their replacements:

| Current | Token | Locations (line numbers are pre-edit) |
| --- | --- | --- |
| `9px` | `var(--fs-xs)` | `:60` build-tag, `:284` sliver-label |
| `10px` | `var(--fs-xs)` | `:145` panel-label, `:177`, `:229` view-toggle, `:299` vol-readout |
| `11px` | `var(--fs-sm)` | `:122` tw-status, `:128` tw-tab, `:138`, `:183`, `:210`, `:291` stack-hud, `:347`, `:350`, `:353`, `:363` |
| `12px` | `var(--fs-base)` | `:118` tw-title, `:334` boot |
| `13px` | `var(--fs-base)` | `:30` body |
| `14px` | `var(--fs-base)` | `:154` link-value |

Leave `:146` (`.panel-big`, already a `clamp()`) alone.

- [ ] **Step 3: Raise the chrome that now feels tight**

Type grew ~20%, so the fixed-height chrome must grow with it or text will clip:

```css
.tw-titlebar { height: 44px; }        /* was 38px in the mobile block at :363, ~40px base */
.tw-tab { padding: 9px 18px; }        /* was 7px 16px */
.view-toggle button { padding: 7px 14px; }  /* was 5px 12px */
```

- [ ] **Step 4: Verify no literal survives below the floor**

Run: `grep -nE 'font-size:\s*(9|10|11)px' src/index.css`
Expected: no output. If anything prints, replace it with a token.

- [ ] **Step 5: Verify zero-scroll still holds**

Run: `npm run e2e -- responsive.spec.ts`
Expected: PASS on all three projects. This suite already asserts no vertical overflow; it is the guard for this task.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "Raise the UI type scale to a 12px floor with shared tokens"
```

---

### Task 2: Install and wire the wordmark face

**Files:**
- Modify: `package.json`, `src/index.css:1-2` (imports), `:root`

**Interfaces:**
- Produces: CSS variable `--display` resolving to Archivo Black.

- [ ] **Step 1: Install the font package**

```bash
npm install @fontsource/archivo-black
```

- [ ] **Step 2: Import only the latin 400 subset**

At the top of `src/index.css`, after the Share Tech Mono import:

```css
@import '@fontsource/archivo-black/latin-400.css';
```

Importing the specific subset rather than the package root avoids pulling every unicode range.

- [ ] **Step 3: Add the token**

In `:root`, after `--mono`:

```css
  --display: 'Archivo Black', var(--mono);  /* wordmark + BUFFER FULL only — never interface text */
```

- [ ] **Step 4: Verify the font actually loads**

Run: `npm run build`
Expected: build succeeds and `dist/assets/` contains an `archivo-black-latin-400-normal-*.woff2`.

Run: `ls dist/assets/*.woff2`
Expected: at least one Archivo Black woff2 present.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/index.css
git commit -m "Add Archivo Black for display type only"
```

---

### Task 3: Overprint wordmark

**Files:**
- Modify: `src/App.tsx:41-60`, `src/index.css`, `src/components/TerminalWindow.tsx:35-41`

**Interfaces:**
- Consumes: `--display` from Task 2.
- Produces: `.wordmark` element inside `.stage`, rendered below the window layer.

- [ ] **Step 1: Remove the name from the title bar**

In `src/components/TerminalWindow.tsx`, replace the `<span className="tw-title">` line so the window no longer announces the site name (the wordmark now carries it) and the ALERT button is gone:

```tsx
      <header className="tw-titlebar">
        <span className="tw-title">FILE SYSTEM</span>
        <span className="tw-status"><span className="tw-dim">SESSION OPEN</span></span>
      </header>
```

Also remove `onBell` from the component's props type and its destructured parameter list.

- [ ] **Step 2: Render the wordmark**

In `src/App.tsx`, immediately after the `<BackgroundVideo ... />` line and before the glass strips:

```tsx
      <span className="wordmark" aria-hidden="true">SEVEREDARCHIVE</span>
```

Remove the `onBell={() => setNoticeOpen(true)}` prop from `<TerminalWindow>`.

- [ ] **Step 3: Style it**

Add to `src/index.css`:

```css
/* overprint wordmark — sits BELOW the window layer so every glass surface's
   backdrop-filter blurs and refracts it. That refraction is the whole point. */
.wordmark {
  position: absolute; z-index: 1;
  top: -0.14em; left: -0.04em;
  font-family: var(--display);
  font-size: clamp(96px, 13vw, 260px);
  line-height: 0.82;
  letter-spacing: -0.04em;
  color: rgba(201, 210, 216, 0.13);
  white-space: nowrap;
  pointer-events: none; user-select: none;
}
```

The negative offsets bleed it off the top and left edges — it is not meant to be fully readable.

- [ ] **Step 4: Confirm it renders behind the window, not in front**

Run: `npm run dev`, then in a headless screenshot:

```bash
npx playwright screenshot --viewport-size=1440,900 --wait-for-timeout=4000 \
  http://localhost:5173/severedarchive/ /tmp/wordmark.png
```

Read `/tmp/wordmark.png`. Expected: the wordmark is visible top-left, and the portion behind the terminal window is visibly blurred/refracted by the glass rather than sitting crisply on top of it. If it is crisp on top, `.wordmark`'s `z-index` is above `.terminal-window` (z-index 2) — lower it.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/TerminalWindow.tsx src/index.css
git commit -m "Pin the wordmark behind the window as overprint display type"
```

---

## Phase 2 — Content

### Task 4: Source six more placeholder clips

**Files:**
- Create: `raw/file07.mp4` … `raw/file12.mp4`
- Modify: `public/media/` (generated)

**Interfaces:**
- Produces: `fileNN_thumb.mp4`, `fileNN_full.mp4`, `fileNN_poster.jpg` for NN = 07..12.

- [ ] **Step 1: Download six clips in varied aspect ratios**

These are throwaway placeholders. The point of the selection is **aspect-ratio variety** — today every clip is roughly 16:9, so the window sizing has never been stress-tested. Source at minimum:

- two portrait (9:16)
- one square-ish (1:1)
- one 3:4
- two landscape (16:9)

Download from Pexels (free licence, no attribution required) into `raw/` as `file07.mp4` … `file12.mp4`.

- [ ] **Step 2: Process them**

```bash
./scripts/process-media.sh
```

- [ ] **Step 3: Verify the encodes exist and check the weight**

```bash
ls public/media/file{07,08,09,10,11,12}_{thumb,full,poster}.* && du -sh public/media
```

Expected: 18 new files. If `public/media` now exceeds ~30MB, re-encode the largest `_full` files at a lower bitrate — `file04_full.mp4` is already 4.5MB and is the outlier to imitate *away* from.

- [ ] **Step 4: Confirm the aspect variety actually landed**

```bash
for f in public/media/file{07,08,09,10,11,12}_full.mp4; do
  echo -n "$f: "; ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"
done
```

Expected: at least three distinct aspect ratios across the six.

- [ ] **Step 5: Commit**

```bash
git add raw public/media
git commit -m "Add six more placeholder clips in varied aspect ratios"
```

---

### Task 5: Extend the archive data to 12

**Files:**
- Modify: `src/data/archive.ts:11-18`

**Interfaces:**
- Produces: `ARCHIVE` with 12 entries. Type `ArchiveFile` is unchanged.

- [ ] **Step 1: Append six entries**

Match the existing voice — terse two-word uppercase names, lowercase taglines:

```ts
  { id: 'file07', index: '007', name: 'VELVET_ROT', ext: 'MP4', tagline: 'decay pass', duration: '00:13', year: '2025' },
  { id: 'file08', index: '008', name: 'NULL_CHOIR', ext: 'MP4', tagline: 'vertical study', duration: '00:07', year: '2025' },
  { id: 'file09', index: '009', name: 'SALT_INDEX', ext: 'MP4', tagline: 'crystalline loop', duration: '00:15', year: '2024' },
  { id: 'file10', index: '010', name: 'MERCY_LOOP', ext: 'MP4', tagline: 'square format test', duration: '00:09', year: '2024' },
  { id: 'file11', index: '011', name: 'ASH_MERIDIAN', ext: 'MP4', tagline: 'particle drift', duration: '00:11', year: '2024' },
  { id: 'file12', index: '012', name: 'GHOST_PROTOCOL', ext: 'MP4', tagline: 'final transmission', duration: '00:10', year: '2026' },
```

- [ ] **Step 2: Verify the app still builds and every file resolves**

Run: `npm run build && npm test`
Expected: build succeeds, existing vitest suite passes.

- [ ] **Step 3: Confirm no 404s at runtime**

```bash
npm run preview -- --port 4173 --strictPort &
sleep 3
npx playwright screenshot --viewport-size=1440,900 --wait-for-timeout=5000 \
  http://localhost:4173/severedarchive/ /tmp/twelve.png
```

Read `/tmp/twelve.png`. Expected: the archive renders with more files and no broken-poster gaps.

- [ ] **Step 4: Commit**

```bash
git add src/data/archive.ts
git commit -m "Double the archive to twelve files"
```

---

## Phase 3 — Window manager

### Task 6: Pure window-state module

**Files:**
- Create: `src/lib/windowManager.ts`
- Test: `src/lib/windowManager.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_WINDOWS = 3
  export type WinState = { id: string; x: number; y: number; z: number }
  export type OpenResult = { ok: true; windows: WinState[] } | { ok: false; reason: 'cap' }
  export function openWindow(windows: WinState[], id: string, pos: { x: number; y: number }): OpenResult
  export function focusWindow(windows: WinState[], id: string): WinState[]
  export function closeWindow(windows: WinState[], id: string): WinState[]
  export function cascadePosition(count: number, area: { w: number; h: number }, size: { w: number; h: number }): { x: number; y: number }
  ```
  `z` is a dense rank: the focused window always holds the highest `z`, and `z` values are always `0..n-1` with no gaps.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/windowManager.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { openWindow, focusWindow, closeWindow, cascadePosition, MAX_WINDOWS } from './windowManager'

const at = (x: number, y: number) => ({ x, y })

describe('openWindow', () => {
  it('opens onto an empty desktop with the top z', () => {
    const r = openWindow([], 'file01', at(0, 0))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.windows).toEqual([{ id: 'file01', x: 0, y: 0, z: 0 }])
  })

  it('gives each new window the top z', () => {
    const a = openWindow([], 'file01', at(0, 0))
    if (!a.ok) throw new Error('unreachable')
    const b = openWindow(a.windows, 'file02', at(28, 24))
    if (!b.ok) throw new Error('unreachable')
    expect(b.windows.find((w) => w.id === 'file02')!.z).toBe(1)
    expect(b.windows.find((w) => w.id === 'file01')!.z).toBe(0)
  })

  it('focuses instead of duplicating when the file is already open', () => {
    const a = openWindow([], 'file01', at(0, 0))
    if (!a.ok) throw new Error('unreachable')
    const b = openWindow(a.windows, 'file02', at(0, 0))
    if (!b.ok) throw new Error('unreachable')
    const again = openWindow(b.windows, 'file01', at(0, 0))
    if (!again.ok) throw new Error('unreachable')
    expect(again.windows).toHaveLength(2)
    expect(again.windows.find((w) => w.id === 'file01')!.z).toBe(1)
  })

  it('refuses the fourth window', () => {
    let ws: WinState[] = []
    for (const id of ['file01', 'file02', 'file03']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    expect(ws).toHaveLength(MAX_WINDOWS)
    const refused = openWindow(ws, 'file04', at(0, 0))
    expect(refused).toEqual({ ok: false, reason: 'cap' })
  })
})

describe('focusWindow', () => {
  it('raises the target to the top and keeps z dense', () => {
    let ws: WinState[] = []
    for (const id of ['a', 'b', 'c']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    const focused = focusWindow(ws, 'a')
    expect(focused.find((w) => w.id === 'a')!.z).toBe(2)
    expect([...focused.map((w) => w.z)].sort()).toEqual([0, 1, 2])
  })

  it('is a no-op for an unknown id', () => {
    const ws = [{ id: 'a', x: 0, y: 0, z: 0 }]
    expect(focusWindow(ws, 'nope')).toEqual(ws)
  })
})

describe('closeWindow', () => {
  it('removes the window and re-densifies z', () => {
    let ws: WinState[] = []
    for (const id of ['a', 'b', 'c']) {
      const r = openWindow(ws, id, at(0, 0))
      if (!r.ok) throw new Error('unreachable')
      ws = r.windows
    }
    const after = closeWindow(ws, 'b')
    expect(after).toHaveLength(2)
    expect([...after.map((w) => w.z)].sort()).toEqual([0, 1])
  })
})

describe('cascadePosition', () => {
  it('offsets each successive window down and right', () => {
    const area = { w: 1440, h: 900 }
    const size = { w: 640, h: 360 }
    const first = cascadePosition(0, area, size)
    const second = cascadePosition(1, area, size)
    expect(second.x).toBe(first.x + 28)
    expect(second.y).toBe(first.y + 24)
  })

  it('never positions a window outside the area', () => {
    const area = { w: 500, h: 400 }
    const size = { w: 480, h: 380 }
    for (let i = 0; i < 6; i++) {
      const p = cascadePosition(i, area, size)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + size.w).toBeLessThanOrEqual(area.w)
      expect(p.y + size.h).toBeLessThanOrEqual(area.h)
    }
  })
})
```

Add `import type { WinState } from './windowManager'` to the import line at the top.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/windowManager.test.ts`
Expected: FAIL — cannot resolve `./windowManager`.

- [ ] **Step 3: Implement**

Create `src/lib/windowManager.ts`:

```ts
export const MAX_WINDOWS = 3

export type WinState = { id: string; x: number; y: number; z: number }
export type OpenResult = { ok: true; windows: WinState[] } | { ok: false; reason: 'cap' }

/** Rewrite z so the list is a dense 0..n-1 rank preserving current order. */
const densify = (windows: WinState[]): WinState[] => {
  const order = [...windows].sort((a, b) => a.z - b.z)
  return windows.map((w) => ({ ...w, z: order.findIndex((o) => o.id === w.id) }))
}

export function openWindow(windows: WinState[], id: string, pos: { x: number; y: number }): OpenResult {
  if (windows.some((w) => w.id === id)) return { ok: true, windows: focusWindow(windows, id) }
  if (windows.length >= MAX_WINDOWS) return { ok: false, reason: 'cap' }
  return { ok: true, windows: [...windows, { id, x: pos.x, y: pos.y, z: windows.length }] }
}

export function focusWindow(windows: WinState[], id: string): WinState[] {
  if (!windows.some((w) => w.id === id)) return windows
  // push the target above everything, then re-rank so z stays dense
  return densify(windows.map((w) => (w.id === id ? { ...w, z: Infinity } : w)))
}

export function closeWindow(windows: WinState[], id: string): WinState[] {
  return densify(windows.filter((w) => w.id !== id))
}

const STEP_X = 28
const STEP_Y = 24

export function cascadePosition(
  count: number,
  area: { w: number; h: number },
  size: { w: number; h: number },
): { x: number; y: number } {
  const maxX = Math.max(0, area.w - size.w)
  const maxY = Math.max(0, area.h - size.h)
  // start a third of the way in so the first window doesn't hug the corner
  const baseX = Math.min(maxX, Math.round(maxX / 3))
  const baseY = Math.min(maxY, Math.round(maxY / 3))
  return {
    x: Math.max(0, Math.min(maxX, baseX + count * STEP_X)),
    y: Math.max(0, Math.min(maxY, baseY + count * STEP_Y)),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/windowManager.test.ts`
Expected: PASS, all cases.

Note: the `cascadePosition` "offsets each successive window" test passes only when the area is large enough that clamping does not kick in — 1440×900 with a 640×360 window leaves ample room, so this holds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/windowManager.ts src/lib/windowManager.test.ts
git commit -m "Add pure window-state module with z-order and cap rules"
```

---

### Task 7: Volume control

**Files:**
- Create: `src/components/VolumeControl.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export default function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void })`. `value` is 0–1.

- [ ] **Step 1: Write the component**

Create `src/components/VolumeControl.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

/** Collapsed: a VOL button whose three bars show the level. Click to expand a slider inline. */
export default function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  // collapse when focus or a click leaves the control
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const bars = value === 0 ? 0 : value < 0.34 ? 1 : value < 0.67 ? 2 : 3

  return (
    <span className="vol" ref={rootRef} data-open={open ? 'true' : 'false'}>
      <button className="vol-toggle" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={`Volume ${Math.round(value * 100)} percent`}>
        <span className="tw-dim">VOL</span>
        <span className="vol-bars" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} data-on={n <= bars ? 'true' : 'false'} />)}
        </span>
      </button>
      <span className="vol-expand">
        <input type="range" min={0} max={100} value={Math.round(value * 100)}
          aria-label="Volume" tabIndex={open ? 0 : -1}
          onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span className="vol-readout">{String(Math.round(value * 100)).padStart(3, '0')}</span>
      </span>
    </span>
  )
}
```

- [ ] **Step 2: Style the collapse/expand**

Add to `src/index.css`. The expansion animates `max-width` and `opacity` only — no layout thrash on the title bar:

```css
.vol { display: inline-flex; align-items: center; gap: 8px; }
.vol-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); }
.vol-toggle:hover .tw-dim, .vol[data-open='true'] .tw-dim { color: var(--acid); }
.vol-bars { display: inline-flex; gap: 2px; align-items: flex-end; }
.vol-bars i { width: 3px; background: var(--dim); display: block; }
.vol-bars i:nth-child(1) { height: 5px; }
.vol-bars i:nth-child(2) { height: 8px; }
.vol-bars i:nth-child(3) { height: 11px; }
.vol-bars i[data-on='true'] { background: var(--acid); }

.vol-expand {
  display: inline-flex; align-items: center; gap: 8px;
  max-width: 0; opacity: 0; overflow: hidden;
  transition: max-width 220ms ease, opacity 160ms ease;
}
.vol[data-open='true'] .vol-expand { max-width: 180px; opacity: 1; }
.vol-expand input[type='range'] { width: 120px; accent-color: var(--acid); }
.vol-readout { color: var(--text); font-size: var(--fs-xs); min-width: 3ch; }

@media (prefers-reduced-motion: reduce) {
  .vol-expand { transition: none; }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: PASS. (The component is not mounted anywhere yet — Task 8 consumes it.)

- [ ] **Step 4: Commit**

```bash
git add src/components/VolumeControl.tsx src/index.css
git commit -m "Add expanding volume control for window title bars"
```

---

### Task 8: FileWindow chrome

**Files:**
- Create: `src/components/FileWindow.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `VolumeControl` (Task 7), `ARCHIVE` / `fullSrc` / `thumbSrc` / `posterSrc` from `src/data/archive.ts`.
- Produces:
  ```ts
  export default function FileWindow(props: {
    file: ArchiveFile
    x: number; y: number; z: number
    focused: boolean
    onFocus: () => void
    onClose: () => void
    registerEl: (el: HTMLDivElement | null) => void   // Desktop needs the node for createDraggable
    bodyRef: (el: HTMLDivElement | null) => void      // layoutSwap reparents the video into this
  }): JSX.Element
  ```

- [ ] **Step 1: Write the component**

Create `src/components/FileWindow.tsx`:

```tsx
import { useState } from 'react'
import type { ArchiveFile } from '../data/archive'
import VolumeControl from './VolumeControl'

export default function FileWindow({
  file, x, y, z, focused, onFocus, onClose, registerEl, bodyRef,
}: {
  file: ArchiveFile
  x: number; y: number; z: number
  focused: boolean
  onFocus: () => void
  onClose: () => void
  registerEl: (el: HTMLDivElement | null) => void
  bodyRef: (el: HTMLDivElement | null) => void
}) {
  const [volume, setVolume] = useState(0)

  return (
    <div
      className="file-window glass"
      data-file-window={file.id}
      data-focused={focused ? 'true' : 'false'}
      ref={registerEl}
      style={{ left: x, top: y, zIndex: 10 + z }}
      onPointerDown={onFocus}
    >
      <header className="fw-titlebar" data-drag-handle>
        <span className="fw-title">FILE_{file.index} <span className="tw-dim">·</span> {file.name}.{file.ext}</span>
        <span className="fw-controls">
          <VolumeControl
            value={volume}
            onChange={(v) => {
              setVolume(v)
              const vid = document.querySelector<HTMLVideoElement>(`[data-file-window='${file.id}'] video`)
              if (vid) { vid.volume = v; vid.muted = v === 0 }
            }}
          />
          <button className="fw-close" onClick={onClose} aria-label={`Close FILE_${file.index}`}>✕</button>
        </span>
      </header>
      <div className="fw-body" ref={bodyRef} />
    </div>
  )
}
```

The body is deliberately empty — Task 11's `layoutSwap` re-parents the real `<video>` element into it.

- [ ] **Step 2: Style the window**

Add to `src/index.css`:

```css
.file-window {
  position: absolute;
  display: flex; flex-direction: column;
  overflow: hidden;
  width: min(52vw, 720px);
  will-change: transform;   /* dragged via anime.js transforms */
}
.fw-titlebar {
  display: flex; justify-content: space-between; align-items: center;
  height: 40px; flex: 0 0 auto; padding: 0 12px;
  font-size: var(--fs-sm);
  border-bottom: 1px solid var(--hair);
  cursor: grab;
  position: relative; z-index: 2;   /* glass host child — see the sheen note above */
}
.fw-titlebar:active { cursor: grabbing; }
.fw-title { color: var(--dim); letter-spacing: 0.04em; }
.file-window[data-focused='true'] .fw-title { color: var(--bright); }
.file-window[data-focused='true'] { border-color: var(--hair-bright); }
.fw-controls { display: flex; align-items: center; gap: 14px; }
.fw-close { font-size: var(--fs-sm); color: var(--dim); padding: 0 2px; }
.fw-close:hover { color: var(--acid); }
.fw-body { flex: 1 1 auto; position: relative; z-index: 2; background: #000; min-height: 0; }
.fw-body video { width: 100%; height: 100%; object-fit: contain; }

[data-tier='lite'] .file-window { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--panel-solid); }
```

- [ ] **Step 3: Size the window to the video's intrinsic aspect ratio**

Spec §4: the window hugs the video's true frame, so a 9:16 clip gets a tall window rather than a letterboxed 16:9 one. Task 4 deliberately introduced portrait and square clips to exercise this.

Add aspect state to `FileWindow`, defaulting to 16:9 until the video reports its dimensions:

```tsx
  const [ar, setAr] = useState(16 / 9)

  // the video is re-parented in by layoutSwap, so listen on the body rather than a ref
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(`[data-file-window='${file.id}'] .fw-body`)
    const v = body?.querySelector('video')
    if (!v) return
    const read = () => { if (v.videoWidth && v.videoHeight) setAr(v.videoWidth / v.videoHeight) }
    read()
    v.addEventListener('loadedmetadata', read)
    return () => v.removeEventListener('loadedmetadata', read)
  }, [file.id])
```

Apply it to the root element's style, capped so a tall clip cannot exceed the viewport:

```tsx
      style={{
        left: x, top: y, zIndex: 10 + z,
        width: `min(52vw, 720px, ${Math.round(ar * 62)}vh)`,
        aspectRatio: `${ar}`,
      }}
```

The `${ar * 62}vh` term is what caps height: a 9:16 clip resolves to a narrow window ~35vh wide rather than a 52vw slab running off the bottom of the screen.

Remove the fixed `width` from `.file-window` in the CSS above, since width is now inline. Keep `.fw-titlebar`'s fixed 40px height — `aspect-ratio` applies to the whole window, and the title bar eating 40px of it is acceptable at these sizes.

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FileWindow.tsx src/index.css
git commit -m "Add file window chrome with title bar, volume, and aspect-hugging size"
```

---

### Task 9: Desktop shell — state, drag, cap refusal

**Files:**
- Create: `src/components/Desktop.tsx`
- Modify: `src/App.tsx`, `src/index.css`
- Test: `tests/e2e/desktop.spec.ts`

**Interfaces:**
- Consumes: `windowManager` (Task 6), `FileWindow` (Task 8).
- Produces: `Desktop` renders `children` (the terminal window) plus the window layer, and exposes open/close through React context:
  ```ts
  export const DesktopContext = createContext<{ open: (id: string) => void }>({ open: () => {} })
  ```

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/desktop.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const boot = async (page: import('@playwright/test').Page) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
}

test.describe('desktop windows', () => {
  test.skip(({ viewport }) => viewport!.width < 861, 'windows are desktop-only')

  test('clicking a file row opens a window; closing removes it', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)
    await win.getByRole('button', { name: /^Close FILE_/ }).click()
    await expect(win).toHaveCount(0)
  })

  test('Esc closes the focused window but never the explorer', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    await expect(page.locator('[data-file-window]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-file-window]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.terminal-window')).toBeVisible()
  })

  test('the fourth window is refused and nothing opens', async ({ page }) => {
    await boot(page)
    const rows = page.locator('[data-file-row]')
    for (let i = 0; i < 3; i++) {
      await rows.nth(i).click()
      await page.waitForTimeout(250)
    }
    await expect(page.locator('[data-file-window]')).toHaveCount(3)

    await rows.nth(3).click()
    await expect(page.locator('[data-refusal]')).toBeVisible()
    await expect(page.locator('[data-file-window]')).toHaveCount(3)
    await expect(page.locator('[data-refusal]')).toHaveCount(0, { timeout: 3000 })
  })

  test('a dragged window stays within the viewport', async ({ page, viewport }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)

    const bar = win.locator('[data-drag-handle]')
    const start = await bar.boundingBox()
    if (!start) throw new Error('no drag handle')
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    // yank hard past the top-left corner
    await page.mouse.move(-1200, -1200, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(900)   // let the release spring settle

    const box = await win.boundingBox()
    if (!box) throw new Error('window vanished')
    // containerPadding lets a window hang 24px off-screen, no further
    expect(box.x + box.width).toBeGreaterThan(-25)
    expect(box.y + box.height).toBeGreaterThan(-25)
    expect(box.x).toBeLessThan(viewport!.width + 25)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run e2e -- desktop.spec.ts --project=desktop`
Expected: FAIL — no `[data-file-row]` exists yet (the explorer arrives in Task 10).

This is expected and correct: the test is written first and goes green at the end of Task 11. Do not chase it until then.

- [ ] **Step 3: Implement the Desktop shell**

Create `src/components/Desktop.tsx`:

```tsx
import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { createScope, createDraggable, createSpring, animate } from 'animejs'
import { ARCHIVE } from '../data/archive'
import { openWindow, focusWindow, closeWindow, cascadePosition, type WinState } from '../lib/windowManager'
import { prefersReducedMotion } from '../lib/perfTier'
import FileWindow from './FileWindow'

export const DesktopContext = createContext<{ open: (id: string) => void }>({ open: () => {} })

export default function Desktop({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WinState[]>([])
  const [refusing, setRefusing] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const bodies = useRef(new Map<string, HTMLDivElement>())
  const scopes = useRef(new Map<string, { revert: () => void }>())

  const focusedId = useMemo(
    () => windows.reduce<WinState | null>((top, w) => (!top || w.z > top.z ? w : top), null)?.id ?? null,
    [windows],
  )

  const open = useCallback((id: string) => {
    setWindows((cur) => {
      const area = { w: window.innerWidth, h: window.innerHeight }
      const size = { w: Math.min(720, area.w * 0.52), h: Math.min(405, area.h * 0.52) }
      const result = openWindow(cur, id, cascadePosition(cur.length, area, size))
      if (!result.ok) {
        setRefusing(true)
        window.setTimeout(() => setRefusing(false), 450)
        return cur
      }
      return result.windows
    })
  }, [])

  const close = useCallback((id: string) => {
    scopes.current.get(id)?.revert()
    scopes.current.delete(id)
    nodes.current.delete(id)
    bodies.current.delete(id)
    setWindows((cur) => closeWindow(cur, id))
  }, [])

  // Drag wiring. createScope gives us the React-ref root, the desktop/mobile
  // split as a media query, and automatic teardown of the draggable.
  const attachDrag = useCallback((id: string, el: HTMLDivElement | null) => {
    if (!el) return
    if (scopes.current.has(id)) return
    nodes.current.set(id, el)
    const scope = createScope({ root: rootRef, mediaQueries: { desktop: '(min-width: 861px)' } })
      .add((self) => {
        if (!self.matches.desktop) return
        const reduce = prefersReducedMotion()
        const drag = createDraggable(el, {
          trigger: el.querySelector('[data-drag-handle]') as HTMLElement,
          container: rootRef.current as HTMLElement,
          containerPadding: -24,
          containerFriction: 0.82,
          // below containerFriction ⇒ the window overshoots and springs back
          releaseContainerFriction: reduce ? 1 : 0.55,
          releaseEase: reduce ? 'outQuad' : createSpring({ stiffness: 120, damping: 14 }),
          onGrab: () => setWindows((cur) => focusWindow(cur, id)),
        })
        return () => drag.revert()
      })
    scopes.current.set(id, scope)
  }, [])

  const refusalRef = useRef<HTMLDivElement | null>(null)
  const flash = useCallback((el: HTMLDivElement | null) => {
    refusalRef.current = el
    if (!el) return
    if (prefersReducedMotion()) {
      animate(el, { opacity: [0, 1, 0], duration: 450, ease: 'linear' })
      return
    }
    animate(el.querySelector('.refusal-flash')!, { opacity: [0, 0.85, 0], duration: 420, ease: 'outQuad' })
    animate(el.querySelector('.refusal-text')!, { opacity: [0, 1, 0], scale: [1.04, 1], duration: 450, ease: 'outQuad' })
  }, [])

  return (
    <DesktopContext.Provider value={{ open }}>
      <div className="desktop" ref={rootRef}>
        {children}
        {windows.map((w) => {
          const file = ARCHIVE.find((f) => f.id === w.id)
          if (!file) return null
          return (
            <FileWindow
              key={w.id}
              file={file}
              x={w.x} y={w.y} z={w.z}
              focused={focusedId === w.id}
              onFocus={() => setWindows((cur) => focusWindow(cur, w.id))}
              onClose={() => close(w.id)}
              registerEl={(el) => attachDrag(w.id, el)}
              bodyRef={(el) => { if (el) bodies.current.set(w.id, el); else bodies.current.delete(w.id) }}
            />
          )
        })}
        {refusing && (
          <div className="refusal" data-refusal ref={flash} aria-live="assertive">
            <div className="refusal-flash" />
            <div className="refusal-text">BUFFER FULL</div>
          </div>
        )}
      </div>
    </DesktopContext.Provider>
  )
}
```

- [ ] **Step 4: Style the desktop and refusal**

Add to `src/index.css`:

```css
.desktop { position: absolute; inset: 0; z-index: 2; }

/* cap refusal: white flash + overprint type, both opacity-driven */
.refusal { position: absolute; inset: 0; z-index: 50; pointer-events: none; display: grid; place-items: center; }
.refusal-flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
.refusal-text {
  position: relative; opacity: 0;
  font-family: var(--display);
  font-size: clamp(48px, 9vw, 160px);
  letter-spacing: -0.03em;
  color: var(--alert);
  mix-blend-mode: difference;
}
```

- [ ] **Step 5: Mount it in App**

In `src/App.tsx`, wrap the booted branch. Replace the `<>...</>` fragment contents so `TerminalWindow` renders inside `Desktop`, and delete the `HomeNotification` import, its `noticeOpen` state, and its render:

```tsx
        <Desktop>
          <TerminalWindow tab={tab} onTab={setTab} bodyRef={bodyRef}>
            {tab === 'archive' && <ArchivePanel tier={tier} onFrontChange={setBackdropId} />}
            {tab === 'about' && <AboutPanel />}
            {tab === 'links' && <LinksPanel />}
          </TerminalWindow>
        </Desktop>
```

Add `import Desktop from './components/Desktop'` at the top.

- [ ] **Step 6: Make the terminal window draggable too**

Spec §1: the explorer is a window like any other — draggable, but never closable, so the desktop cannot be emptied. Without this it reads as a fixed backdrop panel rather than part of the desktop.

`TerminalWindow` is positioned with `inset: var(--frame)` today, which fights a transform-based drag. Change `.terminal-window` in `src/index.css` from `inset: var(--frame)` to explicit sizing so the draggable has a stable box:

```css
.terminal-window {
  position: absolute;
  top: var(--frame); left: var(--frame);
  width: calc(100% - var(--frame) * 2);
  height: calc(100% - var(--frame) * 2);
  z-index: 2;
  display: flex; flex-direction: column;
  overflow: hidden;
  opacity: 0;
  will-change: transform;
}
```

Add `data-drag-handle` to the `<header className="tw-titlebar">` element in `src/components/TerminalWindow.tsx`, then in `Desktop.tsx` attach a draggable to it on mount using the same helper as file windows:

```tsx
  const terminalRef = useCallback((el: HTMLDivElement | null) => {
    if (el) attachDrag('__terminal__', el)
  }, [attachDrag])
```

Pass `terminalRef` down so `TerminalWindow`'s root `<section>` receives it. Because `attachDrag` reads `[data-drag-handle]` from within the element, no other change is needed.

Note: the terminal window renders no close control, so it can never be removed — `closeWindow` is never called with `__terminal__`.

- [ ] **Step 7: Close the focused window with Esc**

Spec §1: `Esc` closes the focused file window and never the explorer. Add to `Desktop.tsx`:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !focusedId) return
      close(focusedId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusedId, close])
```

`focusedId` is derived from `windows`, which never contains `__terminal__`, so Esc cannot close the explorer.

- [ ] **Step 8: Verify the build and unit tests are green**

Run: `npm run build && npm test`
Expected: PASS. `boot.spec.ts` will now fail its notification assertions — that is expected; Task 15 removes them.

- [ ] **Step 9: Commit**

```bash
git add src/components/Desktop.tsx src/App.tsx src/index.css tests/e2e/desktop.spec.ts
git commit -m "Add desktop shell with window state, bounded dragging, and the buffer-full refusal"
```

---

---

# ⛔ TASKS 10–17 BELOW ARE SUPERSEDED — DO NOT IMPLEMENT THEM

**Superseded 2026-07-31 by `docs/superpowers/specs/2026-07-31-ownership-contract.md`.** Tasks 1–9 above are complete and accurate; everything from here down is retained only as history.

**Why:** a fresh-context preflight found that Tasks 10 and 11 as written **crash the page**. Task 10 renders the preview `<video>` with `key={file.id}`; Task 11 moves that node out with `appendChild`. React 19 calls `parentInstance.removeChild(child)` unguarded, so once a node is away in a window, hovering a different row makes React delete against the wrong parent — `NotFoundError` in the commit phase, root unmounts, page blanks. The trigger is a mouse move. Each task is locally correct; only their interaction is fatal.

Also invalidated below: `createLayout` (collides with React's inline styles — replaced by a single-element FLIP per owner ruling 8), `reparentKeepsPlaying()` (no longer needed — Chromium, WebKit and Firefox all verified to keep playing across a reparent), Task 14's lite-tier `<img>` (contradicts its own test, since 390px is lite tier), and `cascadePosition(cur.length, …)` (collides after a close).

**The remaining work is Slices A–F in the ownership contract, §5.** That document carries the acceptance criteria and the one proving test per slice. Read it instead.

---

## Phase 4 — Explorer *(superseded — history only)*

### Task 10: Two-column explorer

**Files:**
- Create: `src/components/ArchiveExplorer.tsx`
- Modify: `src/components/ArchivePanel.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `DesktopContext` (Task 9), `ARCHIVE` / `thumbSrc` / `posterSrc`.
- Produces: `export default function ArchiveExplorer({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void })`.
  Renders `[data-file-row]` per file and `[data-preview-pane]` holding the preview `<video>` marked `[data-preview-video]`.

- [ ] **Step 1: Write the component**

Create `src/components/ArchiveExplorer.tsx`:

```tsx
import { useContext, useEffect, useState } from 'react'
import { ARCHIVE, DEFAULT_FRONT_ID, thumbSrc, posterSrc } from '../data/archive'
import type { PerfTier } from '../lib/perfTier'
import { DesktopContext } from './Desktop'

export default function ArchiveExplorer({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  const [selected, setSelected] = useState(DEFAULT_FRONT_ID)
  const { open } = useContext(DesktopContext)
  const file = ARCHIVE.find((f) => f.id === selected) ?? ARCHIVE[0]

  useEffect(() => { onFrontChange(selected) }, [selected, onFrontChange])

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowDown' ? 1 : ARCHIVE.length - 1)) % ARCHIVE.length
    setSelected(ARCHIVE[next].id)
    document.querySelectorAll<HTMLButtonElement>('[data-file-row]')[next]?.focus()
  }

  return (
    <div className="explorer">
      <ul className="explorer-list">
        {ARCHIVE.map((f, i) => (
          <li key={f.id}>
            <button
              data-file-row data-file-id={f.id}
              className={f.id === selected ? 'file-row is-selected' : 'file-row'}
              onMouseEnter={() => setSelected(f.id)}
              onFocus={() => setSelected(f.id)}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => open(f.id)}
            >
              <span className="row-index">{f.index}</span>
              <span className="row-name">{f.name}.{f.ext}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="explorer-preview" data-preview-pane>
        <div className="preview-frame">
          {tier === 'lite' ? (
            <img src={posterSrc(file.id)} alt="" />
          ) : (
            <video data-preview-video key={file.id} src={thumbSrc(file.id)}
              poster={posterSrc(file.id)} muted loop playsInline autoPlay />
          )}
        </div>
        <dl className="preview-meta">
          <div><dt>FILE</dt><dd>{file.index}</dd></div>
          <div><dt>NAME</dt><dd>{file.name}.{file.ext}</dd></div>
          <div><dt>NOTE</dt><dd>{file.tagline.toUpperCase()}</dd></div>
          <div><dt>LEN</dt><dd>{file.duration}</dd></div>
          <div><dt>YEAR</dt><dd>{file.year}</dd></div>
        </dl>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Style it**

Add to `src/index.css`:

```css
.explorer { display: grid; grid-template-columns: minmax(220px, 34%) 1fr; gap: 18px; height: 100%; min-height: 0; }
.explorer-list { list-style: none; display: flex; flex-direction: column; gap: 1px; min-height: 0; }
.file-row {
  display: flex; align-items: baseline; gap: 12px; width: 100%;
  padding: 6px 10px; font-size: var(--fs-base); text-align: left;
  color: var(--text); border-left: 2px solid transparent;
}
.file-row:hover, .file-row.is-selected { color: var(--bright); border-left-color: var(--acid); background: rgba(182, 255, 46, 0.05); }
.row-index { color: var(--dim); font-size: var(--fs-sm); }
.file-row.is-selected .row-index { color: var(--acid); }

.explorer-preview { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.preview-frame { flex: 1 1 auto; min-height: 0; background: #000; border: 1px solid var(--hair); }
.preview-frame video, .preview-frame img { width: 100%; height: 100%; object-fit: contain; }
.preview-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 4px 16px; flex: 0 0 auto; }
.preview-meta dt { color: var(--dim); font-size: var(--fs-xs); letter-spacing: 0.08em; }
.preview-meta dd { color: var(--text); font-size: var(--fs-sm); }
```

- [ ] **Step 3: Swap it into the panel**

In `src/components/ArchivePanel.tsx`, replace the `ArchiveStack` import and usage with `ArchiveExplorer`, and change the toggle's stored/compared value from `'stack'` to `'list'`. Migrate the persisted preference so existing visitors are not stranded:

```tsx
const readView = () => {
  const stored = localStorage.getItem('severedarchive.archiveView')
  return stored === 'grid' ? 'grid' : 'list'   // legacy 'stack' falls through to 'list'
}
```

Update the toggle button labels from `STACK` / `GRID` to `LIST` / `GRID`.

- [ ] **Step 4: Verify the explorer renders and rows are clickable**

Run: `npm run e2e -- desktop.spec.ts --project=desktop`
Expected: the first test ("clicking a file row opens a window") now PASSES. The cap and drag tests should also pass. If the drag test fails on bounds, check that `container` resolved to a real element — `rootRef.current` must be non-null when the scope's constructor runs.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArchiveExplorer.tsx src/components/ArchivePanel.tsx src/index.css
git commit -m "Replace the archive stack with a two-column file explorer"
```

---

### Task 11: Swap-parent open animation

**Files:**
- Create: `src/lib/layoutSwap.ts`
- Modify: `src/components/Desktop.tsx`

**Interfaces:**
- Consumes: `createLayout` from animejs.
- Produces: `export function swapInto(root: HTMLElement, el: HTMLElement, target: HTMLElement, opts?: { reduced?: boolean }): void`

- [ ] **Step 1: Write the helper**

Create `src/lib/layoutSwap.ts`:

```ts
import { createLayout } from 'animejs'

/**
 * Move `el` into `target`, FLIP-animating the transition so the element appears
 * to be pulled from its old parent into the new one.
 *
 * Verified by spike: re-parenting a PLAYING <video> inside the same document
 * does not pause it in Chromium (paused stayed false, currentTime advanced,
 * readyState held at 4). Safari/Firefox are unverified — see reparentSafe below.
 */
export function swapInto(
  root: HTMLElement,
  el: HTMLElement,
  target: HTMLElement,
  opts: { reduced?: boolean } = {},
): void {
  if (opts.reduced) { target.appendChild(el); return }
  const layout = createLayout(root)
  layout.update(() => { target.appendChild(el) }, {
    duration: 520,
    ease: 'outExpo',
    enterFrom: { opacity: 0 },
  })
}

/** True when the browser keeps a <video> playing across a same-document re-parent. */
export function reparentKeepsPlaying(): boolean {
  // Chromium is verified; Safari's media element teardown on removal is the risk.
  return !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}
```

- [ ] **Step 2: Call it when a window opens**

In `src/components/Desktop.tsx`, add a layout effect that fires after a new window mounts. Add these imports:

```ts
import { useLayoutEffect } from 'react'
import { swapInto, reparentKeepsPlaying } from '../lib/layoutSwap'
```

Then inside the component:

```tsx
  // After a window mounts, pull the explorer's preview video into its body.
  const lastOpened = useRef<string | null>(null)
  useLayoutEffect(() => {
    const top = focusedId
    if (!top || lastOpened.current === top) return
    lastOpened.current = top
    const body = bodies.current.get(top)
    const preview = document.querySelector<HTMLVideoElement>('[data-preview-video]')
    if (!body || !rootRef.current) return
    if (body.querySelector('video')) return   // this window already holds its video

    if (preview && reparentKeepsPlaying()) {
      swapInto(rootRef.current, preview, body, { reduced: prefersReducedMotion() })
    } else {
      // Safari fallback: build a fresh video in place rather than moving one.
      const v = document.createElement('video')
      v.muted = true
      v.loop = true
      v.playsInline = true
      v.poster = posterSrc(top)
      body.appendChild(v)
    }
  }, [focusedId])
```

- [ ] **Step 3: Give the window its own source once the swap lands**

The re-parented element carries the *thumb* source. Immediately after the swap, promote the focused window to full res:

```tsx
    const vid = body.querySelector('video')
    if (vid) {
      vid.src = fullSrc(top)
      vid.muted = true
      vid.loop = true
      vid.play().catch(() => {})
    }
```

Add `fullSrc` to the `../data/archive` import.

- [ ] **Step 4: Confirm the preview pane does not collapse**

The spec calls this out as a hard constraint: if the pane collapses when its video leaves, `createLayout` measures against a broken layout. Add to `src/index.css`:

```css
/* the pane keeps its box while its video is away in a window */
.preview-frame { min-height: 180px; }
```

- [ ] **Step 5: Verify visually**

```bash
npm run preview -- --port 4173 --strictPort &
sleep 4
```

Then drive it headlessly: open the site, click the first file row, screenshot at 200ms and 700ms after the click. Read both. Expected: at 200ms the video is visibly in flight between the preview pane and the window; at 700ms it is settled inside the window body and still playing.

- [ ] **Step 6: Run the full desktop suite**

Run: `npm run e2e -- desktop.spec.ts --project=desktop`
Expected: all three tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/layoutSwap.ts src/components/Desktop.tsx src/index.css
git commit -m "Pull the preview video into its window with a FLIP reparent"
```

---

### Task 12: Playback tiers and degradation overlay

**Files:**
- Modify: `src/lib/videoDirector.ts`, `src/components/FileWindow.tsx`, `src/index.css`
- Test: `src/lib/videoDirector.test.ts`

**Interfaces:**
- Produces: `VideoDirector` gains `setBackground(ids: string[])` — background videos play muted at thumb res; the single focused id plays full res.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/videoDirector.test.ts`:

```ts
it('keeps background videos playing while exactly one holds focus', () => {
  const d = new VideoDirector(1)
  const mk = () => { let paused = true; return { play: () => { paused = false }, pause: () => { paused = true }, get paused() { return paused } } }
  const a = mk(), b = mk(), c = mk()
  d.register('a', a); d.register('b', b); d.register('c', c)
  d.setFocus('a')
  d.setBackground(['b', 'c'])
  expect(a.paused).toBe(false)
  expect(b.paused).toBe(false)
  expect(c.paused).toBe(false)
})

it('pauses anything that is neither focused nor background', () => {
  const d = new VideoDirector(1)
  const mk = () => { let paused = true; return { play: () => { paused = false }, pause: () => { paused = true }, get paused() { return paused } } }
  const a = mk(), b = mk()
  d.register('a', a); d.register('b', b)
  d.setFocus('a'); d.setBackground(['b'])
  d.setBackground([])
  expect(b.paused).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/videoDirector.test.ts`
Expected: FAIL — `d.setBackground is not a function`.

- [ ] **Step 3: Implement `setBackground`**

Read `src/lib/videoDirector.ts` first — it is 57 lines and the existing reconcile step must be extended, not replaced. Add the field and method:

```ts
  private background = new Set<string>()

  setBackground(ids: string[]) {
    this.background = new Set(ids)
    this.apply()
  }
```

Then change the predicate inside the existing reconcile/apply step so an element plays when it is the focus **or** a member of `background`:

```ts
  private apply() {
    for (const [id, el] of this.elements) {
      const shouldPlay = id === this.focusId || this.background.has(id)
      if (shouldPlay && el.paused) el.play()
      if (!shouldPlay && !el.paused) el.pause()
    }
  }
```

Field and method names (`elements`, `focusId`, `apply`) must match whatever the existing file actually uses — rename these to fit rather than introducing parallel state. The existing `loadeddata` resync pattern and the constructor's playback cap stay exactly as they are.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/videoDirector.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Add the degradation overlay**

Unfocused windows show the 240p thumb under a deliberate treatment so the softness reads as an intentional low-power mode. Add to `src/index.css`:

```css
/* unfocused windows run the 240p encode — dress it as a deliberate degraded
   preview rather than letting it look like a broken encode */
.fw-body::after {
  content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;
  opacity: 1; transition: opacity 200ms ease;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 2px);
}
.file-window[data-focused='true'] .fw-body::after { opacity: 0; }
.fw-body video { transition: filter 200ms ease; }
.file-window:not([data-focused='true']) .fw-body video {
  filter: saturate(0.72) contrast(1.12) brightness(0.92);
  image-rendering: pixelated;
}

@media (prefers-reduced-motion: reduce) {
  .fw-body::after, .fw-body video { transition: none; }
}
```

`image-rendering: pixelated` makes the upscaled 240p read as intentional rather than blurry — the picture visibly resolves when the window takes focus.

- [ ] **Step 6: Swap sources on focus change**

In `src/components/FileWindow.tsx`, add an effect that points the window's `<video>` at `fullSrc(file.id)` when `focused` is true and `thumbSrc(file.id)` when it is not, preserving `currentTime` across the swap:

```tsx
  useEffect(() => {
    const v = document.querySelector<HTMLVideoElement>(`[data-file-window='${file.id}'] video`)
    if (!v) return
    const want = focused ? fullSrc(file.id) : thumbSrc(file.id)
    if (v.src.endsWith(want.split('/').pop()!)) return
    const t = v.currentTime
    v.src = want
    v.addEventListener('loadeddata', () => { v.currentTime = t; v.play().catch(() => {}) }, { once: true })
  }, [focused, file.id])
```

Add `useEffect`, `fullSrc` and `thumbSrc` to the imports.

- [ ] **Step 7: Verify the decode ceiling**

Add to `tests/e2e/desktop.spec.ts`:

```ts
test('three open windows stay within the decode ceiling', async ({ page }) => {
  await boot(page)
  const rows = page.locator('[data-file-row]')
  for (let i = 0; i < 3; i++) { await rows.nth(i).click(); await page.waitForTimeout(300) }
  await page.waitForTimeout(800)
  const playing = await page.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  )
  // 3 windows + explorer preview + backdrop
  expect(playing).toBeLessThanOrEqual(5)
})
```

Run: `npm run e2e -- desktop.spec.ts --project=desktop`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/videoDirector.ts src/lib/videoDirector.test.ts src/components/FileWindow.tsx src/index.css tests/e2e/desktop.spec.ts
git commit -m "Run unfocused windows at thumb res under a deliberate degraded treatment"
```

---

### Task 13: Grid as a larger explorer

**Files:**
- Modify: `src/components/ArchiveGrid.tsx`, `src/components/FileCard.tsx`, `src/components/ArchivePanel.tsx`, `src/index.css`
- Delete: `src/lib/flip.ts`

**Interfaces:**
- Consumes: `DesktopContext.open` (Task 9).
- Produces: `ArchiveGrid` gains `onOpen: (id: string) => void`; clicking a tile calls it and switches the panel to `list`.

- [ ] **Step 1: Strip the focus stage from FileCard**

In `src/components/FileCard.tsx`, remove the focus-stage branch, the `SND` toggle, and every FLIP-related prop. The card becomes a poster tile plus its `FILE_NNN` label and name — a button that calls `onOpen(file.id)`.

- [ ] **Step 2: Strip FLIP from the grid**

In `src/components/ArchiveGrid.tsx`, delete the `flip` import and every call site, delete the focused-card state and its `Esc` handler, and thread a new `onOpen` prop down to each `FileCard`.

- [ ] **Step 3: Delete the now-unused module**

```bash
git rm src/lib/flip.ts
```

- [ ] **Step 4: Wire grid clicks to open a window and return to list**

In `src/components/ArchivePanel.tsx`, pass a handler that does both:

```tsx
const openFromGrid = (id: string) => { setView('list'); open(id) }
```

`open` comes from `useContext(DesktopContext)`. Pass `openFromGrid` as `ArchiveGrid`'s `onOpen`.

- [ ] **Step 5: Enlarge the tiles**

Grid is "the same list at a larger scale", so raise the per-page counts and tile size. In `src/hooks/useCardsPerPage.ts`, raise the breakpoint counts so 12 files paginate sensibly (desktop 12, tablet 6, mobile 4), and update `src/hooks/useCardsPerPage.test.ts` to the new expected values.

- [ ] **Step 6: Update the grid e2e expectations**

`tests/e2e/archive.spec.ts` asserts the old per-page counts and a 6-file archive. Update `expectedPerPage` to the new values from Step 5 and the pager assertion to match 12 files.

- [ ] **Step 7: Run the suites**

Run: `npm test && npm run e2e -- archive.spec.ts desktop.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A src/components src/hooks tests/e2e/archive.spec.ts src/index.css
git commit -m "Make grid a larger explorer that opens windows instead of focusing in place"
```

---

## Phase 5 — Mobile and cleanup

### Task 14: Mobile single-row explorer

**Files:**
- Modify: `src/components/ArchiveExplorer.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `useSwipe` from `src/hooks/useSwipe.ts`.

- [ ] **Step 1: Add the breakpoint branch**

In `ArchiveExplorer`, detect the mobile case once on mount and branch the render. Add these imports: `useMemo` from react, `useSwipe` from `../hooks/useSwipe`, `fullSrc` from `../data/archive`.

```tsx
  const isMobile = useMemo(() => window.matchMedia('(max-width: 860px)').matches, [])

  const step = (delta: number) => {
    const i = ARCHIVE.findIndex((f) => f.id === selected)
    setSelected(ARCHIVE[((i + delta) % ARCHIVE.length + ARCHIVE.length) % ARCHIVE.length].id)
  }
  const swipe = useSwipe(() => step(1), () => step(-1))
```

Then, before the desktop `return`:

```tsx
  if (isMobile) {
    return (
      <div className="explorer is-mobile">
        <div className="primary-view" data-primary-view {...swipe}>
          {tier === 'lite'
            ? <img src={posterSrc(file.id)} alt="" />
            : <video key={file.id} src={fullSrc(file.id)} poster={posterSrc(file.id)}
                muted loop playsInline autoPlay />}
        </div>
        <ul className="explorer-list">
          {ARCHIVE.map((f) => (
            <li key={f.id}>
              <button data-file-row data-file-id={f.id}
                className={f.id === selected ? 'file-row is-selected' : 'file-row'}
                onClick={() => setSelected(f.id)}>
                <img src={posterSrc(f.id)} alt="" />
                <span className="row-index">{f.index}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }
```

Row taps call `setSelected`, never `open` — no window is ever created on mobile, which is what the Step 3 test asserts.

- [ ] **Step 2: Style the mobile layout**

```css
@media (max-width: 860px) {
  .explorer { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .explorer-list {
    flex-direction: row; overflow-x: auto; gap: 8px;
    scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
  }
  .explorer-list li { scroll-snap-align: start; flex: 0 0 auto; }
  .file-row { flex-direction: column; width: 104px; border-left: 0; border-bottom: 2px solid transparent; }
  .file-row.is-selected { border-bottom-color: var(--acid); }
  .file-row img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .primary-view { flex: 1 1 auto; min-height: 0; background: #000; }
  .primary-view video, .primary-view img { width: 100%; height: 100%; object-fit: contain; }
  .explorer-preview { display: none; }
}
```

Horizontal overflow inside the row is the intended gesture, not a violation of the zero-scroll rule — the page itself still never scrolls.

- [ ] **Step 3: Verify no windows open on mobile**

Add to `tests/e2e/desktop.spec.ts`:

```ts
test('tapping a file on mobile plays in place and opens no window', async ({ page, viewport }) => {
  test.skip(viewport!.width >= 861, 'mobile-only behaviour')
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.locator('[data-file-row]').nth(1).click()
  await expect(page.locator('[data-file-window]')).toHaveCount(0)
  await expect(page.locator('[data-primary-view] video')).toBeVisible()
})
```

Run: `npm run e2e -- desktop.spec.ts --project=mobile`
Expected: PASS.

- [ ] **Step 4: Verify zero-scroll at every breakpoint with 12 files**

Run: `npm run e2e -- responsive.spec.ts`
Expected: PASS on desktop, tablet and mobile.

**If the tablet (768px) project fails on vertical overflow**, apply the spec's sanctioned exception rather than shrinking type back below the floor:

```css
@media (min-width: 861px) {
  .explorer-list { overflow-y: auto; scrollbar-width: thin; }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ArchiveExplorer.tsx src/index.css tests/e2e/desktop.spec.ts
git commit -m "Collapse the explorer to a swipeable row with in-place playback on mobile"
```

---

### Task 15: Delete the stack and the notification

**Files:**
- Delete: `src/components/ArchiveStack.tsx`, `src/components/HomeNotification.tsx`, `src/lib/stackLayout.ts`, `src/lib/stackLayout.test.ts`, `tests/e2e/stack.spec.ts`
- Modify: `src/index.css`, `tests/e2e/boot.spec.ts`

- [ ] **Step 1: Remove the files**

```bash
git rm src/components/ArchiveStack.tsx src/components/HomeNotification.tsx \
       src/lib/stackLayout.ts src/lib/stackLayout.test.ts tests/e2e/stack.spec.ts
```

- [ ] **Step 2: Remove the dead CSS**

Delete every `.stack-*`, `.sliver-*`, `.notification*` and `.vol-control` rule from `src/index.css`. `.vol-control` is superseded by `.vol` from Task 7.

- [ ] **Step 3: Fix the boot test**

`tests/e2e/boot.spec.ts` asserts the notification appears, dismisses, and re-summons via the bell. All three behaviours are gone. Replace the whole file with a boot assertion only:

```ts
import { test, expect } from '@playwright/test'

test('boot runs and hands off to the desktop', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await expect(page.locator('.desktop')).toBeVisible()
  await expect(page.locator('[data-notification]')).toHaveCount(0)
})
```

- [ ] **Step 4: Confirm nothing still references the deleted modules**

Run: `grep -rn "ArchiveStack\|HomeNotification\|stackLayout\|lib/flip" src tests`
Expected: no output.

- [ ] **Step 5: Run everything**

Run: `npm run build && npm test && npm run lint && npm run e2e`
Expected: PASS across all three Playwright projects.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Delete the archive stack, the notification, and their dead styles"
```

---

### Task 16: Update project documentation

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Rewrite the changed sections**

`CONTEXT.md` is the session resume point and is now wrong in several places. Update:

- **Current UX** — replace the stack description with the desktop/explorer/window model, the 3-window cap and its refusal, and the mobile row.
- **Architecture map** — add `Desktop`, `FileWindow`, `VolumeControl`, `ArchiveExplorer`, `windowManager`, `layoutSwap`; remove `ArchiveStack`, `HomeNotification`, `stackLayout`, `flip`.
- **Design rules** — record the two amendments explicitly, since they contradict what is written there today:
  - Share Tech Mono remains the only interface face, but Archivo Black is now permitted for the overprint wordmark and the `BUFFER FULL` refusal.
  - Zero-scroll still holds for the page; the explorer list may carry an internal scroll region if 12 rows cannot fit at 768px.
  - Add the 12px type floor.
- **Open items** — note that Safari/Firefox re-parent behaviour is unverified (only Chromium was spiked) and that all 12 clips remain placeholders.

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -m "Update CONTEXT.md for the desktop window model"
```

---

### Task 17: Deploy and verify

- [ ] **Step 1: Confirm the tree is clean and green**

Run: `git status --short && npm run build && npm test && npm run e2e`
Expected: clean tree, all green.

- [ ] **Step 2: Deploy**

Push does NOT trigger Actions on this repo (verified suppressed platform-side). Trigger it explicitly:

```bash
git push origin main
gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive
```

- [ ] **Step 3: Verify the live build is the one just built**

```bash
git log --oneline -1
```

Then load https://decoy-dev.github.io/severedarchive/ and compare the bottom-right build stamp (`BLD <sha> · <utc>`) against that SHA. If they differ, the page is cached or the workflow has not finished — wait and re-check rather than assuming success.

---

## Assumptions Recorded

These were decided without a blocking question, per the working agreement. Reverse any of them freely.

1. **Phased in one document** rather than split into three plan files. Each phase ends deployable, so the site is never broken across a long stretch.
2. **Archivo Black via `@fontsource`**, not a `pyftsubset` pass to 13 glyphs. The spec's ~3–4KB target assumed subsetting; the fontsource latin subset is closer to ~15–20KB. That removes a Python/fonttools dependency from the critical path for ~15KB. Worth revisiting only if payload becomes a real concern.
3. **The mobile breakpoint is 861px**, chosen so the tablet Playwright project (768px) exercises the mobile path. The existing code uses 640/480 for other purposes; those are untouched.
4. **The refusal keeps `--alert` alive.** The notification that owned `#ff3524` is deleted, but `BUFFER FULL` reuses the colour rather than orphaning the token.
5. **Safari's re-parent behaviour is guarded, not verified.** `reparentKeepsPlaying()` falls back to building a fresh video in place. Installing the WebKit Playwright browser (~100MB) would let Task 11 verify it properly; that download was not taken unilaterally.
