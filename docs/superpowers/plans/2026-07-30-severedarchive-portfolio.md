# severedarchive Portfolio Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy severedarchive's single-screen terminal/glass portfolio site (video-on-video archive with FLIP zoom) to GitHub Pages.

**Architecture:** Vite + React + TypeScript static SPA. One locked viewport: background video, four glass-blur margin strips, a centered terminal window with three tabs. All `<video>` play/pause routes through one `VideoDirector` (cap + focus). anime.js v4 drives boot, tab redraw, notification, and FLIP card zoom.

**Tech Stack:** Vite 6, React 18, TypeScript, Tailwind v4 (`@tailwindcss/vite`), animejs v4, @fontsource/share-tech-mono, vitest, @playwright/test, ffmpeg (asset pipeline), gh CLI (deploy).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-severedarchive-portfolio-design.md` — read it before starting.
- **Zero scrolling anywhere**, any viewport: `overflow: hidden`, `100dvh` lock. Content paginates, never scrolls.
- **anime.js v4 modular API only**: `import { animate, createTimeline, stagger } from 'animejs'` — never the v3 `anime({...})` global.
- **Animate transform/opacity only.** No layout-property animation. Scanlines are static.
- Palette: near-black panels, white/grey mono text, accent `#B6FF2E` (acid, active states only), `#FF3524` (alert red, notification only). No gradients-as-depth, no amber/cyan phosphor.
- Type: Share Tech Mono for everything (single weight — emphasis via size/color/spacing, never font-weight).
- DCY.DSGN ASCII header comment (verbatim from `~/444-build/index.html`) at top of `index.html`.
- Playback tiers: bg ≤720p; thumbs ~240p; full-res only on focus; max 4 thumbs playing + 1 focused; `lite` tier (reduced-motion / `deviceMemory ≤ 4` / width < 480) → poster frames in grid, vignette instead of backdrop-blur.
- Playwright is **always headless**. Never launch a headed browser.
- **Git identity: commit as the user's existing git identity. NEVER add `Co-Authored-By: Claude`, `Generated with Claude Code`, or any Claude/AI attribution to any commit, file, or the repo.**
- Vite `base: '/severedarchive/'` (GitHub Pages project site at `decoy-dev/severedarchive`).
- Mobile (≤640px) is its own layout: bottom tab bar, near-full-bleed window, single-column grid.

---

### Task 1: Scaffold, screen lock, design tokens, test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `.gitignore`

**Interfaces:**
- Produces: CSS custom properties (`--void --panel --text --bright --dim --hair --hair-bright --acid --alert --mono --frame`), classes `.stage`, `.terminal-window`, `.glass-frame`, `.scanlines`; npm scripts `dev build preview test e2e`; Playwright projects `desktop` (1440×900), `tablet` (768×1024), `mobile` (390×844) with `webServer` on port 4173 and `baseURL http://localhost:4173/severedarchive/`.

- [ ] **Step 1: Scaffold project**

```bash
cd ~/severedarchive-build
npm create vite@latest . -- --template react-ts   # answer "Ignore files and continue" if prompted
npm i animejs @fontsource/share-tech-mono
npm i -D tailwindcss @tailwindcss/vite vitest @playwright/test
npx playwright install chromium
```

Add to `package.json` scripts: `"test": "vitest run"`, `"e2e": "playwright test"`.

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/severedarchive/',
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Write `index.html` with the verbatim DCY.DSGN header**

The comment block below is the verbatim header from `/Users/chrishaddox/444-build/index.html` — use it exactly as shown:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
<!--
██████   ██████ ██    ██ ██████  ███████  ██████  ███    ██
██   ██ ██       ██  ██  ██   ██ ██      ██       ████   ██
██   ██ ██        ████   ██   ██ ███████ ██   ███ ██ ██  ██
██   ██ ██         ██    ██   ██      ██ ██    ██ ██  ██ ██
██████   ██████    ██    ██████  ███████  ██████  ██   ████

  Made by DCY.DSGN
  Instagram : https://instagram.com/dcy.dsgn/
  Website   : https://decoy.ltd/
-->
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>SEVEREDARCHIVE</title>
    <meta name="description" content="severedarchive — motion + visual art. Renders set to sound." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Write `src/index.css`** (tokens, lock, glass, scanlines — the design system)

```css
@import 'tailwindcss';
@import '@fontsource/share-tech-mono';

:root {
  --void: #07090b;
  --panel: rgba(10, 13, 16, 0.78);
  --panel-solid: #0b0e11;
  --text: #c9d2d8;
  --bright: #eff3f5;
  --dim: #6e7a83;
  --hair: rgba(201, 210, 216, 0.16);
  --hair-bright: rgba(201, 210, 216, 0.34);
  --acid: #b6ff2e;
  --alert: #ff3524;
  --mono: 'Share Tech Mono', ui-monospace, monospace;
  --frame: clamp(16px, 4.5vw, 56px);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root { height: 100%; }
body {
  background: var(--void);
  color: var(--text);
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;               /* single screen — never scrolls */
  overscroll-behavior: none;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
video { display: block; width: 100%; height: 100%; object-fit: cover; }

.stage { position: fixed; inset: 0; height: 100dvh; overflow: hidden; }

/* background video layer */
.bg-video { position: absolute; inset: 0; z-index: 0; }

/* glass margin: four strips around the window */
.glass-strip { position: absolute; z-index: 1; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); background: rgba(7, 9, 11, 0.35); }
.glass-strip.top    { top: 0; left: 0; right: 0; height: var(--frame); }
.glass-strip.bottom { bottom: 0; left: 0; right: 0; height: var(--frame); }
.glass-strip.left   { top: var(--frame); bottom: var(--frame); left: 0; width: var(--frame); }
.glass-strip.right  { top: var(--frame); bottom: var(--frame); right: 0; width: var(--frame); }
/* lite tier: no live blur */
[data-tier='lite'] .glass-strip { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgba(7, 9, 11, 0.82); }

/* the terminal window */
.terminal-window {
  position: absolute; inset: var(--frame); z-index: 2;
  background: var(--panel);
  border: 1px solid var(--hair-bright);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.terminal-window::after {   /* static scanlines */
  content: ''; position: absolute; inset: 0; z-index: 40; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px);
}
```

- [ ] **Step 5: Write minimal `src/main.tsx` and `src/App.tsx`**

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```tsx
// src/App.tsx  (placeholder shell — replaced in Task 4)
export default function App() {
  return (
    <div className="stage" data-booted="true">
      <div className="glass-strip top" />
      <div className="glass-strip bottom" />
      <div className="glass-strip left" />
      <div className="glass-strip right" />
      <div className="terminal-window">
        <header style={{ padding: '10px 14px', borderBottom: '1px solid var(--hair)' }}>
          SEVEREDARCHIVE // FILE SYSTEM
        </header>
      </div>
    </div>
  )
}
```

Delete the Vite template's `src/App.css` and `src/assets/react.svg`; remove their imports.

