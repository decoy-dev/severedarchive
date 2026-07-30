# Archive Stack + Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ARCHIVE tab's default view with a video stack (front card playing, slivers fanning on the right, backdrop following the front video) behind a STACK/GRID toggle, and upgrade all panel surfaces to a liquid-glass treatment.

**Architecture:** New `ArchivePanel` (toggle owner) mounts new `ArchiveStack` or the untouched `ArchiveGrid`. Stack positions come from a pure `stackLayout` helper; reorder animates transform/opacity only via anime.js v4. App owns a `backdropId` state fed by the stack; `BackgroundVideo` crossfades thumb encodes. Glass is a CSS token + utility-class system; one Chromium-gated SVG displacement filter on the front card.

**Tech Stack:** Existing Vite/React/TS + animejs v4 + vitest + Playwright. One new devDependency: `pngjs` (displacement-map generation script).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-archive-stack-liquid-glass-design.md` — read it before starting.
- Zero scrolling anywhere, any viewport, any state. anime.js v4 modular API only. **Animate transform/opacity only** (fan reveal uses width *snap* + opacity fade — no width animation).
- Share Tech Mono single weight — never font-weight for emphasis. Accent `#b6ff2e` state-gated only; `#ff3524` notification-only.
- Glass tokens (spec-pinned, tune ±20% in the visual pass only): fill `rgba(10, 13, 16, 0.42)`, `backdrop-filter: blur(18px) saturate(1.6) brightness(1.08)`; rim light 1px top/left `rgba(255,255,255,.28)`-range; specular sheen 4–6% opacity top-third. Lite tier (`[data-tier='lite']`): opaque panels, NO backdrop-filter anywhere — existing fallback stays intact.
- Stack playback: front card full-res via existing `VideoDirector.setFocus` contract; slivers are poster `<img>`s, never videos; ≤2 playing videos steady-state (3 transient during backdrop crossfade).
- `ArchiveGrid.tsx`, `FileCard.tsx`, `videoDirector.ts`, `flip.ts` are UNCHANGED by this plan, except the className-only edits Task 2 specifies (adding `glass` to existing elements). No structural or logic changes to those files.
- Playwright ALWAYS headless; never browser MCP tools.
- Git commits: repository identity as-is; NEVER any Co-Authored-By / "Generated with Claude Code" / Claude/AI attribution in commits, code, or comments.
- Existing suite (20 vitest + 45 e2e) must stay green through every task; grid specs migrate via the `gotoGrid` helper in Task 3, not by weakening assertions.
- Deploy is manual: `gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive` (push trigger is suppressed platform-side).

---

### Task 1: Stack logic core — `stackLayout` + `useSwipe` (TDD)

**Files:**
- Create: `src/lib/stackLayout.ts`, `src/hooks/useSwipe.ts`
- Test: `src/lib/stackLayout.test.ts`, `src/hooks/useSwipe.test.ts`

**Interfaces:**
- Produces:
  - `stackLayout(count: number, frontIndex: number, sliverW: number): StackPos[]` with `type StackPos = { depth: number; sliverX: number; scale: number; z: number }` — array indexed by archive position; `depth` 0 = front; `sliverX` = x-offset of a sliver within the sliver zone; `z` for z-index.
  - `useSwipe(onLeft: () => void, onRight: () => void, threshold?: number): { onPointerDown; onPointerUp }` — pointer-event props, ignores mouse pointers.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/stackLayout.test.ts
import { describe, it, expect } from 'vitest'
import { stackLayout } from './stackLayout'

describe('stackLayout', () => {
  it('front card sits at depth 0, full scale, top z', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[0]).toEqual({ depth: 0, sliverX: 0, scale: 1, z: 6 })
  })
  it('depth wraps around the sequence', () => {
    const pos = stackLayout(6, 4, 24)
    expect(pos[4].depth).toBe(0)
    expect(pos[5].depth).toBe(1)
    expect(pos[0].depth).toBe(2)
    expect(pos[3].depth).toBe(5)
  })
  it('slivers pack left-to-right by depth at sliverW spacing', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[1].sliverX).toBe(0)
    expect(pos[2].sliverX).toBe(24)
    expect(pos[5].sliverX).toBe(96)
  })
  it('fanned spacing widens with sliverW', () => {
    const pos = stackLayout(6, 0, 72)
    expect(pos[3].sliverX).toBe(144)
  })
  it('scale decays with depth but never below 0.9', () => {
    const pos = stackLayout(6, 0, 24)
    expect(pos[1].scale).toBeCloseTo(0.98)
    expect(pos[5].scale).toBeGreaterThanOrEqual(0.9)
  })
  it('z-index strictly decreases with depth', () => {
    const pos = stackLayout(6, 2, 24)
    const byDepth = [...pos].sort((a, b) => a.depth - b.depth)
    for (let i = 1; i < byDepth.length; i++) expect(byDepth[i].z).toBeLessThan(byDepth[i - 1].z)
  })
})
```

```ts
// src/hooks/useSwipe.test.ts
import { describe, it, expect, vi } from 'vitest'
import { useSwipe } from './useSwipe'
import { renderHook } from '@testing-library/react'

