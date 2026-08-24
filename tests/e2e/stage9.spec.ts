import { expect, test } from '@playwright/test'

test.describe('Stage 9 browser matrix', () => {
  test('switches to Dari and preserves an actionable RTL dashboard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /EN/ }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByText('خرید ارز')).toBeVisible()
    await expect(page.getByRole('button', { name: /دری/ })).toBeVisible()
  })

  test('dashboard remains usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Good morning, Mohammad.' })).toBeVisible()
    await expect(page.getByRole('button', { name: /New trade/ })).toBeVisible()
  })
})