- [ ] **Step 6: Write `playwright.config.ts` (headless, 3 viewports) and failing smoke test**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173/severedarchive/', headless: true },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/severedarchive/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
})
```

```ts
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test'

test('locked single screen, window renders', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('SEVEREDARCHIVE // FILE SYSTEM')).toBeVisible()
  const scroll = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(scroll.doc).toBeLessThanOrEqual(1)
  expect(scroll.body).toBeLessThanOrEqual(1)
})
```

- [ ] **Step 7: Run e2e, verify pass**

Run: `npm run e2e`
Expected: 3 passed (one per viewport). If the header text assertion fails first, the shell isn't rendering — fix before proceeding.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Scaffold Vite/React shell with screen lock, tokens, glass frame, test harness"
```

---

### Task 2: Media pipeline (stock clips → tiered encodes)

**Files:**
- Create: `scripts/sources.txt`, `scripts/fetch-media.sh`, `scripts/synth-fallback.sh`, `scripts/process-media.sh`
- Output: `public/media/bg.mp4`, `public/media/bg_poster.jpg`, and for each of `file01…file06`: `_thumb.mp4`, `_full.mp4`, `_poster.jpg`

**Interfaces:**
- Produces: the exact filenames above under `public/media/` — Task 3's `archive.ts` references them by convention `${id}_thumb.mp4` / `${id}_full.mp4` / `${id}_poster.jpg`.

- [ ] **Step 1: Write `scripts/sources.txt`** — 7 slots (`bg` + 6 files). Find real license-free abstract/chrome/Y2K clips on Pexels or Coverr (WebSearch or the sites' APIs; direct `videos.pexels.com/video-files/...` mp4 URLs). Format, one per line: `id url`. If a good clip can't be found for a slot, write `id SYNTH`.

- [ ] **Step 2: Write `scripts/fetch-media.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p raw
while read -r id url; do
  [ -z "$id" ] && continue
  if [ "$url" = "SYNTH" ]; then
    ./scripts/synth-fallback.sh "$id"
    continue
  fi
  if ! curl -fsSL --retry 2 -o "raw/${id}.mp4" "$url" || ! ffprobe -v error "raw/${id}.mp4" 2>/dev/null; then
    echo "FETCH FAILED for ${id} — synthesizing fallback"
    ./scripts/synth-fallback.sh "$id"
  fi
done < scripts/sources.txt
```

- [ ] **Step 3: Write `scripts/synth-fallback.sh`** (procedural loop so the build never blocks)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; mkdir -p raw
seed=$(( $(echo -n "$id" | cksum | cut -d' ' -f1) % 6 ))
case $seed in
  0) src="gradients=s=1280x720:d=10:speed=0.03:c0=0x10141a:c1=0x6e7a83:c2=0xc9d2d8" ;;
  1) src="gradients=s=1280x720:d=10:speed=0.06:c0=0x07090b:c1=0x3d5060:c2=0xb6ff2e" ;;
  2) src="mandelbrot=s=1280x720:end_scale=0.1" ;;
  3) src="gradients=s=1280x720:d=10:speed=0.02:c0=0x1a1a1a:c1=0x8a959d:c2=0x2b3540" ;;
  4) src="life=s=1280x720:mold=10:r=25:ratio=0.1:death_color=#101418:life_color=#c9d2d8" ;;
  *) src="gradients=s=1280x720:d=10:speed=0.05:c0=0x0b0e11:c1=0xeff3f5:c2=0x555f66" ;;
esac
ffmpeg -y -v error -f lavfi -i "$src" -t 10 -vf "format=yuv420p,noise=alls=6:allf=t" \
  -c:v libx264 -crf 24 -an "raw/${id}.mp4"
```

- [ ] **Step 4: Write `scripts/process-media.sh`** (tiered encodes)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/media
# background: 720p, hard-compressed, silent, 10s loopable
ffmpeg -y -v error -i raw/bg.mp4 -t 10 -vf "scale=-2:720,fps=24,format=yuv420p" \
  -c:v libx264 -crf 30 -preset slow -movflags +faststart -an public/media/bg.mp4
ffmpeg -y -v error -ss 1 -i raw/bg.mp4 -frames:v 1 -vf "scale=-2:720" -q:v 4 public/media/bg_poster.jpg
for id in file01 file02 file03 file04 file05 file06; do
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 8 -vf "scale=-2:240,fps=24,format=yuv420p" \
    -c:v libx264 -crf 32 -preset slow -movflags +faststart -an "public/media/${id}_thumb.mp4"
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart \
    -c:a aac -b:a 96k "public/media/${id}_full.mp4" 2>/dev/null || \
  ffmpeg -y -v error -i "raw/${id}.mp4" -t 12 -vf "scale=-2:720,fps=30,format=yuv420p" \
    -c:v libx264 -crf 26 -preset slow -movflags +faststart -an "public/media/${id}_full.mp4"
  ffmpeg -y -v error -ss 1 -i "raw/${id}.mp4" -frames:v 1 -vf "scale=-2:480" -q:v 4 "public/media/${id}_poster.jpg"
done
du -sh public/media
```

- [ ] **Step 5: Run pipeline and verify**

Run: `chmod +x scripts/*.sh && ./scripts/fetch-media.sh && ./scripts/process-media.sh`
Then: `for f in public/media/*; do ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$f" >/dev/null 2>&1 || file "$f"; done && ls -la public/media | wc -l`
Expected: 19 media files (1 bg mp4 + 1 bg jpg + 6×3 file assets + `.`/`..` lines adjust count); total size well under 40 MB. Add `raw/` to `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add media pipeline and tiered stock/synth encodes"
```

---

### Task 3: Data + logic core (archive data, VideoDirector, perf tier, pagination) — TDD

**Files:**
- Create: `src/data/archive.ts`, `src/lib/videoDirector.ts`, `src/lib/perfTier.ts`, `src/lib/paginate.ts`, `src/lib/flip.ts`
- Test: `src/lib/videoDirector.test.ts`, `src/lib/perfTier.test.ts`, `src/lib/paginate.test.ts`

**Interfaces:**
- Produces:
  - `archive.ts`: `type ArchiveFile = { id: string; index: string; name: string; ext: 'MP4'; tagline: string; duration: string; year: string }`; `const ARCHIVE: ArchiveFile[]` (6 entries, ids `file01…file06`); `const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f`; helpers `thumbSrc(id) fullSrc(id) posterSrc(id)`.
  - `videoDirector.ts`: `type Playable = { play(): void; pause(): void }`; `class VideoDirector { constructor(maxPlaying?: number); register(id: string, el: Playable): void; unregister(id: string): void; setFocus(id: string | null): void; playingIds(): string[] }`.
  - `perfTier.ts`: `type PerfTier = 'full' | 'lite'`; `detectPerfTier(env: { reducedMotion: boolean; deviceMemory?: number; width: number }): PerfTier`; `readPerfTier(): PerfTier` (reads real `matchMedia`/`navigator.deviceMemory`/`innerWidth`).
  - `paginate.ts`: `paginate<T>(items: T[], perPage: number): T[][]`.
  - `flip.ts`: `captureRects(els: HTMLElement[]): Map<HTMLElement, DOMRect>`; `playFlip(prev: Map<HTMLElement, DOMRect>, els: HTMLElement[], opts?: { duration?: number }): void`.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/videoDirector.test.ts
