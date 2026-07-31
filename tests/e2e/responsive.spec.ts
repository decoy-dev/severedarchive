import { test, expect } from '@playwright/test'

test('mobile: bottom tab bar, no scroll, focus fills window', async ({ page, viewport }) => {
  test.skip(viewport!.width > 640, 'mobile-only assertions')
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const tabs = await page.locator('.tw-tabs').boundingBox()
  const win = await page.locator('.terminal-window').boundingBox()
  expect(tabs!.y + tabs!.height).toBeGreaterThan(win!.y + win!.height - 60) // tabs at window bottom
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)
  expect(scroll).toBeLessThanOrEqual(1)
})
