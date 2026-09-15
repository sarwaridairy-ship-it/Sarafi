import { expect, test } from "@playwright/test";

const app = "/app/inspection";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("exact instruction v9 browser contract", () => {
  test("transaction route stays responsive at every required width", async ({ page }) => {
    await page.goto(`${app}/transactions/new/fx/buy?inspection=1&rateScenario=current`);
    for (const width of [360, 390, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await expectNoHorizontalOverflow(page);
      const sidebar = page.locator(".sidebar");
      if (width >= 600 && width <= 899) {
        const box = await sidebar.boundingBox();
        expect(box?.x ?? 0).toBeLessThan(0);
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
      }
    }
  });

  test("one compact Automatic rate supports reciprocal, stale fallback, and inline review", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${app}/transactions/new/fx/buy?inspection=1&rateScenario=current`);
    await expect(page.getByRole("switch", { name: "Automatic ON" })).toBeChecked();
    await expect(page.getByRole("region", { name: "Rate" })).toHaveCount(1);
    await expect(page.getByText("Add a note", { exact: false })).toHaveCount(0);
    await expect(page.getByText("1 AFN", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reverse quote" }).click();
    await expect(page.getByText("1 USD", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "We receive USD" }).fill("1000");
    await page.getByRole("button", { name: "Review transaction" }).click();
    await expect(page.getByRole("heading", { name: "Check before saving" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto(`${app}/transactions/new/fx/buy?inspection=1&rateScenario=stale`);
    await expect(page.getByRole("switch", { name: /Automatic/ })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: /Automatic/ })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Enter rate here" })).toHaveValue(/.+/);
    await expect(page.getByText("Manual rate for this transaction", { exact: true })).toBeVisible();

    await page.goto(`${app}/transactions/new/fx/buy?inspection=1&rateScenario=missing`);
    await expect(page.getByRole("switch", { name: /Automatic/ })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: /Automatic/ })).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Enter rate here" })).toHaveValue("");
    await expectNoHorizontalOverflow(page);
  });

  test("My Money uses the exact automatic fixture and offers inline rate repair", async ({ page }) => {
    await page.goto(`${app}/money?inspection=1`);
    await expect(page.getByText("11,000.00 AFN", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("171.875 USD", { exact: true })).toBeVisible();
    await expect(page.locator(".money-snapshot-source")).toContainText("Approved daily rate");
    await expectNoHorizontalOverflow(page);

    await page.goto(`${app}/money?inspection=1&rateScenario=missing`);
    await expect(page.getByText("Total incomplete", { exact: true })).toBeVisible();
    await expect(page.getByText("TRY · AFN daily rate", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save daily rate" })).toBeVisible();
  });

  test("Hawala inbox and payout match the exact recipient workflow", async ({ page }) => {
    await page.goto(`${app}/hawala?inspection=1`);
    for (const tab of ["Received", "Sent", "Needs Payout", "Completed"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    await expect(page.getByText("Ahmad Rahimi", { exact: true })).toBeVisible();
    await expect(page.getByText("HW-7K2M-9841", { exact: false })).toBeVisible();

    await page.goto(`${app}/hawala/payout/inspection-incoming?inspection=1`);
    await expect(page.getByText("Ahmad Rahimi", { exact: true })).toBeVisible();
    await expect(page.getByText("Herat Main", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open camera" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose existing photo" }).first()).toBeVisible();
    await expect(page.getByText("Another side or page (optional)", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Give Money and Complete Hawala" })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
  });

  test("Manage SARAFI has five stable areas and owner policy controls", async ({ page }) => {
    await page.goto(`${app}/control?inspection=1`);
    for (const title of ["Business Information", "Branches and Connected Partners", "Currencies and Rates", "Security and App Lock", "Team and Access"]) await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
    await page.getByRole("button", { name: /Currencies and Rates/ }).click();
    await expect(page).toHaveURL(new RegExp("/control/rates$"));
    await expect(page.getByText("United States Dollar", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("option", { name: "Khorasan Market · AFN" })).toHaveCount(1);

    await page.goto(`${app}/control/branches?inspection=1`);
    await page.getByRole("button", { name: "Open partner account" }).click();
    await expect(page).toHaveURL(new RegExp("/hawala/partners/inspection-partner$"));
    await expect(page.getByRole("heading", { name: "Settle a Hawala partner" })).toBeVisible();

    await page.goto(`${app}/control/security?inspection=1`);
    await expect(page.getByRole("button", { name: "Use Fingerprint / Face ID" })).toBeVisible();
    await page.getByRole("tab", { name: "Organization Policy" }).click();
    await expect(page.getByRole("region", { name: "Organization App Lock policy" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Tazkira photos required for Hawala payout" })).toHaveValue("1");
    await expectNoHorizontalOverflow(page);
  });

  test("locked workspace exposes only the private unlock surface", async ({ page }) => {
    await page.goto(`${app}?inspection=1&lock=1`);
    await expect(page.getByRole("heading", { name: "SARAFI is locked" })).toBeVisible();
    await expect(page.getByLabel("Six-digit PIN")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Fingerprint / Face ID" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveCount(0);
    for (const sensitiveText of ["11,000.00 AFN", "Ahmad Rahimi", "HW-7K2M-9841", "Notifications"])
      await expect(page.getByText(sensitiveText, { exact: false })).toHaveCount(0);
    for (const width of [360, 390, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await expectNoHorizontalOverflow(page);
    }
  });
});
