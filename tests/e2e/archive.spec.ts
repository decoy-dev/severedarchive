import { test, expect } from '@playwright/test'
import { gotoGrid } from './helpers'

test('archive shows the exact per-breakpoint card count, with the pager always present', async ({ page, viewport }) => {
  await gotoGrid(page)
  const width = viewport!.width
  const expectedPerPage = width <= 640 ? 3 : width <= 1024 ? 4 : 6
  const cards = page.locator('[data-card]')
  await expect(cards.first()).toBeVisible()
  await expect(cards).toHaveCount(expectedPerPage)
  await expect(page.getByText('FILE_001')).toBeVisible()

  // 12 archive files now exceed the per-page count at every breakpoint, so the
  // pager always shows (it used to hide on desktop when 6 files fit one page).
  await expect(page.locator('.grid-pager')).toBeVisible()
})

test('no more videos playing than the cap allows', async ({ page }) => {
  await gotoGrid(page)
  await page.waitForTimeout(800)
  const playing = await page.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  )
  expect(playing).toBeLessThanOrEqual(5) // bg + max 4 thumbs
})
