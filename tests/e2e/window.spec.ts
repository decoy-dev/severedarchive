import { test, expect } from '@playwright/test'

test('tabs switch panels', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'ABOUT' }).click()
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.getByRole('tab', { name: 'LINKS' }).click()
  await expect(page.getByText('INSTAGRAM')).toBeVisible()
})

test('arrow keys switch tabs', async ({ page }) => {
  await page.goto('./')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'ARCHIVE' })).toHaveAttribute('aria-selected', 'true')
})

test('background layer renders per tier: muted video (full) or poster image (lite)', async ({ page, viewport }) => {
  await page.goto('./')
  if (viewport!.width < 480) {
    // lite tier on small screens renders the poster <img>, not a <video>
    await expect(page.locator('.bg-video img')).toBeVisible()
  } else {
    const muted = await page.locator('.bg-video video').evaluate((v: HTMLVideoElement) => v.muted)
    expect(muted).toBe(true)
  }
})
