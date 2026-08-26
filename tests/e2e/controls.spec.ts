import { expect, test } from '@playwright/test'

test.describe('workspace controls', () => {
  test('sidebar sections open their corresponding workspace view', async ({ page }) => {
    await page.goto('/')
    for (const section of ['Transactions', 'Cash & Accounts', 'People', 'Debts', 'Rates', 'Reports', 'Team & Devices', 'Settings']) {
      await page.getByRole('button', { name: section, exact: false }).click()
      await expect(page.getByRole('heading', { name: section === 'Transactions' ? 'Transaction history' : section, exact: true })).toBeVisible()
    }
  })

  test('help, privacy, filter, and trade controls respond', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open help' }).click()
    await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible()
    await page.getByRole('button', { name: 'Close help' }).first().click()
    await page.locator('header').getByRole('button', { name: 'Hide amounts' }).click()
    await expect(page.locator('header').getByRole('button', { name: 'Show amounts' })).toBeVisible()
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByRole('button', { name: 'All time' })).toBeVisible()
    await page.getByRole('button', { name: /History/ }).click()
    await expect(page.getByRole('heading', { name: 'Rates', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: /View all/ }).click()
    await expect(page.getByRole('heading', { name: 'Cash & Accounts', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: 'Sell currency', exact: true }).click()
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

  test('language selection switches RTL and survives reload', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Change language' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByText('صبح بخیر، محمد.')).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-AF')
    await expect(page.getByText('صبح بخیر، محمد.')).toBeVisible()
    await page.getByRole('button', { name: 'Change language' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ps-AF')
  })

  test('debts section exposes receivable and payable posting fields', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Debts/ }).click()
    await expect(page.getByRole('heading', { name: 'Debts', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Direction' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Direction' }).selectOption('payable')
    await expect(page.getByRole('combobox', { name: 'Direction' })).toHaveValue('payable')
    await expect(page.getByRole('button', { name: /Post debt/ })).toBeVisible()
  })

  test('reconciliation section exposes cash count and variance reason fields', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Reconciliation/ }).click()
    await expect(page.getByRole('heading', { name: 'Reconciliation', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Counted AFN' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Counted USD' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Variance reason' })).toBeVisible()
  })

  test('More actions exposes an opening balance form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('button', { name: 'Opening balance' }).click()
    await expect(page.getByRole('heading', { name: 'Record opening money' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Native amount' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Base value' })).toBeVisible()
  })

  test('Hawala section exposes traceability fields', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /More actions/ }).click()
    await page.getByRole('button', { name: 'Hawala' }).click()
    await expect(page.getByRole('heading', { name: 'Hawala', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Beneficiary' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Destination' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Reference code' })).toBeVisible()
  })

  test('core cashier actions are visible without opening More actions', async ({ page }) => {
    await page.goto('/')
    for (const action of ['Buy currency', 'Sell currency', 'Exchange currency', 'Receive money', 'Pay money']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Buy currency', exact: true }).click()
    await expect(page.getByRole('heading', { name: /BUY/ })).toBeVisible()
    await page.getByRole('button', { name: 'Close trade' }).click()
    await page.getByRole('button', { name: 'Receive money', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'RECEIVE MONEY' })).toBeVisible()
  })

  test('owner surface exposes control-center sections without accounting terminology', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Owner')).toBeVisible()
    await expect(page.getByRole('button', { name: /Debts/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Reports/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Reconciliation/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buy currency/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay money/ })).toBeVisible()
  })

  test('Buy, Sell, and Exchange open distinct FX forms', async ({ page }) => {
    await page.goto('/')
    for (const action of ['Buy currency', 'Sell currency', 'Exchange currency']) {
      await page.getByRole('button', { name: action, exact: true }).click()
      await expect(page.getByRole('heading', { name: new RegExp(action.split(' ')[0].toUpperCase()) })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Fee' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Note' })).toBeVisible()
      await page.getByRole('button', { name: 'Close trade' }).click()
    }
  })

  test('FX form blocks zero amounts before an authoritative post', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sell currency', exact: true }).click()
    await page.locator('.trade-modal').getByRole('textbox', { name: /Sell USD/ }).fill('0')
    await page.locator('.trade-modal').getByRole('button', { name: 'Post trade' }).click()
    await expect(page.getByRole('heading', { name: /SELL/ })).toBeVisible()
    await expect(page.getByText('Trade not posted: enter an amount greater than zero')).toBeVisible()
  })
})