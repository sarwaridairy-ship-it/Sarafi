import { expect, test } from '@playwright/test'

test.describe('Stage 9 browser matrix', () => {
  test('auth screen exposes sign-up and reset paths', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create an account' }).click()
    await expect(page.getByRole('heading', { name: 'Create your owner account' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to sign in' }).click()
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  })

  test('dashboard remains usable at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible()
  })
})
