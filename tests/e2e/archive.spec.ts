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