import { describe, it, expect, vi } from 'vitest'
import { VideoDirector, type Playable } from './videoDirector'

const fake = (): Playable & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } => ({
  play: vi.fn(), pause: vi.fn(),
})

describe('VideoDirector', () => {
  it('plays registered videos up to the cap, in registration order', () => {
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    expect(d.playingIds()).toEqual(['a', 'b', 'c', 'd'])
    expect(els[4].el.pause).toHaveBeenCalled()
  })
  it('focus always plays and counts toward the cap', () => {
    const d = new VideoDirector(4)
    const els = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, el: fake() }))
    els.forEach(({ id, el }) => d.register(id, el))
    d.setFocus('e')
    expect(d.playingIds()).toContain('e')
    expect(d.playingIds().length).toBeLessThanOrEqual(4)
  })
  it('unregister frees a slot; clearing focus restores order', () => {
    const d = new VideoDirector(2)
    const a = fake(), b = fake(), c = fake()
    d.register('a', a); d.register('b', b); d.register('c', c)
    expect(d.playingIds()).toEqual(['a', 'b'])
    d.unregister('a')
    expect(d.playingIds()).toEqual(['b', 'c'])
    d.setFocus('c'); d.setFocus(null)
    expect(d.playingIds()).toEqual(['b', 'c'])
  })
})
```

```ts
// src/lib/perfTier.test.ts
import { describe, it, expect } from 'vitest'
import { detectPerfTier } from './perfTier'

describe('detectPerfTier', () => {
  it('full on a capable desktop', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 8, width: 1440 })).toBe('full'))
  it('lite when reduced motion requested', () =>
    expect(detectPerfTier({ reducedMotion: true, deviceMemory: 8, width: 1440 })).toBe('lite'))
  it('lite on low memory', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 4, width: 1440 })).toBe('lite'))
  it('lite on very small screens', () =>
    expect(detectPerfTier({ reducedMotion: false, deviceMemory: 8, width: 375 })).toBe('lite'))
  it('full when deviceMemory is unavailable (Safari/Firefox)', () =>
    expect(detectPerfTier({ reducedMotion: false, width: 1024 })).toBe('full'))
})
```

```ts
// src/lib/paginate.test.ts
import { describe, it, expect } from 'vitest'
import { paginate } from './paginate'

describe('paginate', () => {
  it('splits into pages', () =>
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]))
  it('single page when items fit', () =>
    expect(paginate([1, 2], 6)).toEqual([[1, 2]]))
  it('empty input → one empty page', () => expect(paginate([], 4)).toEqual([[]]))
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four modules**

```ts
// src/lib/videoDirector.ts
export type Playable = { play(): void; pause(): void }

export class VideoDirector {
  private order: string[] = []
  private els = new Map<string, Playable>()
  private focus: string | null = null
  private playing = new Set<string>()

  constructor(private maxPlaying = 4) {}

  register(id: string, el: Playable) {
    if (!this.els.has(id)) this.order.push(id)
    this.els.set(id, el)
    this.apply()
  }
  unregister(id: string) {
    this.els.delete(id)
    this.order = this.order.filter((x) => x !== id)
    this.playing.delete(id)
    if (this.focus === id) this.focus = null
    this.apply()
  }
  setFocus(id: string | null) {
    this.focus = id
    this.apply()
  }
  playingIds(): string[] {
    return this.order.filter((id) => this.playing.has(id))
  }
  private apply() {
    const desired = new Set<string>()
    if (this.focus && this.els.has(this.focus)) desired.add(this.focus)
    for (const id of this.order) {
      if (desired.size >= this.maxPlaying) break
      desired.add(id)
    }
    for (const [id, el] of this.els) {
      const should = desired.has(id)
      const is = this.playing.has(id)
      if (should && !is) { el.play(); this.playing.add(id) }
      if (!should && is) { el.pause(); this.playing.delete(id) }
    }
  }
}
```

```ts
// src/lib/perfTier.ts
export type PerfTier = 'full' | 'lite'

export function detectPerfTier(env: {
  reducedMotion: boolean
  deviceMemory?: number
  width: number
}): PerfTier {
  if (env.reducedMotion) return 'lite'
  if (env.deviceMemory !== undefined && env.deviceMemory <= 4) return 'lite'
  if (env.width < 480) return 'lite'
  return 'full'
}

export function readPerfTier(): PerfTier {
  return detectPerfTier({
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    width: window.innerWidth,
  })
}
```

```ts
// src/lib/paginate.ts
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (items.length === 0) return [[]]
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage))
  return pages
}
```

```ts
// src/lib/flip.ts
import { animate } from 'animejs'

export function captureRects(els: HTMLElement[]): Map<HTMLElement, DOMRect> {
  return new Map(els.map((el) => [el, el.getBoundingClientRect()]))
}

export function playFlip(
  prev: Map<HTMLElement, DOMRect>,
  els: HTMLElement[],
  opts: { duration?: number } = {},
) {
  const duration = opts.duration ?? 420
  for (const el of els) {
    const before = prev.get(el)
    if (!before) continue
    const after = el.getBoundingClientRect()
    const dx = before.left - after.left
    const dy = before.top - after.top
    const sx = before.width / after.width
    const sy = before.height / after.height
    if (!dx && !dy && sx === 1 && sy === 1) continue
    el.style.transformOrigin = 'top left'
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    animate(el, {
      translateX: [dx, 0], translateY: [dy, 0],
      scaleX: [sx, 1], scaleY: [sy, 1],
      duration, ease: 'outExpo',
      onComplete: () => { el.style.transform = '' },
    })
  }
}
```

