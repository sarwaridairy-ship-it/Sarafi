import { expect, test } from '@playwright/test'

test.describe('Stage 9 browser matrix', () => {
  test('public workspace does not expose authentication controls', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).not.toBeVisible()
  })

  test('dashboard remains usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Good morning, Mohammad.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Buy currency', exact: true })).toBeVisible()
  })
})
