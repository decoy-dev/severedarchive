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