```ts
// src/data/archive.ts
export type ArchiveFile = {
  id: string
  index: string
  name: string
  ext: 'MP4'
  tagline: string
  duration: string
  year: string
}

export const ARCHIVE: ArchiveFile[] = [
  { id: 'file01', index: '001', name: 'CHROME_SEQ', ext: 'MP4', tagline: 'liquid metal study', duration: '00:12', year: '2026' },
  { id: 'file02', index: '002', name: 'HALO_DRIFT', ext: 'MP4', tagline: 'render set to sound', duration: '00:10', year: '2026' },
  { id: 'file03', index: '003', name: 'GLASS_RITE', ext: 'MP4', tagline: 'refraction pass', duration: '00:08', year: '2025' },
  { id: 'file04', index: '004', name: 'WIRE_SAINT', ext: 'MP4', tagline: 'neo-2000s loop', duration: '00:11', year: '2025' },
  { id: 'file05', index: '005', name: 'COLD_BLOOM', ext: 'MP4', tagline: 'particle bloom', duration: '00:09', year: '2025' },
  { id: 'file06', index: '006', name: 'STEEL_HYMN', ext: 'MP4', tagline: 'metalheart sketch', duration: '00:14', year: '2024' },
]

export const media = (f: string) => import.meta.env.BASE_URL + 'media/' + f
export const thumbSrc = (id: string) => media(`${id}_thumb.mp4`)
export const fullSrc = (id: string) => media(`${id}_full.mp4`)
export const posterSrc = (id: string) => media(`${id}_poster.jpg`)
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test`
Expected: all vitest suites PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add archive data and logic core: video director, perf tier, pagination, FLIP"
```

---

### Task 4: Window shell — background video, terminal chrome, tabs, About/Links panels

**Files:**
- Create: `src/components/BackgroundVideo.tsx`, `src/components/TerminalWindow.tsx`, `src/components/AboutPanel.tsx`, `src/components/LinksPanel.tsx`
- Modify: `src/App.tsx` (real shell), `src/index.css` (chrome styles)
- Test: `tests/e2e/window.spec.ts`

**Interfaces:**
- Consumes: `readPerfTier`, `media` from Task 3.
- Produces: `type TabId = 'archive' | 'about' | 'links'` (exported from `TerminalWindow.tsx`); `<TerminalWindow tab onTab onBell bodyRef children>`; App state contract used by Tasks 5–7: `tab: TabId`, `noticeOpen: boolean`, `booted: boolean` (booted hardcoded `true` until Task 7). `data-tier` attribute on `.stage`; `data-tab` on the window.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/window.spec.ts
import { test, expect } from '@playwright/test'

test('tabs switch panels', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'ABOUT' }).click()
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.getByRole('button', { name: 'LINKS' }).click()
  await expect(page.getByText('INSTAGRAM')).toBeVisible()
})

test('arrow keys switch tabs', async ({ page }) => {
  await page.goto('./')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'ARCHIVE' })).toHaveAttribute('aria-selected', 'true')
})

test('background video is present and muted-autoplay', async ({ page }) => {
  await page.goto('./')
  const muted = await page.locator('.bg-video video').evaluate((v: HTMLVideoElement) => v.muted)
  expect(muted).toBe(true)
})
```

Run: `npm run e2e -- window.spec.ts` → Expected: FAIL (no ABOUT button).

- [ ] **Step 2: Implement components**

```tsx
// src/components/BackgroundVideo.tsx
import { media } from '../data/archive'
import type { PerfTier } from '../lib/perfTier'

export default function BackgroundVideo({ tier }: { tier: PerfTier }) {
  return (
    <div className="bg-video" aria-hidden="true">
      {tier === 'full' ? (
        <video src={media('bg.mp4')} poster={media('bg_poster.jpg')} autoPlay muted loop playsInline />
      ) : (
        <img src={media('bg_poster.jpg')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
    </div>
  )
}
```

```tsx
// src/components/TerminalWindow.tsx
import type { ReactNode, RefObject } from 'react'

export type TabId = 'archive' | 'about' | 'links'
const TABS: { id: TabId; label: string }[] = [
  { id: 'archive', label: 'ARCHIVE' },
  { id: 'about', label: 'ABOUT' },
  { id: 'links', label: 'LINKS' },
]

export default function TerminalWindow({
  tab, onTab, onBell, bodyRef, footer, children,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  onBell: () => void
  bodyRef: RefObject<HTMLDivElement | null>
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="terminal-window" data-tab={tab}>
      <header className="tw-titlebar">
        <span className="tw-title">SEVEREDARCHIVE <span className="tw-dim">// FILE SYSTEM</span></span>
        <span className="tw-status">
          <span className="tw-dim">SESSION OPEN</span>
          <button className="tw-bell" onClick={onBell} aria-label="Show notification">ALERT [1]</button>
        </span>
      </header>
      <nav className="tw-tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'tw-tab is-active' : 'tw-tab'}
            onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tw-body" ref={bodyRef}>{children}</div>
      <footer className="tw-footer">
        <span>{footer}</span>
        <span className="tw-dim">SVRD.ARCV V1.0 · 2026</span>
      </footer>
    </section>
  )
}
```

```tsx
// src/components/AboutPanel.tsx
export default function AboutPanel() {
  return (
    <div className="panel about-panel">
      <div className="panel-block">
        <span className="panel-label">OPERATOR</span>
        <p className="panel-big">SEVEREDARCHIVE</p>
      </div>
      <div className="panel-block">
        <span className="panel-label">FIELD</span>
        <p className="panel-big">MOTION + VISUAL ART</p>
      </div>
      <div className="panel-block">
        <span className="panel-label">BACKSTORY</span>
        <p>
          Blender-built worlds set to music. Chrome, glass, and metal — still frames and
          moving sequences in a neo-2000s register. The archive updates when the renders survive.
        </p>
      </div>
      <div className="panel-block">
        <span className="panel-label">TOOLING</span>
        <p>BLENDER · GEOMETRY NODES · SOUND-SYNCED SEQUENCING</p>
      </div>
    </div>
  )
}
```

```tsx
// src/components/LinksPanel.tsx
const LINKS = [
  { label: 'INSTAGRAM', value: '@severedarchive', href: 'https://instagram.com/severedarchive' },
  { label: 'MAIL', value: 'CONTACT@SEVEREDARCHIVE', href: 'mailto:hello@example.com' },
  { label: 'COMMISSIONS', value: 'STATUS: OPEN', href: '#' },
]

export default function LinksPanel() {
  return (
    <div className="panel links-panel">
      {LINKS.map((l) => (
        <a key={l.label} className="link-row" href={l.href} target="_blank" rel="noreferrer">
          <span className="panel-label">{l.label}</span>
          <span className="link-value">{l.value}</span>
          <span className="link-go">►</span>
        </a>
      ))}
    </div>
  )
}
```

```tsx
// src/App.tsx  (full replacement)
import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import AboutPanel from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import { readPerfTier } from './lib/perfTier'

export default function App() {
  const [tier] = useState(readPerfTier)
  const [tab, setTabState] = useState<TabId>('archive')
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const setTab = (t: TabId) => {
    setTabState(t)
    if (bodyRef.current) animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
  }

  // spec: arrow keys switch tabs
  useEffect(() => {
    const order: TabId[] = ['archive', 'about', 'links']
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      setTabState((cur) => {
        const i = order.indexOf(cur)
        return order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]
      })
      if (bodyRef.current) animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="stage" data-tier={tier} data-booted="true">
      <BackgroundVideo tier={tier} />
      <div className="glass-strip top" /><div className="glass-strip bottom" />
      <div className="glass-strip left" /><div className="glass-strip right" />
      <TerminalWindow tab={tab} onTab={setTab} onBell={() => {}} bodyRef={bodyRef}>
        {tab === 'archive' && <div className="panel">ARCHIVE LOADING…</div>}
        {tab === 'about' && <AboutPanel />}
        {tab === 'links' && <LinksPanel />}
      </TerminalWindow>
    </div>
  )
}
```

- [ ] **Step 3: Add chrome styles to `src/index.css`**

