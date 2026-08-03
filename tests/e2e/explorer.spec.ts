import { test, expect } from '@playwright/test'
import { ready } from './helpers'

test.describe('desktop explorer', () => {
  test.skip(({ viewport }) => viewport!.width < 861, 'the explorer is the desktop surface')

  test('the list is a two-column thumbnail view', async ({ page }) => {
    await ready(page)
    const rows = page.locator('[data-file-row]')
    await expect(rows).toHaveCount(12)
    // Every tile carries its own poster; the name is still there beneath it.
    await expect(page.locator('[data-file-row] .explorer-thumb img')).toHaveCount(12)
    await expect(rows.first()).toContainText('CHROME_SEQ')

    // Two columns, asserted by geometry rather than by reading the CSS back:
    // the first two tiles share a row, the third starts a new one.
    const box = async (i: number) => (await rows.nth(i).boundingBox())!
    const [a, b, c] = [await box(0), await box(1), await box(2)]
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
    expect(b.x).toBeGreaterThan(a.x)
    expect(c.y).toBeGreaterThan(a.y)
    expect(Math.abs(c.x - a.x)).toBeLessThanOrEqual(1)
  })

  test('nothing plays until a file is opened', async ({ page }) => {
    await ready(page)
    await expect(page.locator('[data-preview-standby]')).toBeVisible()
    await expect(page.locator('.preview-standby')).toContainText('AWAITING SELECTION')

    // Hover is selection only. It must not start a decode anywhere in the pane.
    await page.locator('[data-file-row]').nth(4).hover()
    await page.waitForTimeout(700)
    await expect(page.locator('.explorer-preview video')).toHaveCount(0)
    // The metadata readout still follows the hover.
    await expect(page.locator('.preview-meta-head')).toContainText('FILE_005')

    // …and opening is what starts playback.
    await page.locator('[data-file-row]').nth(4).click()
    await expect(page.locator('[data-file-window="file05"] video')).toHaveAttribute('src', /file05_full\.mp4$/)
  })

  test('the close control is a real pointer target', async ({ page }) => {
    await ready(page)
    await page.locator('[data-file-row]').nth(0).click()
    const close = page.locator('.fw-close').first()
    const box = (await close.boundingBox())!
    // It was a ~10px glyph sitting on a drag handle, so a slightly-off click
    // grabbed the window instead of closing it.
    expect(box.width).toBeGreaterThanOrEqual(32)
    expect(box.height).toBeGreaterThanOrEqual(32)

    // And it still closes when clicked at its edge rather than dead centre.
    await page.mouse.click(box.x + 4, box.y + box.height - 4)
    await expect(page.locator('[data-file-window]')).toHaveCount(0)
  })
})
