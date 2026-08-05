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
    await win.getByRole('button', { name: /^Close \w+\.MP4$/ }).click()
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

  test('the refusal NEGATES the stage, which is what makes the type readable', async ({ page }) => {
    await boot(page)

    // Driven from the attribute rather than sampled off the live 450ms flash. The
    // sampled version measured how many frames this machine managed to render —
    // with three browsers running it rendered one, and the test failed for reasons
    // that had nothing to do with the app. The attribute IS the contract: Desktop
    // sets it, `.stage:has()` reacts, and the animation is what must contain the
    // inversion.
    // The keyframes are read from the STYLESHEET, not sampled off the live
    // 450ms flash: under parallel workers the sampler's frames can all land
    // after the animation has ended, and a test that depends on how fast this
    // machine renders is testing the machine. The rule is the behaviour.
    const negate = await page.evaluate(() => {
      const stage = document.querySelector('.stage')!
      const desktop = document.querySelector('.desktop')!
      desktop.setAttribute('data-refusing', 'true')
      const name = getComputedStyle(stage).animationName
      desktop.removeAttribute('data-refusing')
      const frames: string[] = []
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSKeyframesRule && rule.name === name) {
            for (const kf of rule.cssRules) frames.push((kf as CSSKeyframeRule).style.filter)
          }
        }
      }
      return { name, frames, atRest: getComputedStyle(stage).animationName }
    })
    expect(negate.name).not.toBe('none')
    expect(negate.atRest).toBe('none')
    expect(negate.frames.length).toBeGreaterThan(2)
    // `invert(` and not `invert(1)`: the production build's minifier drops the
    // argument (1 is the default), so the dev and built stylesheets spell the
    // same filter differently.
    expect(negate.frames.some((f) => f.includes('invert('))).toBe(true)
    // A brightness-led blowout is the version this replaced: it drove the stage to
    // near-white, and because the type resolves its `difference` blend INSIDE the
    // stage it was already white going in — at the peak the whole viewport was
    // white with no type in it at all. Brightness alone must never come back.
    expect(negate.frames.every((f) => f === 'none' || f.includes('invert'))).toBe(true)

    // And the type it is inverting: white, differenced, no outline propping it up.
    const type = await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'refusal-text'
      document.body.appendChild(el)
      const cs = getComputedStyle(el)
      const out = {
        colour: cs.color,
        blend: cs.mixBlendMode,
        stroke: cs.webkitTextStrokeWidth,
      }
      el.remove()
      return out
    })
    expect(type.colour).toBe('rgb(255, 255, 255)')
    expect(type.blend).toBe('difference')
    // Removed at the owner's request once the flash inverted properly.
    expect(type.stroke === '' || type.stroke === '0px').toBe(true)
  })

  // One row per aspect class. Indexes are 0-based against ARCHIVE's order.
  const ASPECTS: [string, number, number][] = [
    ['file01', 0, 1280 / 720],
    ['file08', 7, 406 / 720],
    ['file09', 8, 720 / 720],
    ['file10', 9, 540 / 720],
  ]

  test('every window is true-frame: the ratio is on the body, and the root is 42px taller', async ({ page }) => {
    await boot(page)
    for (const [id, row, ar] of ASPECTS) {
      await page.locator('[data-file-row]').nth(row).click()
      await page.waitForTimeout(600)
      const m = await page.evaluate((sel) => {
        const win = document.querySelector(`[data-file-window="${sel}"]`)!
        const body = win.querySelector('.fw-body')!
        const video = body.querySelector('video')!
        const w = win.getBoundingClientRect(), b = body.getBoundingClientRect(), v = video.getBoundingClientRect()
        return {
          bodyRatio: b.width / b.height,
          chrome: w.height - b.height,
          rootAspect: getComputedStyle(win).aspectRatio,
          videoBox: [v.width, v.height],
          bodyBox: [b.width, b.height],
        }
      }, id)
      expect(Math.abs(m.bodyRatio - ar) / ar, `${id} body ratio`).toBeLessThan(0.005)
      expect(m.chrome, `${id} window height is body + 42`).toBeCloseTo(42, 0)
      expect(m.rootAspect, `${id} root must not carry aspect-ratio`).toBe('auto')
      // No pillarboxing and no letterboxing: the media box IS the body box.
      expect(m.videoBox[0]).toBeCloseTo(m.bodyBox[0], 0)
      expect(m.videoBox[1]).toBeCloseTo(m.bodyBox[1], 0)
      await page.locator(`[data-file-window="${id}"] .fw-close`).click()
      await page.waitForTimeout(400)
    }
  })

  test('a freshly spawned window is fully inside the viewport, at both desktop widths', async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 861, height: 700 }]) {
      await page.setViewportSize(size)
      await boot(page)
      for (const [id, row] of ASPECTS) {
        await page.locator('[data-file-row]').nth(row).click()
        await page.waitForTimeout(500)
        const box = (await page.locator(`[data-file-window="${id}"]`).boundingBox())!
        expect(box.x, `${id} @${size.width} left`).toBeGreaterThanOrEqual(-0.5)
        expect(box.y, `${id} @${size.width} top`).toBeGreaterThanOrEqual(-0.5)
        expect(box.x + box.width, `${id} @${size.width} right`).toBeLessThanOrEqual(size.width + 0.5)
        expect(box.y + box.height, `${id} @${size.width} bottom`).toBeLessThanOrEqual(size.height + 0.5)
        await page.locator(`[data-file-window="${id}"] .fw-close`).click()
        await page.waitForTimeout(300)
      }
    }
  })

  test('a portrait window dragged into all four corners settles inside the viewport', async ({ page, viewport }) => {
    await boot(page)
    // file08 is 406x720 — the tall window the old single-corner landscape drag
    // test never exercised.
    await page.locator('[data-file-row]').nth(7).click()
    const win = page.locator('[data-file-window="file08"]')
    await expect(win).toHaveCount(1)
    const bar = win.locator('[data-drag-handle]')

    const corners: [number, number][] = [[-1600, -1600], [3000, -1600], [3000, 3000], [-1600, 3000]]
    for (const [tx, ty] of corners) {
      const start = (await bar.boundingBox())!
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
      await page.mouse.down()
      await page.mouse.move(tx, ty, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(1100)   // let the release spring settle

      const box = (await win.boundingBox())!
      // containerPadding lets a window hang 24px off the edge, no further
      expect(box.x + box.width, `right edge after ${tx},${ty}`).toBeGreaterThan(-25)
      expect(box.y + box.height, `bottom edge after ${tx},${ty}`).toBeGreaterThan(-25)
      expect(box.x, `left edge after ${tx},${ty}`).toBeLessThan(viewport!.width + 25)
      expect(box.y, `top edge after ${tx},${ty}`).toBeLessThan(viewport!.height + 25)
    }
  })

  test('a reopened window adopts the level it was closed at', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window="file01"]')
    await win.getByRole('button', { name: /^Volume \d+ percent$/ }).click()
    await win.locator('input[type="range"]').fill('60')
    await expect(win.locator('.vol-readout')).toHaveText('060')

    await win.locator('.fw-close').click()
    await expect(page.locator('[data-file-window]')).toHaveCount(0)

    await page.locator('[data-file-row]').first().click()
    await expect(win).toHaveCount(1)
    // the record outlives the placement, so the control hydrates from it
    await win.getByRole('button', { name: /^Volume \d+ percent$/ }).click()
    await expect(win.locator('.vol-readout')).toHaveText('060')
  })

  test('the refusal announces through a persistent live region', async ({ page }) => {
    await boot(page)
    const region = page.locator('[data-live-region]')
    await expect(region).toHaveCount(1)
    await expect(region).toHaveText('')
    const rows = page.locator('[data-file-row]')
    for (let i = 0; i < 3; i++) { await rows.nth(i).click(); await page.waitForTimeout(250) }
    await rows.nth(3).click()
    await expect(region).toHaveText(/Buffer full/i)
  })

  test('the terminal is a fixed panel, not a draggable window', async ({ page }) => {
    await boot(page)
    await page.waitForTimeout(500)   // the terminal's own draw-in scales to 1
    // binding ruling 7: no drag handle, so nothing can grab it
    await expect(page.locator('.terminal-window [data-drag-handle]')).toHaveCount(0)
    const before = (await page.locator('.terminal-window').boundingBox())!
    const bar = page.locator('.tw-titlebar')
    const start = (await bar.boundingBox())!
    await page.mouse.move(start.x + 200, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + 400, start.y + 300, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    const after = (await page.locator('.terminal-window').boundingBox())!
    expect(after.x).toBeCloseTo(before.x, 0)
    expect(after.y).toBeCloseTo(before.y, 0)
  })

  test('closing a window pulls it back into the background before it goes', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)
    // Sampled in the page, on its own frames. The whole close is ~360ms, and a
    // locator round trip per sample is slower than that — driven from the test
    // side the window is simply gone before the first measurement lands.
    const frames = await page.evaluate(async () => {
      const el = document.querySelector('[data-file-window]') as HTMLElement
      const box = () => {
        const b = el.getBoundingClientRect()
        return { w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }
      }
      const first = box()
      document.querySelector<HTMLElement>('.fw-close')!.click()
      const samples: (ReturnType<typeof box> & {
        receding: boolean; opacity: number; blur: number
      })[] = []
      await new Promise<void>((done) => {
        const tick = () => {
          if (!el.isConnected) { done(); return }
          // Frames before React has committed the attribute are not part of the
          // animation and must not be measured as if they were — the first rAF
          // after a click can land on either side of that commit.
          if (el.dataset.receding !== 'true' && samples.length === 0) {
            requestAnimationFrame(tick); return
          }
          const cs = getComputedStyle(el)
          samples.push({
            ...box(),
            receding: el.dataset.receding === 'true',
            opacity: Number(cs.opacity),
            blur: Number(/blur\(([\d.]+)px\)/.exec(cs.filter)?.[1] ?? 0),
          })
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      return { first, samples }
    })

    // Deferred, not faked: the window stays mounted and receding while it plays,
    // rather than being unmounted and animated by something standing in for it.
    // One frame is enough to prove the mechanism, and one frame is all a loaded
    // machine will give: the curve's shape is covered by `recede.test.ts`, which is
    // deterministic. What this can only check in a browser is that the window is
    // really being transformed, blurred and held in place while it goes.
    expect(frames.samples.length).toBeGreaterThan(0)
    expect(frames.samples.every((s) => s.receding)).toBe(true)

    // It shrinks toward its own centre — smaller on both axes, and still centred
    // where it stood. A window sliding or fading in place would pass a size-only
    // check, so the centre is asserted too.
    // The furthest frame that was actually rendered, whichever it was.
    const last = frames.samples.reduce((a, b) => (b.w < a.w ? b : a))
    expect(last.w).toBeLessThan(frames.first.w)
    expect(last.h).toBeLessThan(frames.first.h)
    for (const s of frames.samples) {
      expect(s.cx).toBeCloseTo(frames.first.cx, 0)
      expect(s.cy).toBeCloseTo(frames.first.cy, 0)
      expect(s.w).toBeLessThanOrEqual(frames.first.w + 0.5)
    }
    // The fade trails the shrink: it has to stay solid long enough to be seen
    // travelling, or it is a crossfade with extra steps.
    // Still solid while it is still large: a panel that has faded most of the way
    // out before it has shrunk is a crossfade with extra steps.
    const early = frames.samples[0]
    expect(early.opacity).toBeGreaterThan(0.5)

    // And it diffuses as it goes. Without this the panel stays a crisp rectangle
    // the whole way out, which reads as an element being scaled rather than as
    // something going away from you.
    expect(last.blur).toBeGreaterThan(0)
    expect(last.blur).toBeGreaterThanOrEqual(early.blur)

    // Nothing in a closing window is pressable, and then it goes.
    expect(await page.evaluate(() => {
      const el = document.querySelector('[data-file-window]')
      return el ? getComputedStyle(el).pointerEvents : 'gone'
    })).toMatch(/none|gone/)
    await expect(win).toHaveCount(0, { timeout: 3000 })
  })

  test('a window enlarges to fill the browser window and comes back down', async ({ page, viewport }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)
    const cascade = (await win.boundingBox())!

    const scale = win.getByRole('button', { name: /^Enlarge / })
    await scale.click()
    await expect(win).toHaveAttribute('data-enlarged', 'true')
    // The lock-on FLIP maps the window back onto its OLD box at progress 0 —
    // measured mid-beat, an enlarged window is exactly cascade-sized, which is
    // the whole point of a FLIP. Geometry is asserted after it lands.
    await expect(win).not.toHaveAttribute('data-locking', 'true', { timeout: 2000 })

    // Fills one axis exactly and is centred on the other: the largest box the
    // viewport will take at the file's own ratio. True-frame holds at viewport
    // scale — grown, never stretched, never barred.
    const big = (await win.boundingBox())!
    expect(big.width).toBeGreaterThan(cascade.width)
    const fillsWidth = big.width >= viewport!.width - 4
    const fillsHeight = big.height >= viewport!.height - 4
    expect(fillsWidth || fillsHeight).toBe(true)
    expect(big.x + big.width / 2).toBeCloseTo(viewport!.width / 2, 0)
    expect(big.y + big.height / 2).toBeCloseTo(viewport!.height / 2, 0)

    // The same control, now offering the way back.
    await win.getByRole('button', { name: /^Restore / }).click()
    await expect(win).not.toHaveAttribute('data-enlarged', 'true')
    await expect(win).not.toHaveAttribute('data-locking', 'true', { timeout: 2000 })
    const back = (await win.boundingBox())!
    expect(back.width).toBeCloseTo(cascade.width, 0)
    expect(back.x).toBeCloseTo(cascade.x, 0)
    expect(back.y).toBeCloseTo(cascade.y, 0)
  })

  test('an enlarged window darkens and blurs everything behind it', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const desktop = page.locator('.desktop')
    // Generated only while a window is enlarged: an always-present full-viewport
    // backdrop-filter surface costs GPU work on every frame of a page already
    // playing several videos.
    const scrim = () => page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.desktop')!, '::after')
      return { content: cs.content, backdrop: cs.backdropFilter, bg: cs.backgroundColor, z: cs.zIndex }
    })
    expect((await scrim()).content).toBe('none')

    await page.locator('[data-file-window]').getByRole('button', { name: /^Enlarge / }).click()
    await expect(desktop).toHaveAttribute('data-enlarged', 'true')
    const up = await scrim()
    expect(up.content).not.toBe('none')
    expect(up.backdrop).toContain('blur')
    // Darkened as well as blurred — the other windows are glass and would keep
    // competing at full contrast beside a full-screen picture.
    expect(up.bg).toMatch(/rgba\(3, 5, 7, 0\.5/)
    // Under the enlarged window (60), over everything else.
    expect(Number(up.z)).toBe(59)

    await page.locator('[data-file-window]').getByRole('button', { name: /^Restore / }).click()
    await expect(desktop).not.toHaveAttribute('data-enlarged', 'true')
    expect((await scrim()).content).toBe('none')
  })

  test('a full desktop freezes the backdrop, and enlarging leaves one decode', async ({ page }) => {
    await boot(page)
    const rows = page.locator('[data-file-row]')

    // Playing at rest: the backdrop is what the glass samples, and it moves.
    const atRest = await page.evaluate(async () => {
      const v = document.querySelector<HTMLVideoElement>('.bg-video video')!
      const t0 = v.currentTime
      await new Promise((r) => setTimeout(r, 900))
      return { advanced: v.currentTime - t0, holding: document.querySelector('.bg-video')!.getAttribute('data-holding') }
    })
    expect(atRest.holding).toBeNull()
    expect(atRest.advanced).toBeGreaterThan(0.2)

    for (let i = 0; i < 3; i++) {
      await rows.nth(i).click()
      await page.waitForTimeout(400)
    }
    await expect(page.locator('[data-file-window]')).toHaveCount(3)

    // At the cap it holds its frame. Asserted on the CLOCK, not on the attribute:
    // the first version of this set the flag and kept playing anyway, because the
    // pause landed before the element had data and `autoPlay` started it after.
    const full = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 400))
      const v = document.querySelector<HTMLVideoElement>('.bg-video video')!
      const t0 = v.currentTime
      await new Promise((r) => setTimeout(r, 900))
      return { advanced: v.currentTime - t0, paused: v.paused }
    })
    expect(full.paused).toBe(true)
    expect(full.advanced).toBe(0)

    // Enlarged, only the window being looked at decodes: the rest are behind an
    // opaque picture and a blurred scrim.
    await page.locator('[data-file-window]').first().getByRole('button', { name: /^Enlarge / }).click()
    await expect(page.locator('.desktop')).toHaveAttribute('data-enlarged', 'true')
    await page.waitForTimeout(500)
    const playing = await page.evaluate(() =>
      [...document.querySelectorAll('video')].filter((v) => !v.paused).length)
    expect(playing).toBe(1)

    // And it all comes back.
    await page.locator('[data-file-window]').first().getByRole('button', { name: /^Restore / }).click()
    await page.locator('.fw-close').first().click()
    await expect(page.locator('[data-file-window]')).toHaveCount(2, { timeout: 3000 })
    const thawed = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 500))
      const v = document.querySelector<HTMLVideoElement>('.bg-video video')!
      const t0 = v.currentTime
      await new Promise((r) => setTimeout(r, 900))
      return v.currentTime - t0
    })
    expect(thawed).toBeGreaterThan(0.2)
  })

  test('Esc brings an enlarged window down first, and only then closes it', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await win.getByRole('button', { name: /^Enlarge / }).click()
    await expect(win).toHaveAttribute('data-enlarged', 'true')

    // One press must not do both — that is the whole reason the state is Desktop's.
    await page.keyboard.press('Escape')
    await expect(win).toHaveCount(1)
    await expect(win).not.toHaveAttribute('data-enlarged', 'true')
    await page.keyboard.press('Escape')
    await expect(win).toHaveCount(0, { timeout: 3000 })
  })
})