```css
/* ── window chrome ── */
.tw-titlebar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; height: 42px; flex: 0 0 auto;
  border-bottom: 1px solid var(--hair-bright);
  font-size: 12px; letter-spacing: 0.04em; color: var(--bright);
}
.tw-dim { color: var(--dim); }
.tw-status { display: flex; gap: 16px; align-items: center; font-size: 11px; }
.tw-bell { border: 1px solid var(--hair); padding: 3px 8px; color: var(--text); }
.tw-bell:hover { border-color: var(--acid); color: var(--acid); }

.tw-tabs { display: flex; gap: 0; padding: 10px 14px 0; flex: 0 0 auto; }
.tw-tab {
  padding: 7px 16px; font-size: 11px; letter-spacing: 0.06em;
  color: var(--dim); border: 1px solid var(--hair); border-bottom: 0; margin-right: -1px;
  background: rgba(7, 9, 11, 0.4);
}
.tw-tab.is-active { color: var(--acid); background: rgba(182, 255, 46, 0.05); border-color: var(--hair-bright); }
.tw-tab:hover:not(.is-active) { color: var(--text); }

.tw-body { flex: 1 1 auto; min-height: 0; border: 1px solid var(--hair-bright); margin: 0 14px; position: relative; overflow: hidden; }
.tw-footer {
  display: flex; justify-content: space-between; align-items: center;
  height: 36px; padding: 0 14px; flex: 0 0 auto; font-size: 11px;
}

/* ── panels ── */
.panel { position: absolute; inset: 0; padding: clamp(16px, 3vw, 32px); overflow: hidden; }
.panel-block { border: 1px solid var(--hair); padding: 12px 16px; margin-bottom: 12px; max-width: 560px; }
.panel-label { display: block; font-size: 10px; letter-spacing: 0.1em; color: var(--dim); margin-bottom: 6px; }
.panel-big { font-size: clamp(18px, 2.4vw, 26px); letter-spacing: 0.02em; color: var(--bright); } /* Share Tech Mono is single-weight — no bold anywhere */

.links-panel { display: flex; flex-direction: column; justify-content: center; gap: 12px; max-width: 560px; }
.link-row {
  display: grid; grid-template-columns: 110px 1fr auto; align-items: center; gap: 12px;
  border: 1px solid var(--hair); padding: 14px 16px;
}
.link-row .panel-label { margin: 0; }
.link-value { color: var(--bright); font-size: 14px; }
.link-go { color: var(--dim); }
.link-row:hover { border-color: var(--acid); }
.link-row:hover .link-go { color: var(--acid); }
```

- [ ] **Step 4: Run e2e, verify pass**

