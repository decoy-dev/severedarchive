import { test, expect } from '@playwright/test'
import { ready } from './helpers'

/**
 * Slice D's proving test. Below the 861px split there are no windows at all —
 * selection alone drives one primary player — and the horizontal overflow the
 * row needs must stay inside the row, because the stage clips and a page that
 * scrolled sideways would take the whole desktop with it.
 */
test.describe('mobile archive', () => {
  test.skip(({ viewport }) => viewport!.width >= 861, 'the mobile row is the surface below the split')

  test('tapping a tile then swiping the player advances selection, and opens no windows', async ({ page }) => {
    await ready(page)

    const primary = page.locator('[data-primary-view]')
    await expect(primary).toBeVisible()

    // Tile 2 → file02. The activation policy resolves this to selection only.
    await page.locator('[data-file-tile]').nth(1).click()
    await expect(primary.locator('video')).toHaveAttribute('src', /file02_full\.mp4$/)

    // Swipe left = advance. `useSwipe` ignores mouse pointers by design, so the
    // gesture has to arrive as a real touch pointer rather than page.mouse.
    const box = (await primary.boundingBox())!
    const y = box.y + box.height / 2
    await primary.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + box.width - 20, clientY: y })
    await primary.dispatchEvent('pointerup', { pointerType: 'touch', clientX: box.x + 20, clientY: y })

    // The primary player is a real <video> at every tier — 390px is always the
    // lite tier, and the ruling in §4.2 is that lite changes which encode and
    // how many decodes, never whether the content exists.
    const video = primary.locator('video')
    await expect(video).toHaveCount(1)
    await expect(video).toHaveAttribute('src', /file03_full\.mp4$/)

    // …and on lite it is the ONLY decode on the page: lite spends its single
    // decode on the surface the viewer is looking at, and every other surface —
    // including the backdrop — falls back to a poster. The 390px project is
    // always lite; the 768px one is not, and there the backdrop is a video too.
    if ((await page.locator('.stage').getAttribute('data-tier')) === 'lite') {
      const sourced = await page.evaluate(
        () => [...document.querySelectorAll('video')].filter((v) => v.getAttribute('src')).length,
      )
      expect(sourced).toBe(1)
    }

    await expect(page.locator('[data-file-window]')).toHaveCount(0)
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0)
    expect(await page.evaluate(() => document.scrollingElement!.scrollLeft)).toBe(0)
  })

  test('the row is the only thing that scrolls sideways', async ({ page }) => {
    await ready(page)
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        page: doc.scrollWidth - doc.clientWidth,
        row: (() => {
          const el = document.querySelector('.mobile-row')!
          return el.scrollWidth - el.clientWidth
        })(),
      }
    })
    expect(overflow.page).toBeLessThanOrEqual(1)
    expect(overflow.row).toBeGreaterThan(0) // 12 files do not fit 390px
  })
})

test.describe('mobile chrome', () => {
  test.skip(({ viewport }) => viewport!.width > 640, 'mobile-only')

  test('the panel cuts the wordmark in half, and the build stamp is gone', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })

    // The panel used to start at y10 against a wordmark running y4–30, hiding
    // it almost entirely. It is positioned against the panel's top edge now, so
    // FILE SYSTEM crosses the word's middle — the same on desktop and here,
    // rather than depending on whatever the frame happens to be.
    const [mark, panel] = await Promise.all([
      page.locator('.wordmark').boundingBox(),
      page.locator('.terminal-window').boundingBox(),
    ])
    const cut = (panel!.y - mark!.y) / mark!.height
    // Tolerance to match the resolution: the mark is 26px tall at 390px, so a
    // single pixel of rounding is nearly 4% of it.
    expect(cut).toBeGreaterThan(0.43)
    expect(cut).toBeLessThan(0.57)

    // The stamp sat behind the tab bar down here and could not be read anyway.
    await expect(page.locator('.build-tag')).toBeHidden()
  })

  test('every tile carries its media-kind glyph', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
    // A 56px poster has no room for a caption, so the glyph is the only thing
    // telling a still from a clip in this view.
    await expect(page.locator('.mobile-tile .kind-icon')).toHaveCount(12)
  })
})
