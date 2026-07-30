import { test, expect } from '@playwright/test'

test('boot runs, notification pops, dismisses, and bell re-summons it', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const notice = page.locator('[data-notification]')
  await expect(notice).toBeVisible()
  await expect(notice.getByText('INCOMING TRANSMISSION')).toBeVisible()
  await notice.getByRole('button', { name: 'Acknowledge' }).click()
  await expect(notice).toHaveCount(0)
  await page.getByRole('button', { name: 'Show notification' }).click()
  await expect(page.locator('[data-notification]')).toBeVisible()
})