Run: `npm run e2e`
Expected: smoke + window specs pass on all 3 projects. (Mobile layout polish comes in Task 8; these assertions must still hold.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add window shell: background video, terminal chrome, tabs, about/links panels"
```

---

### Task 5: Archive grid — file cards, pager, director wiring

**Files:**
- Create: `src/components/ArchiveGrid.tsx`, `src/components/FileCard.tsx`, `src/hooks/useCardsPerPage.ts`
- Modify: `src/App.tsx` (mount ArchiveGrid), `src/index.css`
- Test: `tests/e2e/archive.spec.ts`

**Interfaces:**
- Consumes: `ARCHIVE thumbSrc fullSrc posterSrc`, `VideoDirector`, `paginate`, `PerfTier`, `captureRects/playFlip`.
- Produces: `<ArchiveGrid tier>` renders `[data-card]` elements with `data-file-id`; focused card sets `data-focused="<id>"` on the grid root (Task 6 implements focus; this task renders the grid + pager only, no focus yet). Grid root class `archive-grid`; pager buttons `aria-label="Previous page"` / `"Next page"`, text `01/02` style.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/archive.spec.ts
import { test, expect } from '@playwright/test'

test('archive shows file cards with terminal labels and a pager when overflowing', async ({ page }) => {
  await page.goto('./')
  const cards = page.locator('[data-card]')
  await expect(cards.first()).toBeVisible()
  const count = await cards.count()
  expect(count).toBeGreaterThanOrEqual(2)
  expect(count).toBeLessThanOrEqual(6)
  await expect(page.getByText('FILE_001')).toBeVisible()
})

test('no more videos playing than the cap allows', async ({ page }) => {
  await page.goto('./')
  await page.waitForTimeout(800)
  const playing = await page.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  )
  expect(playing).toBeLessThanOrEqual(5) // bg + max 4 thumbs
})
```

Run: `npm run e2e -- archive.spec.ts` → Expected: FAIL (no `[data-card]`).

- [ ] **Step 2: Implement**

```ts
// src/hooks/useCardsPerPage.ts
import { useEffect, useState } from 'react'

function compute(w: number): number {
  if (w <= 640) return 3
  if (w <= 1024) return 4
  return 6
}

export function useCardsPerPage(): number {
  const [n, setN] = useState(() => compute(window.innerWidth))
  useEffect(() => {
    const on = () => setN(compute(window.innerWidth))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}
```

```tsx
// src/components/FileCard.tsx
import { useEffect, useRef } from 'react'
import { type ArchiveFile, thumbSrc, fullSrc, posterSrc } from '../data/archive'
import type { VideoDirector } from '../lib/videoDirector'
import type { PerfTier } from '../lib/perfTier'

export default function FileCard({
  file, director, tier, focused, muted, onClick,
}: {
  file: ArchiveFile
  director: VideoDirector
  tier: PerfTier
  focused: boolean
  muted: boolean
  onClick: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const showVideo = tier === 'full' || focused

  useEffect(() => {
    const v = videoRef.current
    if (!v || !showVideo) return
    const el = { play: () => { v.play().catch(() => {}) }, pause: () => v.pause() }
    director.register(file.id, el)
    return () => director.unregister(file.id)
  }, [director, file.id, showVideo])

  return (
    <button data-card data-file-id={file.id} className={focused ? 'file-card is-focus' : 'file-card'} onClick={onClick}>
      <div className="file-card-media">
        {showVideo ? (
          <video ref={videoRef} src={focused ? fullSrc(file.id) : thumbSrc(file.id)}
            poster={posterSrc(file.id)} muted={focused ? muted : true} loop playsInline />
        ) : (
          <img src={posterSrc(file.id)} alt={file.name} />
        )}
      </div>
      <div className="file-card-label">
        <span>FILE_{file.index} <span className="tw-dim">// {file.name}.{file.ext}</span></span>
        <span className="tw-dim">{file.duration}</span>
      </div>
    </button>
  )
}
```

```tsx
// src/components/ArchiveGrid.tsx  (grid + pager; focus lands in Task 6)
import { useMemo, useState } from 'react'
import { ARCHIVE } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { paginate } from '../lib/paginate'
import type { PerfTier } from '../lib/perfTier'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import FileCard from './FileCard'

export default function ArchiveGrid({ tier }: { tier: PerfTier }) {
  const director = useMemo(() => new VideoDirector(4), [])
  const perPage = useCardsPerPage()
  const pages = useMemo(() => paginate(ARCHIVE, perPage), [perPage])
  const [page, setPage] = useState(0)
  const safePage = Math.min(page, pages.length - 1)

  return (
    <div className="panel archive-grid" data-focused="">
      <div className="grid-cards">
        {pages[safePage].map((f) => (
          <FileCard key={f.id} file={f} director={director} tier={tier}
            focused={false} muted onClick={() => {}} />
        ))}
      </div>
      {pages.length > 1 && (
        <div className="grid-pager">
          <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}>◄</button>
          <span>{String(safePage + 1).padStart(2, '0')}/{String(pages.length).padStart(2, '0')}</span>
          <button aria-label="Next page" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}>►</button>
        </div>
      )}
    </div>
  )
}
```

In `src/App.tsx`, replace `{tab === 'archive' && <div className="panel">ARCHIVE LOADING…</div>}` with `{tab === 'archive' && <ArchiveGrid tier={tier} />}` and add the import.

- [ ] **Step 3: Add grid styles**

```css
/* ── archive grid ── */
.archive-grid { display: flex; flex-direction: column; }
.grid-cards {
  flex: 1 1 auto; min-height: 0;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; gap: 12px;
}
@media (max-width: 1024px) { .grid-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .grid-cards { grid-template-columns: 1fr; } }

.file-card {
  display: flex; flex-direction: column; min-height: 0; text-align: left;
  border: 1px solid var(--hair); background: var(--panel-solid);
}
.file-card:hover { border-color: var(--hair-bright); }
.file-card-media { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.file-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.file-card-label {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 8px 10px; font-size: 10px; letter-spacing: 0.04em;
  border-top: 1px solid var(--hair); color: var(--text); flex: 0 0 auto;
}

.grid-pager {
  display: flex; align-items: center; gap: 14px; justify-content: center;
  padding-top: 10px; flex: 0 0 auto; font-size: 11px; color: var(--dim);
}
.grid-pager button { color: var(--text); padding: 2px 8px; border: 1px solid var(--hair); }
.grid-pager button:hover { color: var(--acid); border-color: var(--acid); }
```

- [ ] **Step 4: Run all tests, verify pass**

Run: `npm test && npm run e2e`
Expected: vitest PASS; e2e PASS on all 3 projects (mobile shows 3 cards + pager `01/02`; desktop shows 6, no pager).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add archive grid with file cards, pager, and capped tiered playback"
```

---

### Task 6: FLIP focus stage — zoom on click, reshuffle, sound toggle

**Files:**
- Modify: `src/components/ArchiveGrid.tsx`, `src/components/FileCard.tsx` (metadata overlay), `src/index.css`
- Test: `tests/e2e/focus.spec.ts`

**Interfaces:**
- Consumes: `captureRects/playFlip` (Task 3), `director.setFocus`.
- Produces: grid root `data-focused` attribute carries the focused file id (empty string when none). Focused card class `is-focus`. Controls: `aria-label="Close file"`, `aria-label="Toggle sound"`. Esc key clears focus.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/focus.spec.ts
import { test, expect } from '@playwright/test'

test('clicking a card zooms it to focus; Esc returns it', async ({ page }) => {
  await page.goto('./')
  const first = page.locator('[data-card]').first()
  const before = await first.boundingBox()
  await first.click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', /file\d+/)
  await page.waitForTimeout(500) // FLIP settles
  const after = await page.locator('[data-card].is-focus').boundingBox()
  expect(after!.width).toBeGreaterThan(before!.width * 1.5)
  await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', '')
})

test('focused video uses the full-res source', async ({ page }) => {
  await page.goto('./')
  await page.locator('[data-card]').first().click()
  await page.waitForTimeout(300)
  const src = await page.locator('[data-card].is-focus video').getAttribute('src')
  expect(src).toContain('_full.mp4')
})
```

Run: `npm run e2e -- focus.spec.ts` → Expected: FAIL.

- [ ] **Step 2: Implement focus in `ArchiveGrid.tsx`**

Full replacement:

```tsx
import { useMemo, useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react'
import { ARCHIVE, type ArchiveFile } from '../data/archive'
import { VideoDirector } from '../lib/videoDirector'
import { paginate } from '../lib/paginate'
import { captureRects, playFlip } from '../lib/flip'
import type { PerfTier } from '../lib/perfTier'
import { useCardsPerPage } from '../hooks/useCardsPerPage'
import FileCard from './FileCard'

export default function ArchiveGrid({ tier }: { tier: PerfTier }) {
  const director = useMemo(() => new VideoDirector(4), [])
  const perPage = useCardsPerPage()
  const pages = useMemo(() => paginate(ARCHIVE, perPage), [perPage])
  const [page, setPage] = useState(0)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [muted, setMuted] = useState(true)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const pendingRects = useRef<Map<HTMLElement, DOMRect> | null>(null)
  const safePage = Math.min(page, pages.length - 1)

  const cardEls = useCallback(
    () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-card]') ?? []),
    [],
  )

  const setFocus = (id: string | null) => {
    pendingRects.current = captureRects(cardEls())
    setFocusedId(id)
    setMuted(true)
    director.setFocus(id)
  }

  useLayoutEffect(() => {
    if (!pendingRects.current) return
    playFlip(pendingRects.current, cardEls())
    pendingRects.current = null
  }, [focusedId, cardEls])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocus(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const focusedFile: ArchiveFile | undefined = ARCHIVE.find((f) => f.id === focusedId)

  return (
    <div className={focusedId ? 'panel archive-grid has-focus' : 'panel archive-grid'}
      data-focused={focusedId ?? ''} ref={rootRef}>
      <div className="grid-cards">
        {pages[safePage].map((f) => (
          <FileCard key={f.id} file={f} director={director} tier={tier}
            focused={f.id === focusedId} muted={muted}
            onClick={() => setFocus(f.id === focusedId ? null : f.id)} />
        ))}
      </div>
      {focusedFile && (
        <div className="focus-hud">
          <span className="focus-meta">
            FILE_{focusedFile.index} // {focusedFile.name}.{focusedFile.ext}
            <span className="tw-dim"> · {focusedFile.tagline.toUpperCase()} · {focusedFile.year}</span>
          </span>
          <span className="focus-controls">
            <button aria-label="Toggle sound" onClick={() => setMuted((m) => !m)}>
              {muted ? 'SND OFF' : 'SND ON'}
            </button>
            <button aria-label="Close file" onClick={() => setFocus(null)}>CLOSE [ESC]</button>
          </span>
        </div>
      )}
      {pages.length > 1 && !focusedId && (
        <div className="grid-pager">
          <button aria-label="Previous page" onClick={() => setPage((p) => Math.max(0, p - 1))}>◄</button>
          <span>{String(safePage + 1).padStart(2, '0')}/{String(pages.length).padStart(2, '0')}</span>
          <button aria-label="Next page" onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}>►</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add focus-mode CSS** (grid re-layout the FLIP animates between)

```css
/* focus mode: focused card becomes the stage, others form a strip below */
.archive-grid.has-focus .grid-cards {
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: 1fr auto;
}
.archive-grid.has-focus .file-card { grid-row: 2; aspect-ratio: 16 / 10; }
.archive-grid.has-focus .file-card.is-focus {
  grid-row: 1; grid-column: 1 / -1; aspect-ratio: auto;
  border-color: var(--acid);
}
.file-card.is-focus .file-card-label { color: var(--bright); }

/* BRT-style corner brackets on the focus stage (spec: bracketed panel outlines) */
.file-card.is-focus { position: relative; }
.file-card.is-focus::before, .file-card.is-focus::after {
  content: ''; position: absolute; width: 14px; height: 14px; z-index: 2; pointer-events: none;
}
.file-card.is-focus::before { top: -1px; left: -1px; border-top: 2px solid var(--acid); border-left: 2px solid var(--acid); }
.file-card.is-focus::after { bottom: -1px; right: -1px; border-bottom: 2px solid var(--acid); border-right: 2px solid var(--acid); }

.focus-hud {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding-top: 10px; flex: 0 0 auto; font-size: 11px;
}
.focus-controls { display: flex; gap: 8px; }
.focus-controls button { border: 1px solid var(--hair); padding: 4px 10px; }
.focus-controls button:hover { color: var(--acid); border-color: var(--acid); }

@media (max-width: 640px) {
  .archive-grid.has-focus .grid-cards { grid-template-columns: repeat(2, 1fr); }
  .archive-grid.has-focus .file-card:not(.is-focus) { display: none; } /* stage takes the whole window on mobile */
  .archive-grid.has-focus .file-card.is-focus { grid-column: 1 / -1; grid-row: 1 / -1; }
}
```

- [ ] **Step 4: Run all tests, verify pass**

Run: `npm test && npm run e2e`
Expected: all PASS. Watch for StrictMode double-mount noise in the director (register/unregister pairs are idempotent — the tests from Task 3 guarantee slot recovery).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add FLIP focus stage with full-res swap, sound toggle, Esc close"
```

---

### Task 7: Boot sequence + home notification

**Files:**
- Create: `src/components/BootSequence.tsx`, `src/components/HomeNotification.tsx`
- Modify: `src/App.tsx`, `src/index.css`
- Test: `tests/e2e/boot.spec.ts`

**Interfaces:**
- Consumes: `createTimeline, stagger, animate` from animejs.
- Produces: `.stage` gets `data-booted="true"` only after boot completes; notification root `[data-notification]` with dismiss button `aria-label="Acknowledge"`; bell (`ALERT [1]`, Task 4) reopens it.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/boot.spec.ts
import { test, expect } from '@playwright/test'

test('boot runs, notification pops, dismisses, and bell re-summons it', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const notice = page.locator('[data-notification]')
  await expect(notice).toBeVisible()
  await expect(notice.getByText('INCOMING TRANSMISSION')).toBeVisible()
  await notice.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(notice).toHaveCount(0)
  await page.getByRole('button', { name: 'Show notification' }).click()
  await expect(page.locator('[data-notification]')).toBeVisible()
})
```

Run: `npm run e2e -- boot.spec.ts` → Expected: FAIL (notification never appears).

- [ ] **Step 2: Implement**

```tsx
// src/components/BootSequence.tsx
import { useEffect, useRef } from 'react'
import { createTimeline, stagger } from 'animejs'

