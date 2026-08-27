import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const authUrl = process.env.SARAFI_AUTH_E2E_URL

test.describe('accessibility acceptance', () => {
  test('public workspace has no critical or serious automated violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('cashier actions are keyboard reachable in the public workspace', async ({ page }) => {
    await page.goto('/')
    for (const action of ['Buy currency', 'Sell currency', 'Exchange currency', 'Receive money', 'Pay money']) {
      const control = page.getByRole('button', { name: action, exact: true })
      await expect(control).toBeVisible()
      await control.focus()
      await expect(control).toBeFocused()
    }
  })
})

test.describe('production authentication accessibility', () => {
  test.skip(!authUrl, 'Set SARAFI_AUTH_E2E_URL to run authentication accessibility against a production-like target')

  test('authentication screen has no critical or serious automated violations', async ({ page }) => {
    await page.goto(authUrl!)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  })
})