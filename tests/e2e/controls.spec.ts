import { expect, test } from '@playwright/test'

test.describe('workspace controls', () => {
  test('first-time visitor can explain the product and choose a language', async ({ page }) => {
    await page.goto('/?public=1')
    await expect(page.getByRole('heading', { name: 'Simple digital daftar for Sarafi shops' })).toBeVisible()
    await expect(page.getByText('Record currency buying and selling, know where your money is, track debts, and control your shop from one place.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Language' }).selectOption('fa-AF')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'دفتر دیجیتلی ساده برای صرافی‌ها' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible()
  })

  test('primary navigation and More menu open their corresponding views', async ({ page }) => {
    await page.goto('/')
    for (const section of ['Transactions', 'My money', 'Customers & debts']) {
      await page.getByRole('button', { name: new RegExp(section) }).click()
      await expect(page.getByRole('heading', { name: section === 'Transactions' ? 'Transaction history' : section === 'My money' ? 'Where is my money?' : 'People', exact: true })).toBeVisible()
    }
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    for (const section of ['Debts', 'Rates', 'Reports', 'Check cashbox']) {
      await page.getByRole('button', { name: new RegExp(`^${section}`) }).click()
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible()
      await page.getByRole('button', { name: /Back to dashboard/ }).click()
      await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    }
    await page.getByRole('button', { name: /Team & Devices/ }).click()
    await expect(page.getByRole('heading', { name: 'Team & Devices', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Settings/ }).click()
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('help, privacy, filter, and trade controls respond', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open help' }).click()
    await expect(page.getByRole('heading', { name: 'Help & support' })).toBeVisible()
    await page.getByRole('button', { name: 'Close help' }).first().click()
    await page.locator('header').getByRole('button', { name: 'Hide amounts' }).click()
    await expect(page.locator('header').getByRole('button', { name: 'Show amounts' })).toBeVisible()
    await page.locator('.filter-button').click()
    await expect(page.getByRole('button', { name: 'All time' })).toBeVisible()
    await page.getByRole('button', { name: /History/ }).click()
    await expect(page.getByRole('heading', { name: 'Rates', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: /View all/ }).click()
    await expect(page.getByRole('heading', { name: 'Where is my money?', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Back to dashboard/ }).click()
    await page.getByRole('button', { name: 'Sell currency', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Sell currency/ })).toBeVisible()
    await page.getByRole('button', { name: 'Close trade' }).click()
    await expect(page.getByRole('heading', { name: /Sell currency/ })).not.toBeVisible()
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
    await expect(page.getByText('زما پیسې').first()).toBeVisible()
  })

  test('translated trade labels keep the business perspective', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.removeItem('sarafi-language'))
    await page.goto('/')
    await page.getByRole('button', { name: 'Buy currency', exact: true }).click()
    await expect(page.getByRole('textbox', { name: /We give/ })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /We receive/ })).toBeVisible()
    await page.getByRole('button', { name: 'Close trade' }).click()
    await page.getByRole('button', { name: 'Change language' }).click()
    await page.getByRole('button', { name: /خرید ارز/ }).click()
    await expect(page.getByRole('textbox', { name: /ما می‌دهیم/ })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /ما دریافت می‌کنیم/ })).toBeVisible()
  })

  test('debts section exposes receivable and payable posting fields', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /^Debts/ }).click()
    await expect(page.getByRole('heading', { name: 'Debts', exact: true })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Direction' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Direction' }).selectOption('payable')
    await expect(page.getByRole('combobox', { name: 'Direction' })).toHaveValue('payable')
    await expect(page.getByRole('button', { name: /Post debt/ })).toBeVisible()
  })

  test('reconciliation section exposes cash count and variance reason fields', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /^Check cashbox/ }).click()
    await expect(page.getByRole('heading', { name: 'Check cashbox', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Counted AFN' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Counted USD' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Variance reason' })).toBeVisible()
    await expect(page.getByText('Expected vs actual').first()).toBeVisible()
  })

  test('Team & Devices exposes memberships, devices, and approval inbox', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Team & Devices/ }).click()
    await expect(page.getByRole('heading', { name: 'Team & Devices', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Team access', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Registered devices', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Approval inbox', exact: true })).toBeVisible()
  })

  test('offline drafts stay encrypted and never auto-post', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /^Offline/ }).click()
    await page.getByRole('combobox', { name: 'Operation' }).selectOption('BUY_FX')
    await page.getByRole('textbox', { name: 'Amount' }).fill('12345.67')
    await page.getByRole('button', { name: /Save as Draft/ }).click()
    await expect(page.getByText(/not posted and will not auto-submit/)).toBeVisible()
    const raw = await page.evaluate(async () => new Promise<unknown[]>((resolve, reject) => { const request = indexedDB.open('sarafi-offline', 3); request.onsuccess = () => { const read = request.result.transaction('drafts', 'readonly').objectStore('drafts').getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error) }; request.onerror = () => reject(request.error) }))
    const serialized = JSON.stringify(raw)
    expect(serialized).not.toContain('12345.67')
    expect(serialized).not.toContain('BUY_FX')
    await page.reload()
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /^Offline/ }).click()
    await expect(page.getByText(/DRAFT — NOT POSTED/)).toBeVisible()
    await page.evaluate(async () => new Promise<void>((resolve, reject) => { const request = indexedDB.open('sarafi-offline', 3); request.onsuccess = () => { const transaction = request.result.transaction('drafts', 'readwrite'); const store = transaction.objectStore('drafts'); const read = store.getAll(); read.onsuccess = () => { const record = read.result[0]; record.data = record.data.slice(0, -2) + 'AA'; store.put(record); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) }; read.onerror = () => reject(read.error) }; request.onerror = () => reject(request.error) }))
    await page.reload()
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await page.getByRole('button', { name: /^Offline/ }).click()
    await expect(page.getByText(/Draft storage unavailable/)).toBeVisible()
  })

  test('offline mode disables primary financial posting controls', async ({ page, context }) => {
    await page.goto('/')
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    for (const action of ['Buy currency', 'Sell currency', 'Exchange currency', 'Receive money', 'Pay money']) {
         await expect(page.getByRole('button', { name: action, exact: true })).toBeDisabled()
    }
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
    await expect(page.getByRole('heading', { name: /Buy currency/ })).toBeVisible()
    await page.getByRole('button', { name: 'Close trade' }).click()
    await page.getByRole('button', { name: 'Receive money', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'RECEIVE MONEY' })).toBeVisible()
  })

  test('owner surface exposes control-center sections without accounting terminology', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Owner')).toBeVisible()
    await page.locator('.sidebar nav').first().getByRole('button', { name: /More/ }).click()
    await expect(page.getByRole('button', { name: /^Debts/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Reports/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Check cashbox/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buy currency/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay money/ })).toBeVisible()
  })

  test('Money Location supports currency and location views with evidence drill-down', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /My money/ }).click()
    await expect(page.getByRole('heading', { name: 'Where is my money?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Currency first' })).toBeVisible()
    await page.getByRole('button', { name: 'Location first' }).click()
    await expect(page.getByRole('button', { name: 'Location first' })).toHaveClass(/active/)
    await expect(page.getByText('Ledger lines available')).toBeVisible()
  })

  test('People supports search and statement views', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Customers & debts/ }).click()
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: 'Search people' }).fill('no-match')
    await expect(page.getByText('No counterparties match this search.')).toBeVisible()
  })

  test('Buy, Sell, and Exchange open distinct FX forms', async ({ page }) => {
    await page.goto('/')
    for (const action of ['Buy currency', 'Sell currency', 'Exchange currency']) {
      await page.getByRole('button', { name: action, exact: true }).click()
      await expect(page.getByRole('heading', { name: new RegExp(action.split(' ')[0], 'i') })).toBeVisible()
      await expect(page.getByRole('textbox', { name: /Fee/ })).toBeVisible()
      await expect(page.getByRole('textbox', { name: /Note/ })).toBeVisible()
      await page.getByRole('button', { name: 'Close trade' }).click()
    }
  })

  test('live buy and sell rates are read-only displays', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('textbox', { name: 'Live buy rate' })).toHaveValue('70.25')
    await expect(page.getByRole('textbox', { name: 'Live sell rate' })).toHaveValue('70.35')
    await page.getByRole('textbox', { name: 'Live buy rate' }).fill('99')
    await expect(page.getByRole('textbox', { name: 'Live buy rate' })).toHaveValue('70.25')
  })

  test('FX form blocks zero amounts before an authoritative post', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Sell currency', exact: true }).click()
    await page.locator('.trade-modal').getByRole('textbox', { name: /We give USD/ }).fill('0')
    await page.locator('.trade-modal').getByRole('button', { name: 'Post trade' }).click()
    await expect(page.getByRole('heading', { name: /Sell currency/ })).toBeVisible()
    await expect(page.getByText('Trade not posted: enter an amount greater than zero')).toBeVisible()
  })
})