const LINES = [
  '> SEVEREDARCHIVE OS v2.6',
  '> MOUNTING /ARCHIVE ................ OK',
  '> 6 FILES INDEXED',
  '> RENDER NODES: CONNECTED',
  '> SESSION OPEN',
]

export default function BootSequence({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (!ref.current || done.current) return
    done.current = true
    const rows = ref.current.querySelectorAll('.boot-line')
    const tl = createTimeline({ defaults: { ease: 'linear' } })
    tl.add(rows, { opacity: [0, 1], duration: 60, delay: stagger(140) })
      .add(ref.current, { opacity: [1, 0], duration: 180 }, '+=350')
    tl.then(onDone)
  }, [onDone])

  return (
    <div className="boot" ref={ref} aria-hidden="true">
      {LINES.map((l) => (
        <div key={l} className="boot-line">{l}</div>
      ))}
    </div>
  )
}
```

```tsx
// src/components/HomeNotification.tsx
import { useEffect, useRef } from 'react'
import { animate } from 'animejs'

export default function HomeNotification({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (ref.current)
      animate(ref.current, { opacity: [0, 1], translateY: [10, 0], scale: [0.96, 1], duration: 380, ease: 'outExpo' })
  }, [])

  const dismiss = () => {
    if (!ref.current) return onDismiss()
    animate(ref.current, { opacity: [1, 0], scale: [1, 0.97], duration: 160, ease: 'inQuad', onComplete: onDismiss })
  }

  return (
    <div className="notification" data-notification ref={ref} role="alertdialog" aria-label="Incoming transmission">
      <div className="notification-head">
        <span className="notification-dot" />
        INCOMING TRANSMISSION
      </div>
      <div className="notification-body">
        <p className="panel-big">SEVEREDARCHIVE</p>
        <p className="tw-dim">MOTION + VISUAL ART // RENDERS SET TO SOUND</p>
      </div>
      <button className="notification-ack" aria-label="Acknowledge" onClick={dismiss}>
        [ ACKNOWLEDGE ]
      </button>
    </div>
  )
}
```

`src/App.tsx` — wire the states (final App shape):

```tsx
import { useRef, useState } from 'react'
import { animate } from 'animejs'
import BackgroundVideo from './components/BackgroundVideo'
import TerminalWindow, { type TabId } from './components/TerminalWindow'
import ArchiveGrid from './components/ArchiveGrid'
import AboutPanel from './components/AboutPanel'
import LinksPanel from './components/LinksPanel'
import BootSequence from './components/BootSequence'
import HomeNotification from './components/HomeNotification'
import { readPerfTier } from './lib/perfTier'

export default function App() {
  const [tier] = useState(readPerfTier)
  const [booted, setBooted] = useState(false)
  const [tab, setTabState] = useState<TabId>('archive')
  const [noticeOpen, setNoticeOpen] = useState(true)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const setTab = (t: TabId) => {
    setTabState(t)
    if (bodyRef.current) animate(bodyRef.current, { opacity: [0.15, 1], duration: 180, ease: 'outQuad' })
  }

  return (
    <div className="stage" data-tier={tier} data-booted={booted ? 'true' : 'false'}>
      <BackgroundVideo tier={tier} />
      <div className="glass-strip top" /><div className="glass-strip bottom" />
      <div className="glass-strip left" /><div className="glass-strip right" />
      {!booted ? (
        <BootSequence onDone={() => setBooted(true)} />
      ) : (
        <>
          <TerminalWindow tab={tab} onTab={setTab} onBell={() => setNoticeOpen(true)} bodyRef={bodyRef}>
            {tab === 'archive' && <ArchiveGrid tier={tier} />}
            {tab === 'about' && <AboutPanel />}
            {tab === 'links' && <LinksPanel />}
          </TerminalWindow>
          {noticeOpen && <HomeNotification onDismiss={() => setNoticeOpen(false)} />}
        </>
      )}
    </div>
  )
}
```

CSS additions:

```css
/* ── boot ── */
.boot { position: absolute; inset: var(--frame); z-index: 3; padding: 24px; background: var(--panel-solid); border: 1px solid var(--hair-bright); font-size: 12px; }
.boot-line { opacity: 0; margin-bottom: 4px; color: var(--text); }

