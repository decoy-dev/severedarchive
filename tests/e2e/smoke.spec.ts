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
