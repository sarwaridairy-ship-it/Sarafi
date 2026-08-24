import { expect, test } from '@playwright/test'

test('unauthenticated visitors are stopped at secure access', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('SARAFI · Exchange OS')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})
