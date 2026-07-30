import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function ready(page: Page) {
  await page.goto('./')
  await expect(page.locator('.stage')).toHaveAttribute('data-booted', 'true', { timeout: 6000 })
  const ack = page.getByRole('button', { name: 'Acknowledge' })
  if (await ack.count()) { await ack.click(); await expect(page.locator('[data-notification]')).toHaveCount(0) }
}

export async function gotoGrid(page: Page) {
  await ready(page)
  await page.getByRole('button', { name: 'Grid view' }).click()
}
