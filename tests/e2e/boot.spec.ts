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

test('notification is horizontally centered at the mobile breakpoint', async ({ page, viewport }) => {
  test.skip(viewport!.width > 640, 'centered layout only applies at the mobile breakpoint')
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const box = await page.locator('[data-notification]').boundingBox()
  const center = box!.x + box!.width / 2
  expect(Math.abs(center - viewport!.width / 2)).toBeLessThanOrEqual(2)
})