const ev = (type: 'touch' | 'mouse', x: number, y: number) =>
  ({ pointerType: type, clientX: x, clientY: y }) as unknown as React.PointerEvent

describe('useSwipe', () => {
  it('fires onLeft for a leftward swipe past threshold', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 200, 100))
    result.current.onPointerUp(ev('touch', 100, 110))
    expect(left).toHaveBeenCalledOnce()
    expect(right).not.toHaveBeenCalled()
  })
  it('fires onRight for a rightward swipe', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 220, 100))
    expect(right).toHaveBeenCalledOnce()
  })
  it('ignores sub-threshold moves, vertical drags, and mouse pointers', () => {
    const left = vi.fn(), right = vi.fn()
    const { result } = renderHook(() => useSwipe(left, right, 48))
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 130, 100))            // below threshold
    result.current.onPointerDown(ev('touch', 100, 100))
    result.current.onPointerUp(ev('touch', 40, 300))             // vertical dominates
    result.current.onPointerDown(ev('mouse', 200, 100))
    result.current.onPointerUp(ev('mouse', 100, 100))            // mouse ignored
    expect(left).not.toHaveBeenCalled()
    expect(right).not.toHaveBeenCalled()
  })
})
```

`renderHook` needs `@testing-library/react`: `npm i -D @testing-library/react jsdom` and add `test: { environment: 'jsdom' }`… **no** — keep the existing node environment project-wide; instead add a per-file docblock at the top of `useSwipe.test.ts`: `// @vitest-environment jsdom`.

- [ ] **Step 2: Run tests, verify they fail** — `npm test` → FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/stackLayout.ts
export type StackPos = { depth: number; sliverX: number; scale: number; z: number }

export function stackLayout(count: number, frontIndex: number, sliverW: number): StackPos[] {
  const out: StackPos[] = []
  for (let i = 0; i < count; i++) {
    const depth = (i - frontIndex + count) % count
    out.push({
      depth,
      sliverX: depth === 0 ? 0 : (depth - 1) * sliverW,
      scale: depth === 0 ? 1 : Math.max(0.9, 1 - 0.02 * depth),
      z: count - depth,
    })
  }
  return out
}
```

```ts
// src/hooks/useSwipe.ts
import { useRef } from 'react'
import type { PointerEvent } from 'react'

export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 48) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: PointerEvent) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? onLeft : onRight)()
    },
  }
}
```

- [ ] **Step 4: Run tests, verify pass** — `npm test` → all pass (existing 20 + 9 new). `npm run build` → clean.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add stack layout math and swipe hook"`

---

### Task 2: Base glass system

**Files:**
- Modify: `src/index.css` (tokens + `.glass` utility + surface application)
- Test: `tests/e2e/glass.spec.ts` (new)

**Interfaces:**
- Produces: CSS tokens `--glass-fill: rgba(10, 13, 16, 0.42)`, `--glass-blur: 18px`, `--glass-rim: rgba(255, 255, 255, 0.28)`, `--glass-rim-dark: rgba(0, 0, 0, 0.35)`; utility class `.glass` (fill + backdrop-filter + rim borders + sheen via `::before`); applied to `.terminal-window`, `.tw-tabs .tw-tab`, `.notification`, `.focus-hud` (grid) — Task 3 applies it to stack surfaces.

- [ ] **Step 1: Write the failing e2e**

```ts
// tests/e2e/glass.spec.ts
import { test, expect } from '@playwright/test'

test('terminal window is glass on full tier, opaque on lite', async ({ page, viewport }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const bf = await page.locator('.terminal-window').evaluate((el) => getComputedStyle(el).backdropFilter)
  if (viewport!.width < 480) {
    expect(bf).toBe('none') // lite tier: no backdrop-filter anywhere
  } else {
    expect(bf).toContain('blur(18px)')
    expect(bf).toContain('saturate(1.6)')
    const bg = await page.locator('.terminal-window').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toContain('0.42') // translucent fill, not the old 0.78 panel
  }
})
```

Run: `npm run e2e -- glass.spec.ts` → FAIL (backdropFilter none / old fill).

- [ ] **Step 2: Implement the glass system in `src/index.css`**

Add tokens to `:root`:

```css
--glass-fill: rgba(10, 13, 16, 0.42);
--glass-blur: 18px;
--glass-rim: rgba(255, 255, 255, 0.28);
--glass-rim-dark: rgba(0, 0, 0, 0.35);
```

Utility (place after the `.terminal-window` block):

