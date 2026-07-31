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
    await win.getByRole('button', { name: /^Close FILE_/ }).click()
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

  test('a dragged window stays within the viewport', async ({ page, viewport }) => {
    await boot(page)
    await page.locator('[data-file-row]').first().click()
    const win = page.locator('[data-file-window]')
    await expect(win).toHaveCount(1)

    const bar = win.locator('[data-drag-handle]')
    const start = await bar.boundingBox()
    if (!start) throw new Error('no drag handle')
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    // yank hard past the top-left corner
    await page.mouse.move(-1200, -1200, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(900)   // let the release spring settle

    const box = await win.boundingBox()
    if (!box) throw new Error('window vanished')
    // containerPadding lets a window hang 24px off-screen, no further
    expect(box.x + box.width).toBeGreaterThan(-25)
    expect(box.y + box.height).toBeGreaterThan(-25)
    expect(box.x).toBeLessThan(viewport!.width + 25)
  })
})
