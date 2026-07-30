import { test, expect } from '@playwright/test'

test('clicking a card zooms it to focus; Esc returns it', async ({ page, viewport }) => {
  await page.goto('./')
  const first = page.locator('[data-card]').first()
  const before = await first.boundingBox()
  await first.click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', /file\d+/)
  await page.waitForTimeout(500) // FLIP settles
  const after = await page.locator('[data-card].is-focus').boundingBox()
  const beforeArea = before!.width * before!.height
  const afterArea = after!.width * after!.height
  expect(afterArea).toBeGreaterThan(beforeArea * 1.5)
  await expect(page.getByRole('button', { name: 'Toggle sound' })).toBeVisible()
  // pager is hidden while a card is focused, even on breakpoints that normally paginate
  if (viewport!.width <= 1024) {
    await expect(page.locator('.grid-pager')).toHaveCount(0)
  }
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

test('re-clicking the focused card returns it to the grid', async ({ page }) => {
  await page.goto('./')
  const first = page.locator('[data-card]').first()
  await first.click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', /file\d+/)
  await first.click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', '')
})

test('clicking a different card switches focus to it', async ({ page, viewport }) => {
  // mobile hides unfocused cards (display: none) while one is focused, so a second
  // card can't be clicked there — the switch path only applies at wider breakpoints.
  test.skip(viewport!.width <= 640, 'unfocused cards are hidden while focused on mobile')

  await page.goto('./')
  const cards = page.locator('[data-card]')
  const firstId = await cards.nth(0).getAttribute('data-file-id')
  const secondId = await cards.nth(1).getAttribute('data-file-id')

  await cards.nth(0).click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', firstId!)

  await page.locator(`[data-card][data-file-id="${secondId}"]`).click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', secondId!)
  await page.waitForTimeout(300)
  const src = await page.locator('[data-card].is-focus video').getAttribute('src')
  expect(src).toContain('_full.mp4')
})

test('the Close file button returns focus to the grid', async ({ page }) => {
  await page.goto('./')
  await page.locator('[data-card]').first().click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', /file\d+/)
  await page.getByRole('button', { name: 'Close file' }).click()
  await expect(page.locator('.archive-grid')).toHaveAttribute('data-focused', '')
})
