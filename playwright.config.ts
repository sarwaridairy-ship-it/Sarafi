import { defineConfig, devices } from "@playwright/test";

const evidenceStage = process.env.SARAFI_EVIDENCE_STAGE ?? "local";
if (!/^[a-z0-9-]+$/.test(evidenceStage)) throw new Error("Invalid browser evidence stage");

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/authenticated-security.spec.ts", "**/authenticated-roles.spec.ts"],
  workers: 1,
  reporter: process.env.CI
    ? [["github"], ["line"], ["html", { outputFolder: `playwright-report/${evidenceStage}`, open: "never" }], ["json", { outputFile: `evidence-results/${evidenceStage}.json` }]]
    : [["line"], ["json", { outputFile: `evidence-results/${evidenceStage}.json` }]],
  outputDir: `test-results/${evidenceStage}`,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js build --mode e2e && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 300000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
