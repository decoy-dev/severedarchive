import { test, expect } from '@playwright/test'

/**
 * This file used to assert the boot notification: it popped, it dismissed, and
 * a bell in the title bar re-summoned it. All three are gone — the notification
 * was deleted outright in the desktop rebuild, and the wordmark took the space
 * the bell sat in. What survives is what boot was really for: the sequence runs
 * once, then the terminal window draws in, and nothing else is on screen.
 */
test('boot runs once and hands over to the terminal window', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  // The boot log unmounts when it is done; it must not linger behind the desktop.
  await expect(page.locator('.boot')).toHaveCount(0)
  await expect(page.locator('.terminal-window')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'ARCHIVE' })).toHaveAttribute('aria-selected', 'true')
})

test('nothing is waiting to be dismissed', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  await expect(page.locator('[data-notification]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show notification' })).toHaveCount(0)
})

test('the boot log counts the archive it actually indexed', async ({ page }) => {
  // It read "6 FILES INDEXED" long after the archive doubled to 12 — the same
  // class of silent drift as process-media.sh's hardcoded file list.
  await page.goto('./')
  await expect(page.locator('.boot')).toContainText('12 FILES INDEXED')
})
