import { test, expect } from '@playwright/test'

test('archive shows the exact per-breakpoint card count, with a pager only when paginated', async ({ page, viewport }) => {
  await page.goto('./')
  const width = viewport!.width
  const expectedPerPage = width <= 640 ? 3 : width <= 1024 ? 4 : 6
  const cards = page.locator('[data-card]')
  await expect(cards.first()).toBeVisible()
  await expect(cards).toHaveCount(expectedPerPage)
  await expect(page.getByText('FILE_001')).toBeVisible()

  const pager = page.locator('.grid-pager')
  if (expectedPerPage < 6) {
    // 6 archive files exceed the per-page count on tablet/mobile → pager shows
    await expect(pager).toBeVisible()
  } else {
    // desktop shows all 6 files on one page → no pager
    await expect(pager).toHaveCount(0)
  }
})

test('no more videos playing than the cap allows', async ({ page }) => {
  await page.goto('./')
  await page.waitForTimeout(800)
  const playing = await page.evaluate(
    () => [...document.querySelectorAll('video')].filter((v) => !v.paused).length,
  )
  expect(playing).toBeLessThanOrEqual(5) // bg + max 4 thumbs
})
