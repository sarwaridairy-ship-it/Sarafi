import { expect, test } from '@playwright/test'

for (const language of ['en', 'fa-AF', 'ps-AF']) {
  for (const width of [360, 768, 1366]) {
    test(`daily-rate approval review fits ${language} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((value) => localStorage.setItem('sarafi-language', value), language)
      await page.goto('/app/inspection/control/team/approvals/inspection-daily-rate?role=owner')
      const editor = page.locator('.daily-rate-request-editor')
      await expect(editor).toBeVisible()
      await expect(editor.locator('strong')).not.toBeEmpty()
      await expect(editor.locator('input')).toHaveCount(2)
      await editor.locator('input').first().fill('70.25')
      await editor.locator('input').last().fill('70.35')
      await expect(editor.getByRole('button')).toBeDisabled() // Inspection never publishes real rates.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      for (const input of await editor.locator('input,button').all()) {
        const box = await input.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
      }
      await test.info().attach(`rate-approval-${language}-${width}`, {
        body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
      })
    })
  }
}

test('clearing a manual expense rate blocks saving even when a daily rate exists', async ({ page }) => {
  await page.goto('/app/inspection/transactions/new/money/pay/expense?role=owner')
  await page.getByRole('textbox', { name: 'Amount' }).fill('1234')
  await page.getByRole('combobox', { name: 'Currency' }).selectOption('USD')
  const resolver = page.getByRole('region', { name: 'Rate' })
  await resolver.getByRole('switch', { name: 'Automatic ON' }).click()
  await resolver.getByRole('textbox').fill('')
  await expect(page.getByRole('button', { name: /Save money paid/ })).toBeDisabled()
})
