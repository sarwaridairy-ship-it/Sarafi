import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..', '..')
const output = resolve(root, 'output', 'pdf')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  'C:\\Users\\DELL\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe'

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath })
try {
  for (const [source, target] of [
    ['sarafi-launch-report-dari.html', 'SARAFI_Web_Launch_Report_Dari.pdf'],
    ['sarafi-launch-report-pashto.html', 'SARAFI_Web_Launch_Report_Pashto.pdf'],
  ]) {
    const page = await browser.newPage()
    await page.goto(`file:///${resolve(root, 'reports', source).replaceAll('\\', '/')}`, { waitUntil: 'networkidle' })
    await page.emulateMedia({ media: 'print' })
    await page.pdf({
      path: resolve(output, target),
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    })
    await page.close()
  }
} finally {
  await browser.close()
}
