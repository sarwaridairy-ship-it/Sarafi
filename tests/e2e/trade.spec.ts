import { expect, test } from '@playwright/test'

test('unauthenticated trade attempts cannot claim a financial post', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('SARAFI · Exchange OS')
  await page.getByRole('button', { name: /New trade/ }).click()
  await page.getByRole('textbox', { name: 'Sell USD · United States Dollar' }).fill('1250')
  await page.getByRole('button', { name: /Post trade/ }).click()
  await expect(page.getByText(/Trade not posted/)).toBeVisible()
  await expect(page.getByText('$1250')).not.toBeVisible()
})
