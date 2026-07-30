import { test, expect } from '@playwright/test'

test('tabs switch panels', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  // the home notification's dim subtext repeats "MOTION + VISUAL ART", ambiguating the
  // panel-text assertion below — dismiss it first (Task 7 added the notification) and
  // wait for it to fully unmount, since a strict-mode-ambiguous locator isn't retried.
  await page.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(page.locator('[data-notification]')).toHaveCount(0)
  await page.getByRole('tab', { name: 'ABOUT' }).click()
  await expect(page.getByText('MOTION + VISUAL ART')).toBeVisible()
  await page.getByRole('tab', { name: 'LINKS' }).click()
  await expect(page.getByText('INSTAGRAM')).toBeVisible()
})

test('arrow keys switch tabs', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await page.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(page.locator('[data-notification]')).toHaveCount(0)
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
