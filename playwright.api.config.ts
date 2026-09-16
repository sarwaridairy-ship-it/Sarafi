import { defineConfig } from '@playwright/test'
import browserConfig from './playwright.config'

// These contracts call real authenticated APIs and do not launch a browser.
// Keep them independent of the inspection build and avoid repeating mutations
// once for every browser engine.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/authenticated-security.spec.ts', '**/authenticated-roles.spec.ts'],
  workers: 1,
  timeout: 60_000,
  reporter: browserConfig.reporter,
  outputDir: browserConfig.outputDir,
})