```css
.glass {
  background: var(--glass-fill);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.6) brightness(1.08);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6) brightness(1.08);
  border: 1px solid var(--hair-bright);
  border-top-color: var(--glass-rim);
  border-left-color: var(--glass-rim);
  border-bottom-color: var(--glass-rim-dark);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  position: relative;
}
.glass::before {   /* specular sheen, top third */
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(115deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 28%, transparent 36%);
}
[data-tier='lite'] .glass {
  background: var(--panel-solid);
  backdrop-filter: none; -webkit-backdrop-filter: none;
  border-color: var(--hair-bright);
  box-shadow: none;
}
[data-tier='lite'] .glass::before { display: none; }
```

Apply: add `glass` class to the `.terminal-window` `<section>`, the `.notification` root, and `.focus-hud` in their components (3 one-word JSX edits — `TerminalWindow.tsx`, `HomeNotification.tsx`, `ArchiveGrid.tsx` — className additions only, no structural change; this is the single sanctioned touch of those files). Then REMOVE the now-redundant `background`/`border` declarations from `.terminal-window`, `.notification` (keep its layout/position rules), so the fill comes from `.glass` alone. Tab buttons: change `.tw-tab` background to `rgba(10, 13, 16, 0.35)` and active to keep the acid tint — tabs sit ON the window's glass, so they get translucency without their own backdrop-filter (stays within the ≤4 concurrent budget). Scanlines (`.terminal-window::after`) stay — verify its z-index (40) still layers above the sheen (z-index 1). The boot panel (`.boot`) stays opaque (it predates the window reveal — glass there reads as a flash).

- [ ] **Step 3: Full run + visual check**

