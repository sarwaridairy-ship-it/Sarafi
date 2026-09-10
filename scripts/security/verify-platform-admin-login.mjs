import { chromium } from '@playwright/test'

const {
  SARAFI_APP_URL: appUrl,
  SARAFI_ADMIN_EMAIL: email,
  SARAFI_ADMIN_PASSWORD: password,
} = process.env

if (!appUrl || !email || !password) {
  throw new Error('SARAFI_APP_URL, SARAFI_ADMIN_EMAIL, and SARAFI_ADMIN_PASSWORD are required')
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(new URL('/platform-admin', appUrl).toString(), { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^Sign in/ }).click()
  await page.getByText('SARAFI administrator', { exact: true }).waitFor({ timeout: 20000 })
  await page.locator('.platform-metrics').waitFor({ timeout: 20000 })

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const navigationOverflow = await page.locator('.platform-tabs').evaluate((element) => element.scrollWidth - element.clientWidth)
  const securityControlVisible = await page.getByRole('heading', { name: 'Administrator security' }).isVisible()
  if (desktopOverflow > 1 || mobileOverflow > 1 || navigationOverflow > 1 || !securityControlVisible) {
    throw new Error('Administrator workspace responsive or security verification failed')
  }

  console.log(JSON.stringify({
    route: new URL(page.url()).pathname,
    administrator_workspace_loaded: true,
    security_control_visible: securityControlVisible,
    desktop_overflow_px: desktopOverflow,
    mobile_overflow_px: mobileOverflow,
    navigation_overflow_px: navigationOverflow,
  }, null, 2))
} finally {
  await browser.close()
}
