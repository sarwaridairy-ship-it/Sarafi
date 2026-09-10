import { expect, test } from '@playwright/test'

const workspace = '/app/inspection'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sarafi-language', 'en'))
})

test('rates expose only the two markets and respect the shop currency selection and order', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The market configuration journey is covered once; shared layout tests cover all engines.')
  await page.goto(`${workspace}/control/rates?role=owner`)

  const market = page.getByRole('combobox', { name: 'Rate board' })
  await expect(market.locator('option')).toHaveText(['Sarai Shahzada · AFN', 'Khorasan Market · IRR'])
  await expect(page.locator('body')).not.toContainText('sarafi.af')
  await market.selectOption('khorasan-market')
  await expect(page.getByRole('heading', { name: 'Khorasan Market' })).toBeVisible()
  await expect(page.locator('.market-rate-row').filter({ hasText: 'USD' })).toBeVisible()

  await page.locator('.rate-currency-picker > summary').click()
  const eurChoice = page.locator('.rate-currency-choice-list article').filter({ hasText: 'EUR' })
  await eurChoice.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'Save currency list' }).click()
  await market.selectOption('sarai-shahzada')
  await expect(page.locator('.market-rate-row').filter({ hasText: 'EUR' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Move down USD' }).click()
  await page.getByRole('button', { name: 'Save currency list' }).click()
  const codes = await page.locator('.market-rate-row:not(.market-rate-heading) .market-currency-cell strong').allTextContents()
  expect(codes[0]).not.toContain('USD')
})

test('transaction customer picker can search and add a customer without leaving the form', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The inline customer journey is covered once.')
  await page.goto(`${workspace}/transactions/new/fx/buy?role=owner`)
  const picker = page.locator('.customer-selector')
  await picker.getByRole('searchbox', { name: 'Search customer' }).fill('C-00000042')
  await picker.getByRole('button', { name: 'Search customer' }).click()
  await picker.getByRole('combobox', { name: 'Customer' }).selectOption('__add_customer__')
  const dialog = page.getByRole('dialog', { name: 'Add customer' })
  await dialog.getByLabel('Customer name').fill('Mobile Test Customer')
  await dialog.getByRole('button', { name: 'Save and select' }).click()
  await expect(picker.getByRole('combobox', { name: 'Customer' }).locator('option:checked')).toContainText('Mobile Test Customer')
})

test('owner and administrator payment workspaces expose receipt and editable duration controls', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The receipt and administrator controls are covered once.')
  await page.goto(`${workspace}/control/billing?role=owner`)
  await expect(page.getByLabel('Upload payment receipt')).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png')
  await page.getByLabel('Upload payment receipt').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from('receipt') })
  await expect(page.getByRole('button', { name: 'Send for activation' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeVisible()

  await page.goto('/platform-admin?preview=1')
  await page.getByRole('button', { name: 'Payments', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeVisible()
  await page.getByRole('button', { name: 'Plans', exact: true }).click()
  await expect(page.locator('.plan-term-editor form')).toHaveCount(8)
  await expect(page.locator('.plan-term-editor form').first().getByRole('button', { name: 'Save price' })).toBeEnabled()
})

test('receipt and report use localized prewritten narratives', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The document-template journey is covered once.')
  await page.goto(`${workspace}/transactions/inspection-buy-entry?role=owner`)
  await expect(page.locator('.receipt-narrative')).toContainText('The shop bought 1,000.00 USD and paid 70,250.00 AFN.')

  await page.goto(`${workspace}/reports?role=owner`)
  await page.getByRole('button', { name: 'Prepare today’s report' }).click()
  await expect(page.locator('.report-narrative')).toContainText('This report lists the shop activity recorded for')
})

for (const width of [320, 390, 768]) {
  test(`${width}px follow-up screens have no horizontal page overflow`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'A deterministic Chromium pass covers the requested viewport widths.')
    await page.setViewportSize({ width, height: 900 })
    for (const route of [
      '/transactions/new/fx/buy?role=owner',
      '/transactions/new/debt/receivable?role=owner',
      '/transactions/inspection-buy-entry?role=owner',
      '/control/rates?role=owner',
      '/control/billing?role=owner',
      '/reports?role=owner',
    ]) {
      await page.goto(`${workspace}${route}`)
      const overflow = await page.evaluate(() => Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth,
      ))
      expect(overflow, route).toBeLessThanOrEqual(1)
    }
  })
}
