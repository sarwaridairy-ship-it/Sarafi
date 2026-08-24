import { expect, test } from '@playwright/test'

test('visitors can open the public workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('SARAFI · Exchange OS')
  await expect(page.getByRole('heading', { name: 'Good morning, Mohammad.' })).toBeVisible()
  await expect(page.getByText('Read-only inspection')).toBeVisible()
})
