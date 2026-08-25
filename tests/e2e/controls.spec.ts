import { expect, test } from '@playwright/test'

test.describe('workspace controls', () => {
  test('sidebar sections open their corresponding workspace view', async ({ page }) => {
    await page.goto('/')
    for (const section of ['Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports', 'Team & Devices', 'Settings']) {
      await page.getByRole('button', { name: section, exact: false }).click()
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
    }
  })

  test('help, privacy, filter, and trade controls respond', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open help' }).click()
    await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible()
    await page.getByRole('button', { name: 'Close help' }).first().click()
    await page.getByRole('button', { name: 'Hide amounts' }).click()
    await expect(page.getByRole('button', { name: 'Show amounts' })).toBeVisible()
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByRole('button', { name: 'All time' })).toBeVisible()
    await page.getByRole('button', { name: /History/ }).click()
    await expect(page.getByRole('heading', { name: 'Rates', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: /View all/ }).click()
    await expect(page.getByRole('heading', { name: 'Cash & Accounts', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: 'New trade' }).click()
    await expect(page.getByRole('heading', { name: 'Record a trade' })).toBeVisible()
    await page.getByRole('button', { name: 'Close trade' }).click()
    await expect(page.getByRole('heading', { name: 'Record a trade' })).not.toBeVisible()
  })

  test('more actions opens a validated operation form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('button', { name: 'Expense' }).click()
    await expect(page.getByRole('heading', { name: 'RECORD EXPENSE' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Amount' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Currency' })).toBeVisible()
    await page.getByRole('button', { name: 'Close operation' }).click()
    await expect(page.getByRole('heading', { name: 'RECORD EXPENSE' })).not.toBeVisible()
  })
})