`npm test && npm run e2e` → all green (glass.spec passes 3 projects; grid/focus/boot/window specs unaffected — if the notification's fill change breaks a strict-text assertion, fix the CSS, not the test). Then build+preview and take headless screenshots at 1440×900 / 768×1024 / 390×844; READ them: video should visibly glow through the window; text must stay legible (if not, nudge `--glass-fill` opacity up — max 0.5 per spec tuning rule). `shots/` is gitignored.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "Add liquid glass surface system with lite-tier fallback"`

---

### Task 3: ArchiveStack + ArchivePanel toggle (desktop core)

**Files:**
- Create: `src/components/ArchiveStack.tsx`, `src/components/ArchivePanel.tsx`
- Modify: `src/App.tsx` (ARCHIVE tab mounts ArchivePanel), `src/index.css` (stack styles)
- Test: `tests/e2e/stack.spec.ts` (new), `tests/e2e/helpers.ts` (new `gotoGrid`), modify `tests/e2e/archive.spec.ts` + `tests/e2e/focus.spec.ts` to enter grid view via helper

**Interfaces:**
- Consumes: `stackLayout` (Task 1), `.glass` (Task 2), `ARCHIVE/thumbSrc/fullSrc/posterSrc`, `VideoDirector`, `prefersReducedMotion`.
- Produces:
  - `<ArchivePanel tier onFrontChange={(id: string) => void} />` — owns `view: 'stack' | 'grid'` (localStorage key `severedarchive.archiveView`, default `'stack'`), renders toggle buttons `aria-label="Stack view"` / `aria-label="Grid view"` (labels `STACK` / `GRID`), mounts `<ArchiveStack>` or `<ArchiveGrid>`.
  - `<ArchiveStack tier onFrontChange />` — root `.archive-stack` with `data-front="<file id>"`; front card `[data-stack-front]` containing the playing `<video>`; slivers `button[data-sliver][data-file-id]` with poster `<img>` and rotated `FILE_00N` label; right-edge hover zone `.stack-fan-zone` toggling `data-fanned="true"` on the root; keyboard `n`/`p` cycle; HUD `.stack-hud.glass` with metadata + `aria-label="Toggle sound"` button (same contract as grid focus HUD).
  - `onFrontChange(id)` fires on mount with the initial front and on every front change — Task 4 consumes it for the backdrop.
  - e2e helper `gotoGrid(page)`: waits for boot, dismisses notification if present, clicks `aria-label="Grid view"`.

- [ ] **Step 1: Write the failing e2e (core stack behaviors)**

```ts
// tests/e2e/helpers.ts
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function ready(page: Page) {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const ack = page.getByRole('button', { name: 'Acknowledge' })
  if (await ack.count()) { await ack.click(); await expect(page.locator('[data-notification]')).toHaveCount(0) }
}

export async function gotoGrid(page: Page) {
  await ready(page)
  await page.getByRole('button', { name: 'Grid view' }).click()
}
```

```ts
// tests/e2e/stack.spec.ts
import { test, expect } from '@playwright/test'
import { ready } from './helpers'

test('stack is the default archive view; front video plays full-res', async ({ page }) => {
  await ready(page)
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file01')
  const v = page.locator('[data-stack-front] video')
  await expect(v).toHaveAttribute('src', /file01_full\.mp4/)
  await expect
    .poll(async () => v.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), { timeout: 5000 })
    .toBe(true)
})

test('right-edge hover fans the slivers; clicking one brings it to front', async ({ page, viewport }) => {
  test.skip(viewport!.width <= 640, 'hover fan is desktop/tablet')
  await ready(page)
  await page.locator('.stack-fan-zone').hover()
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-fanned', 'true')
  await page.locator('button[data-sliver][data-file-id="file03"]').click()
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file03')
  await expect(page.locator('[data-stack-front] video')).toHaveAttribute('src', /file03_full\.mp4/)
})

test('n/p keys cycle the sequence with wraparound', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('n')
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file02')
  await page.keyboard.press('p')
  await page.keyboard.press('p')
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file06')
})

test('toggle switches to grid and persists across reload', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Grid view' }).click()
  await expect(page.locator('[data-card]').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const ack = page.getByRole('button', { name: 'Acknowledge' })
  if (await ack.count()) await ack.click()
  await expect(page.locator('[data-card]').first()).toBeVisible()
  await expect(page.locator('.archive-stack')).toHaveCount(0)
})

test('no scroll in stack view, fanned or not', async ({ page }) => {
  await ready(page)
  await page.locator('.stack-fan-zone').hover().catch(() => {})
  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(scroll.doc).toBeLessThanOrEqual(1)
  expect(scroll.body).toBeLessThanOrEqual(1)
})
```

Run: `npm run e2e -- stack.spec.ts` → FAIL (no `.archive-stack`).

- [ ] **Step 2: Implement `ArchivePanel`**

```tsx
// src/components/ArchivePanel.tsx
import { useState } from 'react'
import ArchiveStack from './ArchiveStack'
import ArchiveGrid from './ArchiveGrid'
import type { PerfTier } from '../lib/perfTier'

const KEY = 'severedarchive.archiveView'
type View = 'stack' | 'grid'

function initialView(): View {
  try { return localStorage.getItem(KEY) === 'grid' ? 'grid' : 'stack' } catch { return 'stack' }
}

export default function ArchivePanel({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  const [view, setView] = useState<View>(initialView)
  const pick = (v: View) => { setView(v); try { localStorage.setItem(KEY, v) } catch { /* private mode */ } }
  return (
    <div className="panel archive-panel">
      <div className="view-toggle">
        <button aria-label="Stack view" className={view === 'stack' ? 'is-active' : ''} onClick={() => pick('stack')}>STACK</button>
        <button aria-label="Grid view" className={view === 'grid' ? 'is-active' : ''} onClick={() => pick('grid')}>GRID</button>
      </div>
      {view === 'stack' ? <ArchiveStack tier={tier} onFrontChange={onFrontChange} /> : <ArchiveGrid tier={tier} />}
    </div>
  )
}
```

Note: `ArchiveGrid`'s root already has class `panel` with `position:absolute; inset:0` — nested inside `.archive-panel` that resolves against the panel, which is correct; verify visually.

- [ ] **Step 3: Implement `ArchiveStack`**

```tsx
// src/components/ArchiveStack.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import { ARCHIVE, fullSrc, posterSrc } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { stackLayout } from '../lib/stackLayout'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'
import { useSwipe } from '../hooks/useSwipe'

const SLIVER = 24
const SLIVER_FANNED = 72

export default function ArchiveStack({ tier, onFrontChange }: { tier: PerfTier; onFrontChange: (id: string) => void }) {
  const [frontIndex, setFrontIndex] = useState(0)
  const [fanned, setFanned] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const director = useMemo(() => new VideoDirector(1), [])
  const front = ARCHIVE[frontIndex]
  const layout = stackLayout(ARCHIVE.length, frontIndex, fanned ? SLIVER_FANNED : SLIVER)

  const goTo = (i: number) => {
    setFrontIndex(((i % ARCHIVE.length) + ARCHIVE.length) % ARCHIVE.length)
    setMuted(true)
  }
  const next = () => goTo(frontIndex + 1)
  const prev = () => goTo(frontIndex - 1)
  const swipe = useSwipe(next, prev)

  useEffect(() => { onFrontChange(front.id) }, [front.id, onFrontChange])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const el = { play: () => { v.play().catch(() => {}) }, pause: () => v.pause(), get paused() { return v.paused } }
    director.register(front.id, el)
    director.setFocus(front.id)
    const resync = () => director.register(front.id, el)
    v.addEventListener('loadeddata', resync)
    return () => { v.removeEventListener('loadeddata', resync); director.unregister(front.id) }
  }, [director, front.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'n') next(); if (e.key === 'p') prev() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stageRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!stageRef.current || prefersReducedMotion()) return
    animate(stageRef.current, { opacity: [0, 1], scale: [0.985, 1], duration: 380, ease: 'outExpo' })
  }, [front.id])

  return (
    <div className="archive-stack" data-front={front.id} data-fanned={fanned ? 'true' : 'false'}>
      <div className="stack-stage glass" ref={stageRef} data-stack-front {...swipe}>
        <video ref={videoRef} src={fullSrc(front.id)} poster={posterSrc(front.id)} muted={muted} loop playsInline />
      </div>
      <div className="stack-slivers" onMouseEnter={() => setFanned(true)} onMouseLeave={() => setFanned(false)}>
        <div className="stack-fan-zone" aria-hidden="true" />
        {ARCHIVE.map((f, i) =>
          layout[i].depth === 0 ? null : (
            <button key={f.id} data-sliver data-file-id={f.id}
              className="stack-sliver"
              style={{
                transform: `translateX(${layout[i].sliverX}px) scale(${layout[i].scale})`,
                zIndex: layout[i].z,
                width: fanned ? SLIVER_FANNED : SLIVER,
              }}
              onClick={() => goTo(i)} aria-label={`Bring FILE_${f.index} to front`}>
              <img src={posterSrc(f.id)} alt="" />
              <span className="sliver-label">FILE_{f.index}</span>
            </button>
          ),
        )}
      </div>
      <div className="stack-hud glass">
        <span>FILE_{front.index} // {front.name}.{front.ext}
          <span className="tw-dim"> · {front.tagline.toUpperCase()} · {front.year}</span>
        </span>
        <button aria-label="Toggle sound" onClick={() => setMuted((m) => !m)}>{muted ? 'SND OFF' : 'SND ON'}</button>
      </div>
    </div>
  )
}
```

Front-change transition: the stage fades/scales in on each front swap (transform/opacity only); slivers reposition via their inline `transform` (translateX) — style-prop changes are instant; wrap them with anime by animating from previous transform is unnecessary complexity for 24px shifts — the fade covers the swap. Reduced motion: gate skips the stage animation.

In `src/App.tsx`: add `const [backdropId, setBackdropId] = useState(ARCHIVE[0].id)` (import ARCHIVE) — pass `onFrontChange={setBackdropId}` and replace `{tab === 'archive' && <ArchiveGrid tier={tier} />}` with `{tab === 'archive' && <ArchivePanel tier={tier} onFrontChange={setBackdropId} />}`. (`backdropId` is consumed in Task 4; until then it's held state — harmless.)

- [ ] **Step 4: Stack CSS** (add to `src/index.css`)

```css
.archive-panel { display: flex; flex-direction: column; }
.view-toggle { display: flex; gap: 0; justify-content: flex-end; flex: 0 0 auto; padding-bottom: 8px; }
.view-toggle button { padding: 5px 12px; font-size: 10px; letter-spacing: 0.06em; color: var(--dim); border: 1px solid var(--hair); margin-left: -1px; }
.view-toggle button.is-active { color: var(--acid); background: rgba(182, 255, 46, 0.05); border-color: var(--hair-bright); }
.view-toggle button:hover:not(.is-active) { color: var(--text); }

.archive-stack { flex: 1 1 auto; min-height: 0; position: relative; display: flex; }
/* The stage is a GLASS FRAME: 14px padding band where the backdrop shows through
   (this band is what the base glass — and Task 6's refraction — acts on);
   the video sits inset inside it. Without the band, backdrop-filter would be
   fully covered by the opaque video and invisible. */
.stack-stage { position: absolute; inset: 0 132px 52px 0; padding: 14px; overflow: hidden; }
.stack-stage video { width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 2; }
.stack-slivers { position: absolute; top: 0; right: 0; bottom: 52px; width: 128px; }
.stack-fan-zone { position: absolute; inset: 0; z-index: 0; }
.stack-sliver {
  position: absolute; top: 0; height: 100%; overflow: hidden;
  border: 1px solid var(--hair); background: var(--panel-solid);
  transform-origin: top left;
}
.stack-sliver img { width: 72px; height: 100%; object-fit: cover; opacity: 0.55; }
.archive-stack[data-fanned='true'] .stack-sliver img { opacity: 0.85; }
.stack-sliver .sliver-label {
  position: absolute; top: 8px; left: 4px; font-size: 9px; letter-spacing: 0.08em;
  writing-mode: vertical-rl; color: var(--text); opacity: 0; transition: opacity 150ms;
}
.archive-stack[data-fanned='true'] .sliver-label { opacity: 1; }
.stack-sliver:hover { border-color: var(--acid); }
.stack-hud {
  position: absolute; left: 0; right: 132px; bottom: 0; height: 40px;
  display: flex; justify-content: space-between; align-items: center; padding: 0 12px; font-size: 11px;
}
.stack-hud button { border: 1px solid var(--hair); padding: 4px 10px; }
.stack-hud button:hover { color: var(--acid); border-color: var(--acid); }

@media (max-width: 640px) {
  .stack-stage { inset: 0 44px 48px 0; }
  .stack-slivers { width: 40px; bottom: 48px; }
  .stack-hud { right: 44px; height: 36px; }
}
```

Width on `.stack-sliver` is set inline and SNAPS between 24/72 (no width transition — the label/img opacity fades cover the reveal). The `sliver-label` opacity transition is a CSS opacity transition — compliant (opacity only). Fanned slivers at 72px × 5 = 360px overflowing the 128px zone: `.stack-slivers` must expand when fanned — add:

```css
.archive-stack[data-fanned='true'] .stack-slivers { width: 384px; z-index: 5; }
.archive-stack[data-fanned='true'] .stack-stage { /* stage stays put; fan overlays it from the right */ }
```

(Slivers overlay the stage's right side while fanned — glassy overlap is desirable; stage never resizes, so the hero refraction card in Task 6 keeps its fixed size.)

- [ ] **Step 5: Migrate grid specs** — in `tests/e2e/archive.spec.ts` and `tests/e2e/focus.spec.ts`, replace each spec's `page.goto('./')` + boot/dismiss preamble with `await gotoGrid(page)` from `./helpers`. Assertions stay byte-identical.

- [ ] **Step 6: Full run** — `npm test && npm run e2e` → everything green across 3 projects (stack.spec new; archive/focus specs green via gotoGrid; boot/window/glass/smoke/lite untouched). Visual screenshot pass at 3 widths; check sliver strip, fan overlay, HUD, toggle.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "Add archive stack view with fan, keyboard cycling, and grid toggle"`

---

### Task 4: Reactive backdrop — background follows the front video

**Files:**
- Modify: `src/components/BackgroundVideo.tsx` (crossfade + dynamic src), `src/App.tsx` (pass backdropId)
- Test: extend `tests/e2e/stack.spec.ts`

**Interfaces:**
- Consumes: `backdropId` state (Task 3), `thumbSrc/posterSrc`.
- Produces: `<BackgroundVideo tier fileId={backdropId} />` — renders the file's **thumb** encode fullscreen (`thumbSrc(fileId)`); on `fileId` change, crossfades old→new over 600ms (opacity only, two stacked `<video>`s, outgoing unmounted after fade); lite tier renders `posterSrc(fileId)` `<img>` swapped instantly; reduced motion swaps instantly.

- [ ] **Step 1: Write the failing e2e** (append to stack.spec.ts)

```ts
test('backdrop mirrors the front of the stack', async ({ page, viewport }) => {
  await ready(page)
  const bgSel = viewport!.width < 480 ? '.bg-video img' : '.bg-video video'
  const srcAttr = viewport!.width < 480 ? /file01_poster\.jpg/ : /file01_thumb\.mp4/
  await expect(page.locator(bgSel).last()).toHaveAttribute('src', srcAttr)
  await page.keyboard.press('n')
  const nextAttr = viewport!.width < 480 ? /file02_poster\.jpg/ : /file02_thumb\.mp4/
  await expect(page.locator(bgSel).last()).toHaveAttribute('src', nextAttr, { timeout: 3000 })
  if (viewport!.width >= 480) {
    // crossfade settles back to a single bg video
    await expect(page.locator('.bg-video video')).toHaveCount(1, { timeout: 3000 })
  }
})
```

Run → FAIL (bg is static bg.mp4).

- [ ] **Step 2: Implement**

```tsx
// src/components/BackgroundVideo.tsx  (full replacement)
import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { thumbSrc, posterSrc } from '../data/archive'
import { prefersReducedMotion, type PerfTier } from '../lib/perfTier'

export default function BackgroundVideo({ tier, fileId }: { tier: PerfTier; fileId: string }) {
  const [layers, setLayers] = useState<string[]>([fileId])   // newest last
  const fading = useRef(false)

  useEffect(() => {
    if (layers[layers.length - 1] === fileId) return
    if (tier === 'lite' || prefersReducedMotion()) { setLayers([fileId]); return }
    setLayers((l) => [...l.slice(-1), fileId])
  }, [fileId, tier]) // eslint-disable-line react-hooks/exhaustive-deps

  const incomingRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (layers.length < 2 || !incomingRef.current || fading.current) return
    fading.current = true
    animate(incomingRef.current, {
      opacity: [0, 1], duration: 600, ease: 'outQuad',
      onComplete: () => { fading.current = false; setLayers((l) => l.slice(-1)) },
    })
  }, [layers])

  if (tier === 'lite') {
    return (
      <div className="bg-video" aria-hidden="true">
        <img src={posterSrc(fileId)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div className="bg-video" aria-hidden="true">
      {layers.map((id, i) => (
        <video key={id} ref={i === layers.length - 1 && layers.length > 1 ? incomingRef : undefined}
          src={thumbSrc(id)} poster={posterSrc(id)} autoPlay muted loop playsInline
          style={i === layers.length - 1 && layers.length > 1 ? { opacity: 0, position: 'absolute', inset: 0 } : { position: 'absolute', inset: 0 }} />
      ))}
    </div>
  )
}
```

In `src/App.tsx`: `<BackgroundVideo tier={tier} fileId={backdropId} />`. Remove the now-unused `media` import if present. `bg.mp4`/`bg_poster.jpg` are no longer referenced (leave the files and pipeline alone).

- [ ] **Step 3: Full run** — `npm test && npm run e2e`. Note: `window.spec.ts`'s tier test asserts `.bg-video video` muted — still true (first layer). The lite branch of that test asserts `.bg-video img` — still true. Check `boot.spec`/`lite.spec` for bg-related assertions and confirm they hold (lite.spec asserts zero playing videos on lite — still true, backdrop is an img).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "Backdrop crossfades to follow the stack's front video"`

---

### Task 5: Touch interactions — swipe, sliver tap, fan flash

**Files:**
- Modify: `src/components/ArchiveStack.tsx` (fan flash on advance), `tests/e2e/stack.spec.ts`

**Interfaces:**
- Consumes: `useSwipe` (already wired to the stage in Task 3), `data-fanned`.
- Produces: after a swipe/keyboard advance, `data-fanned` flips true for ~600ms then false (the "flash"), skipped when `prefersReducedMotion()`.

- [ ] **Step 1: Write the failing e2e** (append to stack.spec.ts)

```ts
test('touch: swipe advances; sliver tap brings a file to front; fan flashes', async ({ page, viewport }) => {
  test.skip(viewport!.width > 640, 'touch model is mobile-only in CI')
  await ready(page)
  const stage = page.locator('[data-stack-front]')
  const box = (await stage.boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2) // warm pointer
  // swipe left → next
  await stage.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 260, clientY: box.y + 200 })
  await stage.dispatchEvent('pointerup', { pointerType: 'touch', clientX: box.x + 60, clientY: box.y + 200 })
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file02')
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-fanned', 'true') // flash
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-fanned', 'false', { timeout: 2000 })
  // sliver tap
  await page.locator('button[data-sliver][data-file-id="file05"]').click()
  await expect(page.locator('.archive-stack')).toHaveAttribute('data-front', 'file05')
})
```

Playwright's mobile project needs touch: add `hasTouch: true` to the mobile project's `use` block in `playwright.config.ts` (one line; desktop/tablet unchanged). Run → FAIL (no flash; possibly no touch).

- [ ] **Step 2: Implement the fan flash** in `ArchiveStack.tsx` — extend `goTo`:

```tsx
const flashTimer = useRef<number | undefined>(undefined)
const goTo = (i: number, flash = false) => {
  setFrontIndex(((i % ARCHIVE.length) + ARCHIVE.length) % ARCHIVE.length)
  setMuted(true)
  if (flash && !prefersReducedMotion()) {
    setFanned(true)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFanned(false), 600)
  }
}
const next = () => goTo(frontIndex + 1, true)
const prev = () => goTo(frontIndex - 1, true)
```

(Sliver clicks call `goTo(i)` without flash — the fan is already open. Clear the timer on unmount in an effect: `useEffect(() => () => window.clearTimeout(flashTimer.current), [])`.) Keyboard `n`/`p` now also flash — acceptable and consistent (they're "advance" actions).

- [ ] **Step 3: Full run** — `npm test && npm run e2e` all green; screenshot check on mobile width for sliver strip usability (40px zone must be tappable).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "Add touch swipe, sliver tap, and fan flash to the stack"`

---

### Task 6: Hero refraction — SVG displacement on the front card

**Files:**
- Create: `scripts/gen-displacement-map.mjs`, `src/generated/displacementMap.ts` (script output, committed)
- Modify: `index.html` (inline SVG filter def), `src/components/ArchiveStack.tsx` (capability-gated class), `src/index.css`, `src/lib/perfTier.ts` (capability probe)
- Test: extend `tests/e2e/glass.spec.ts` (conditional assertion)

**Interfaces:**
- Consumes: `.stack-stage` fixed-inset sizing (Task 3 — never resizes with fan).
- Produces: `supportsLiquidRefraction(): boolean` in perfTier.ts; `.stack-stage.liquid` applying `backdrop-filter: url(#liquid-refraction)`; SVG `<filter id="liquid-refraction">` in index.html fed by the generated data-URL map.

- [ ] **Step 1: Write the map generator**

```js
// scripts/gen-displacement-map.mjs
// Generates a 512x320 edge-refraction displacement map: neutral (128,128) center,
// vectors pointing outward within an 18%-wide border ring, magnitude ramping to the edge.
// R = x displacement, G = y displacement (128 = none). Output: PNG data URL in a TS module.
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'

const W = 512, H = 320, RING = 0.18
const png = new PNG({ width: W, height: H })
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nx = x / (W - 1), ny = y / (H - 1)
    const dEdge = Math.min(nx, 1 - nx, ny, 1 - ny)          // distance to nearest edge, 0..0.5
    const t = dEdge < RING ? 1 - dEdge / RING : 0            // ramp: 1 at edge → 0 at ring inner boundary
    const cx = nx - 0.5, cy = ny - 0.5
    const len = Math.hypot(cx, cy) || 1
    const vx = (cx / len) * t, vy = (cy / len) * t            // outward unit vector scaled by ramp
    const idx = (W * y + x) << 2
    png.data[idx] = Math.round(128 + vx * 127)
    png.data[idx + 1] = Math.round(128 + vy * 127)
    png.data[idx + 2] = 128
    png.data[idx + 3] = 255
  }
}
const dataUrl = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
writeFileSync('src/generated/displacementMap.ts', `// Generated by scripts/gen-displacement-map.mjs — do not edit.\nexport const displacementMapUrl = '${dataUrl}'\n`)
console.log(`wrote src/generated/displacementMap.ts (${Math.round(dataUrl.length / 1024)} KB)`)
```

`npm i -D pngjs` then `node scripts/gen-displacement-map.mjs` (commit the generated module; add `"gen:map": "node scripts/gen-displacement-map.mjs"` to package.json scripts).

- [ ] **Step 2: Inline the filter** — in `index.html` just inside `<body>`:

```html
<svg width="0" height="0" style="position:absolute" color-interpolation-filters="sRGB" aria-hidden="true">
  <filter id="liquid-refraction" x="0" y="0" width="100%" height="100%">
    <feImage href="" result="map" preserveAspectRatio="none" id="liquid-refraction-map" />
    <feDisplacementMap in="SourceGraphic" in2="map" scale="22" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</svg>
```

The `href` is injected at runtime (data URL lives in the TS module, keeping index.html small): in `src/main.tsx`, before render:

```ts
import { displacementMapUrl } from './generated/displacementMap'
document.getElementById('liquid-refraction-map')?.setAttribute('href', displacementMapUrl)
```

- [ ] **Step 3: Capability gate** — add to `src/lib/perfTier.ts`:

```ts
export function supportsLiquidRefraction(): boolean {
  try { return CSS.supports('backdrop-filter', 'url(#liquid-refraction)') } catch { return false }
}
```

In `ArchiveStack.tsx`, compute once: `const liquid = useMemo(() => tier === 'full' && supportsLiquidRefraction(), [tier])` and add `liquid ? ' liquid' : ''` to `.stack-stage`'s className. Also give `.stack-stage` the base `glass` class in Task 3's markup if not already present — the refraction/glass acts on the stage's 14px padding band (the video child covers the rest). CSS:

```css
.stack-stage.liquid {
  /* refraction chained with a lighter blur so the bend reads through the frame band */
  backdrop-filter: url(#liquid-refraction) blur(6px) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6) brightness(1.08); /* non-Chromium ignores url(); .glass fallback look */
}
```

(The stage's inset is fixed per breakpoint — the map never rebuilds; the fan overlays rather than resizes it, per Task 3. The visible refraction lives in the padding band where the backdrop video shows through.)

- [ ] **Step 4: Conditional e2e** (append to glass.spec.ts)

```ts
test('hero refraction applies only where supported', async ({ page, viewport }) => {
  test.skip(viewport!.width < 480, 'lite tier never gets refraction')
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const supported = await page.evaluate(() => CSS.supports('backdrop-filter', 'url(#liquid-refraction)'))
  const cls = await page.locator('.stack-stage').getAttribute('class')
  expect(cls!.includes('liquid')).toBe(supported)
})
```

- [ ] **Step 5: Full run + visual** — `npm test && npm run e2e`; screenshot the stack on desktop and LOOK: the video should bend subtly at the stage border. If the distortion is too strong/weak, adjust `scale` (22) in the filter — range 14–30.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "Add Chromium-gated liquid refraction to the stack stage"`

---

### Task 7: Verification sweep + deploy

**Files:**
- Modify: only what the sweep flags; `README.md` (one line: stack view + toggle mention in the site description)

- [ ] **Step 1: Full suites** — `npm test && npm run e2e` all green, then `npm run e2e -- --repeat-each=2` for flake check.
- [ ] **Step 2: Budget checks** — `npm run build`; gzip JS still < 250 KB (`gzip -c dist/assets/*.js | wc -c`); the displacement data URL adds ~20-80 KB — confirm total. Playing-video ceilings: stack view ≤2 steady (probe with the `!v.paused` evaluate), 3 only mid-crossfade; grid view ceilings unchanged (≤5).
- [ ] **Step 3: Visual pass** — headless screenshots × 3 widths × {stack default, fanned, grid view}; read them all; fix visual breakage (CSS only) before shipping.
- [ ] **Step 4: README line** — mention the stack/grid toggle in the site description section (plain register, no em dashes).
- [ ] **Step 5: Ship** — commit any fixes (no AI attribution), fast-forward `main`, push both refs, `gh workflow run deploy.yml --ref main --repo decoy-dev/severedarchive`, `gh run watch --exit-status`, `curl -sI https://decoy-dev.github.io/severedarchive/` → 200, then one live probe: stack front video playing (`!paused`, advancing) and backdrop src mirrors front on the live site.
- [ ] **Step 6: Commit/push anything the live check surfaced.**