/* ── notification ── */
.notification {
  position: absolute; z-index: 5; width: min(360px, calc(100vw - 2 * var(--frame) - 24px));
  top: calc(var(--frame) + 54px); right: calc(var(--frame) + 14px);
  background: var(--panel-solid); border: 1px solid var(--hair-bright); opacity: 0;
}
.notification-head {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--hair-bright); font-size: 11px; color: var(--bright);
}
.notification-dot { width: 8px; height: 8px; background: var(--alert); flex: 0 0 auto; }
.notification-body { padding: 14px 12px; font-size: 11px; }
.notification-ack {
  display: block; width: 100%; padding: 10px 12px; text-align: center;
  border-top: 1px solid var(--hair-bright); color: var(--acid); font-size: 11px; letter-spacing: 0.08em;
}
.notification-ack:hover { background: rgba(182, 255, 46, 0.07); }
@media (max-width: 640px) {
  .notification { left: 50%; right: auto; transform: translateX(-50%); top: 30%; }
}
```

Note: existing e2e specs interact after boot; boot lasts ~1.3s and Playwright auto-waits on visibility, so earlier specs should still pass — if any spec times out on first paint, add `await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true')` at its top.

- [ ] **Step 3: Run all tests, verify pass**

Run: `npm test && npm run e2e`
Expected: all PASS across 3 viewports.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add boot sequence and incoming-transmission home notification"
```

---

### Task 8: Mobile-specific layout + polish pass

**Files:**
- Modify: `src/index.css` (mobile block), `src/components/TerminalWindow.tsx` (no structural change expected — CSS-driven)
- Test: `tests/e2e/responsive.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: at ≤640px — `--frame: 10px`, tab row pinned to window bottom as a full-width thumb bar, title bar compressed, footer hidden; still zero scroll.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/responsive.spec.ts
import { test, expect } from '@playwright/test'

test('mobile: bottom tab bar, no scroll, focus fills window', async ({ page, viewport }) => {
  test.skip(viewport!.width > 640, 'mobile-only assertions')
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.getByRole('button', { name: 'Acknowledge' }).click()
  const tabs = await page.locator('.tw-tabs').boundingBox()
  const win = await page.locator('.terminal-window').boundingBox()
  expect(tabs!.y + tabs!.height).toBeGreaterThan(win!.y + win!.height - 60) // tabs at window bottom
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(scroll).toBeLessThanOrEqual(1)
})
```

Run: `npm run e2e -- responsive.spec.ts --project=mobile` → Expected: FAIL (tabs still at top).

- [ ] **Step 2: Implement the mobile block in `src/index.css`**

```css
/* ── mobile: purpose-built layout ── */
@media (max-width: 640px) {
  :root { --frame: 10px; }
  .tw-titlebar { height: 38px; font-size: 11px; }
  .tw-footer { display: none; }
  .terminal-window { flex-direction: column; }
  .tw-tabs { order: 3; padding: 0; border-top: 1px solid var(--hair-bright); }
  .tw-tab { flex: 1 1 0; text-align: center; padding: 13px 0; border: 0; margin: 0; background: transparent; }
  .tw-tab.is-active { background: rgba(182, 255, 46, 0.06); }
  .tw-body { order: 2; margin: 10px 10px 0; }
  .panel { padding: 12px; }
  .panel-block { padding: 10px 12px; }
}
```

- [ ] **Step 3: Full run + visual check at all three widths**

Run: `npm test && npm run e2e`
Then capture headless screenshots for a human look:

```bash
npx playwright test --project=desktop --project=tablet --project=mobile
mkdir -p shots
for v in "1440,900,desktop" "768,1024,tablet" "390,844,mobile"; do IFS=, read w h n <<< "$v"; \
  npx playwright screenshot --viewport-size="$w,$h" --wait-for-timeout=4000 \
  "http://localhost:4173/severedarchive/" "shots/$n.png"; done
```

(Requires the preview server running: `npm run build && npm run preview -- --port 4173 &`.) Inspect the three PNGs — verify glass margins, tab placement, grid density, notification position. Fix anything visually broken before committing. `shots/` goes in `.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add purpose-built mobile layout with bottom tab bar"
```

---

### Task 9: Full verification sweep

**Files:**
- Modify: whatever the sweep flags (fixes only — no new features)

- [ ] **Step 1: Run the complete suite**

Run: `npm test && npm run e2e`
Expected: every vitest + every e2e spec passes on desktop, tablet, and mobile projects.

- [ ] **Step 2: Performance sanity**

- `du -sh dist` after `npm run build` — JS bundle (excluding media) should be < 250 KB gzipped; check with `npx vite-bundle-visualizer` only if it looks bloated.
- In a headless page, confirm playing-video count ≤ 5 on archive, ≤ 2 on about/links (bg + focused only), via the same `!v.paused` evaluate used in `archive.spec.ts`.
- Confirm `[data-tier='lite']` path renders posters: emulate with `page.emulateMedia({ reducedMotion: 'reduce' })` in a scratch spec or a manual evaluate — grid `<img>` count should equal card count, and `.glass-strip` computed `backdrop-filter` should be `none`.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "Verification sweep fixes"
```

---

### Task 10: Deploy to GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy to Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write a short `README.md`** — what the site is, `npm run dev`, how to swap real videos (drop mp4s in `raw/`, edit `src/data/archive.ts`, run `scripts/process-media.sh`), live URL.

- [ ] **Step 3: Create repo and push** (NO Claude attribution anywhere)

```bash
git add -A && git commit -m "Add Pages deploy workflow and README"
gh repo create decoy-dev/severedarchive --public --source=. --push
gh api -X POST repos/decoy-dev/severedarchive/pages -f build_type=workflow 2>/dev/null || true
gh run watch --repo decoy-dev/severedarchive --exit-status
```

- [ ] **Step 4: Verify live**

```bash
curl -sI https://decoy-dev.github.io/severedarchive/ | head -3
```

Expected: `HTTP/2 200`. Then run one headless Playwright pass against the live URL:

```bash
PW_BASE_URL=https://decoy-dev.github.io/severedarchive/ npx playwright test tests/e2e/smoke.spec.ts --project=desktop
```

(If the config doesn't read `PW_BASE_URL`, add `use: { baseURL: process.env.PW_BASE_URL ?? 'http://localhost:4173/severedarchive/' }` — one-line change.)

- [ ] **Step 5: Final commit if anything changed**

```bash
git add -A && git commit -m "Post-deploy adjustments" && git push
```
