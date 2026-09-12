import { expect, test } from "@playwright/test";

const workspace = "/app/inspection";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sarafi-language", "en"));
});

test.describe("exact user requirements v8", () => {
  test("transaction chooser has the six locked families", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new?role=owner`);
    await expect(page.locator(".transaction-family-grid > button")).toHaveText([
      /Currency Exchange/,
      /Receive Money/,
      /Spend Money/,
      /Move Money/,
      /^Debt/,
      /^Hawala/,
    ]);
    await expect(page.locator("body")).not.toContainText("Exchange Currency");
    await expect(page.locator("body")).not.toContainText("Move Our Money");
  });

  test("FX opens with one compact AFN-first quote and swaps display only", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new/fx/buy?role=owner`);
    const form = page.locator(".transaction-page-form");
    await expect(form.getByRole("combobox", { name: "Currency", exact: true })).toHaveValue("USD");
    await expect(form.getByRole("combobox", { name: "Currency 2" })).toHaveValue("AFN");
    await expect(form.locator(".compact-trade-rate")).toHaveCount(1);
    await expect(form.locator(".rate-governance, .exchange-rate-governance")).toHaveCount(0);
    await expect(form.locator(".compact-trade-rate")).toContainText("1 AFN =");
    await expect(form.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("0.01423487544");
    await form.getByRole("button", { name: "Reverse quote" }).click();
    await expect(form.locator(".compact-trade-rate")).toContainText("1 USD =");
    await expect(form.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("70.25");
  });

  test("My Money uses the exact available-money fixture and keeps positions separate", async ({ page }) => {
    await page.goto(`${workspace}/money?role=owner`);
    await expect(page.locator(".money-valuation-hero")).toContainText("11,000.00 AFN");
    await expect(page.locator(".money-valuation-hero")).toContainText("171.875 USD");
    const rows = page.locator(".money-currency-row:not(.heading)");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("2,000.00");
    await expect(rows.nth(1)).toContainText("2,600.00");
    await expect(rows.nth(2)).toContainText("6,400.00");
    await expect(page.getByText("Receivables", { exact: true })).toBeVisible();
    await expect(page.getByText("Payables", { exact: true })).toBeVisible();
    await expect(page.getByText("Hawala position", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add cashbox" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View by location" })).toBeVisible();
  });

  test("Hawala uses an exact recipient endpoint and guarded payout", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new/hawala/send?role=owner`);
    await expect(page.getByRole("searchbox", { name: "Search recipient" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search recipient" }).fill("Herat");
    await expect(page.getByRole("combobox", { name: "Verified recipient and branch" })).toContainText("Rahimi Exchange · Herat Main");
    await expect(page.locator(".hawala-selected-recipient")).toContainText("Herat Main");
    await expect(page.getByRole("textbox", { name: "Destination" })).toHaveValue("Herat Main");
    await expect(page.getByRole("textbox", { name: "Destination" })).toHaveAttribute("readonly", "");

    await page.goto(`${workspace}/hawala/payout/inspection-incoming?role=owner`);
    await expect(page.getByText("Front side", { exact: true })).toBeVisible();
    await expect(page.getByText("Back side", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Give Money and Complete Hawala" })).toBeDisabled();
  });

  test("Manage SARAFI and app lock expose the five focused areas and complete controls", async ({ page }) => {
    await page.goto(`${workspace}/control?role=owner`);
    const cards = page.locator(".control-center-card");
    await expect(cards).toHaveCount(5);
    for (const label of ["Business Information", "Branches and Connected Partners", "Currencies and Rates", "Security and App Lock", "Team and Access"])
      await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();

    await page.goto(`${workspace}/control/security?role=owner`);
    await expect(page.getByRole("combobox", { name: "Auto-lock after" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Lock when the app goes to the background" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock Now" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset app lock" })).toBeVisible();
    await expect(page.getByText(/Forgot the PIN/)).toBeVisible();
  });

  test("currencies and rates table keeps the required columns behind a responsive layout", async ({ page }) => {
    await page.goto(`${workspace}/control/rates?role=owner`);
    await expect(page.getByRole("columnheader")).toHaveText(["Currency", "Buy rate", "Sell rate", "Daily valuation", "Rate mode", "Time", "Update"]);
    await expect(page.locator(".market-rate-row").filter({ hasText: "USD" }).first()).toContainText("Automatic");
    await expect(page.locator(".rate-currency-picker > summary")).toContainText("Add Currency");
    await expect(page.getByRole("combobox", { name: "Rate board" }).locator("option")).toHaveText(["Sarai Shahzada · AFN", "Khorasan Market · AFN"]);
    await expect(page.locator(".rate-currency-picker")).not.toHaveAttribute("open", "");
    await expect(page.locator(".rate-history-disclosure")).not.toHaveAttribute("open", "");
  });

  test("Business starts focused and keeps connected Hawala endpoints in the branch tab", async ({ page }) => {
    await page.goto(`${workspace}/control/business?role=owner`);
    const businessCard = page.locator(".settings-command-card");
    for (const label of ["Shop name", "License information", "Base currency", "Business timezone", "Display language", "Primary branch"])
      await expect(businessCard.getByText(label, { exact: true })).toBeVisible();
    await expect(businessCard.locator("details")).not.toHaveAttribute("open", "");
    await expect(page.getByText("Advanced operating controls", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Branches and Connected Partners/ }).click();
    await expect(page.getByText("Rahimi Exchange", { exact: true })).toBeVisible();
    await expect(page.getByText("Herat Main · Herat", { exact: true })).toBeVisible();
  });

  test("required widths have no page overflow or desktop sidebar at tablet portrait", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The complete deterministic viewport matrix is covered once in Chromium.");
    const routes = [
      "/transactions/new",
      "/transactions/new/fx/buy",
      "/money",
      "/hawala",
      "/transactions/new/hawala/send",
      "/hawala/payout/inspection-incoming",
      "/control",
      "/control/rates",
      "/control/security",
    ];
    for (const width of [360, 390, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        await page.goto(`${workspace}${route}?role=owner`);
        const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth));
        expect(overflow, `${width}px ${route}`).toBeLessThanOrEqual(1);
        if (width === 768 || width === 820) await expect(page.locator(".sidebar")).toBeHidden();
        if ((width === 768 || width === 820) && route === "/transactions/new/fx/buy") {
          const overlayBox = await page.locator(".transaction-inline-form").boundingBox();
          expect(overlayBox?.x, `${width}px transaction overlay left edge`).toBeLessThanOrEqual(1);
          expect(overlayBox?.width, `${width}px transaction overlay width`).toBeGreaterThanOrEqual(width - 1);
        }
      }
    }
  });

  for (const [language, label] of [["fa-AF", "دری"], ["ps-AF", "پښتو"]] as const) {
    test(`${label} keeps financial values LTR and layouts contained`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "Localized responsive verification is covered once in Chromium.");
      await page.addInitScript((value) => localStorage.setItem("sarafi-language", value), language);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ["/transactions/new/fx/buy", "/money", "/hawala", "/control/rates", "/control/security"]) {
        await page.goto(`${workspace}${route}?role=owner`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), route).toBeLessThanOrEqual(1);
      }
      await page.goto(`${workspace}/transactions/new/fx/buy?role=owner`);
      expect(await page.getByRole("textbox", { name: /نرخ/ }).evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
    });
  }
});
