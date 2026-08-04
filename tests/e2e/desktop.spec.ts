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

  test('closing a window dissolves it before it goes', async ({ page }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)

    await page.locator('.fw-close').click()
    // Deferred, not faked: the window is still mounted, being clipped apart, and
    // the media inside it has not been reconciled away yet. The clip is what
    // makes the whole panel come apart rather than an overlay filling it in —
    // CSS has no `destination-out` blend mode to punch through with.
    const closing = page.locator('[data-file-window][data-dissolving]')
    await expect(closing).toHaveCount(1)
    await expect(closing).toHaveCSS('clip-path', /^path\(evenodd,/)
    // Nothing in a closing window is pressable.
    await expect(page.locator('[data-file-window][data-dissolving]')).toHaveCSS('pointer-events', 'none')
    // And then it goes.
    await expect(win).toHaveCount(0, { timeout: 3000 })
  })
})
