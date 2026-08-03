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
