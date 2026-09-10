import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const workspace = "/app/inspection";

test.describe("calm premium v4 objective acceptance", () => {
  test("transaction entry shows exactly six families, at most four quick actions, and direct routes", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new?role=owner`);
    const families = page.locator(".transaction-family-grid > button");
    await expect(families).toHaveCount(6);
    await expect(families).toHaveText([
      /Currency Exchange/,
      /Money In/,
      /Money Out/,
      /Move Our Money/,
      /^Debt/,
      /^Hawala/,
    ]);
    expect(await page.locator(".quick-actions button").count()).toBeLessThanOrEqual(4);

    const journeys = [
      ["Currency Exchange", "Buy currency", "/transactions/new/fx/buy"],
      ["Money In", "From a customer", "/transactions/new/money-in/receive"],
      ["Money Out", "To a customer", "/transactions/new/money-out/pay"],
      ["Move Our Money", "Between cashboxes", "/transactions/new/move/transfer"],
      ["Debt", "They owe us", "/transactions/new/debt/receivable"],
      ["Debt", "Settle a debt", "/debts"],
      ["Hawala", "Pay beneficiary", "/hawala/payout"],
    ] as const;
    for (const [family, action, route] of journeys) {
      await page.goto(`${workspace}/transactions/new?role=owner`);
      await page.getByRole("button", { name: new RegExp(`^${family}`) }).click();
      expect(await page.locator(".transaction-action-list button").count()).toBeLessThanOrEqual(4);
      await page.getByRole("button", { name: new RegExp(action) }).click();
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    }
  });

  for (const role of ["owner", "business_admin", "manager", "cashier", "accountant", "compliance_officer", "viewer"] as const) {
    test(`${role} home stays inside cognitive-load budgets`, async ({ page }) => {
      await page.goto(`${workspace}/home?role=${role}`);
      await expect(page.locator(".calm-home")).toBeVisible();
      await expect(page.locator(".calm-primary")).toHaveCount(1);
      expect(await page.locator(".calm-summary-grid article").count()).toBeLessThanOrEqual(4);
      expect(await page.locator(".calm-attention .calm-list button").count()).toBeLessThanOrEqual(5);
      expect(await page.locator(".calm-recent .calm-activity-list article").count()).toBeLessThanOrEqual(5);
      await expect(page.locator(".calm-home table, .calm-home .export-button, .calm-home .rate-strip")).toHaveCount(0);
      await expect(page.locator(".mobile-nav > *")).toHaveCount(["owner", "business_admin", "manager"].includes(role) ? 6 : 5);
      if (role === "accountant") await expect(page.locator(".calm-primary")).toContainText("daily summary");
    });
  }

  test("normal FX keeps the rate open without asking for a rate-decision reason", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new/fx/buy?role=owner`);
    const form = page.locator(".financial-task-form");
    await expect(form).toBeVisible();
    await expect(form.getByRole("textbox", { name: /reason/i })).toHaveCount(0);
    await form.getByRole("textbox", { name: "Transaction rate" }).fill("70.50");
    await expect(form.getByRole("textbox", { name: /reason/i })).toHaveCount(0);
  });

  test("a new FX intent never inherits a reviewed transaction", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new/fx/buy?role=cashier`);
    const buyForm = page.locator(".financial-task-form");
    await buyForm.locator(".trade-fields input").first().fill("100");
    await buyForm.getByRole("button", { name: /Review transaction/ }).click();
    await expect(buyForm.getByRole("heading", { name: "Check before saving" })).toBeVisible();
    await buyForm.getByRole("button", { name: "Edit transaction" }).click();

    await page.locator(".sidebar nav").getByRole("button", { name: "Make a Transaction", exact: true }).click();
    await page.getByRole("button", { name: /^Currency Exchange/ }).click();
    await page.getByRole("button", { name: "Sell currency", exact: true }).click();

    await expect(page).toHaveURL(/\/transactions\/new\/fx\/sell$/);
    const sellForm = page.locator(".financial-task-form");
    await expect(sellForm.locator(".trade-fields input").first()).toBeEnabled();
    await expect(sellForm.locator(".trade-fields input").first()).toHaveValue("");
    await expect(sellForm.getByRole("heading", { name: "Check before saving" })).toHaveCount(0);
  });

  test("Debt and Hawala direct journeys remove ambiguous and raw-id controls", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new/debt/receivable?role=owner`);
    await expect(page.getByText("They owe us", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/direction/i)).toHaveCount(0);

    await page.goto(`${workspace}/hawala/payout?role=owner`);
    const payout = page.locator(".financial-task-form");
    await expect(payout.getByLabel(/Reference code/)).toBeFocused();
    await expect(payout.getByRole("button", { name: "Scan code" })).toBeVisible();

    await page.goto(`${workspace}/hawala/partners/inspection-partner/settle?role=owner`);
    await expect(page.getByRole("combobox", { name: "Partner", exact: true })).toHaveCount(1);
    await expect(page.getByLabel(/partner.*id|uuid/i)).toHaveCount(0);
  });

  test("Accountant direct posting routes are denied and correction posting is absent", async ({ page }) => {
    for (const route of ["/fx/buy", "/money-in/customer", "/money-out/expense", "/move/cashbox", "/debt/receivable", "/hawala/send"]) {
      await page.goto(`${workspace}/transactions/new${route}?role=accountant`);
      await expect(page.getByRole("heading", { name: "Access not allowed" })).toBeVisible();
      await expect(page.locator(".financial-task-form")).toHaveCount(0);
    }
    await page.goto(`${workspace}/transactions/inspection-expense-entry?role=accountant`);
    await expect(page.locator(".transaction-correction-form")).toHaveCount(0);
  });

  test("Business Administrator receives operations but never owner-capital actions", async ({ page }) => {
    await page.goto(`${workspace}/transactions/new?role=business_admin`);
    await expect(page.getByRole("button", { name: /^Currency Exchange/ })).toBeVisible();
    await page.getByRole("button", { name: /^Money In/ }).click();
    await expect(page.getByRole("button", { name: /Owner capital/i })).toHaveCount(0);
    await page.goto(`${workspace}/transactions/new/money-in/owner-investment?role=business_admin`);
    await expect(page.getByRole("heading", { name: "Access not allowed" })).toBeVisible();
  });

  test("Team, Manage SARAFI, and Reports expose the required information architecture", async ({ page }) => {
    await page.goto(`${workspace}/control/team?role=owner`);
    const tabs = page.locator(".calm-subnav button");
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(["People", "Invitations", "Join Requests", "Devices", "Roles & Limits"]);
    await page.getByRole("button", { name: "Join Requests" }).click();
    await expect(page.getByRole("heading", { name: "Independent join requests" })).toBeVisible();
    await page.getByRole("button", { name: "Review access" }).click();
    await expect(page.getByRole("heading", { name: /Assign access/ })).toBeVisible();
    await expect(page.getByText("Allowed action types", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Roles & Limits" }).click();
    await expect(page.getByRole("heading", { name: "Role assignments and limits" })).toBeVisible();

    await page.goto(`${workspace}/control?role=owner`);
    await expect(page.getByRole("heading", { name: "Manage SARAFI" })).toBeVisible();
    await expect(page.locator(".control-center-card")).toHaveCount(5);

    await page.goto(`${workspace}/reports?role=owner`);
    await expect(page.getByRole("heading", { name: "Exact report snapshot" })).toBeVisible();
    await expect(page.locator(".export-menu")).toHaveCount(0);
    await page.getByRole("button", { name: "Prepare today’s report" }).click();
    await expect(page.locator(".export-menu")).toHaveCount(1);
    await expect(page.locator(".export-menu > summary")).toHaveText("Export formats");
    await expect(page.getByRole("button", { name: "Download simple daily PDF" })).toBeEnabled();
    await expect(page.locator(".report-evidence")).toContainText("Main branch");
    expect(await page.locator("select optgroup").count()).toBeGreaterThanOrEqual(4);
  });

  for (const width of [360, 390]) {
    test(`${width}px mobile keeps the primary destinations reachable and the primary action above them`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${workspace}/home?role=owner`);
      const primary = page.locator(".calm-primary");
      const mobileNav = page.locator(".mobile-nav");
      await expect(mobileNav.locator(":scope > *")).toHaveCount(6);
      const primaryBox = await primary.boundingBox();
      const navBox = await mobileNav.boundingBox();
      expect(primaryBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(primaryBox!.y + primaryBox!.height).toBeLessThanOrEqual(navBox!.y + 2);
      const navOverflow = await mobileNav.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(navOverflow).toBeLessThanOrEqual(1);
    });
  }

  for (const width of [390, 768]) {
    test(`${width}px transaction forms and compact tables fit without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, selector] of [
        ["/transactions/new/fx/buy?role=owner", ".exchange-entry-row"],
        ["/transactions/new/money-in/receive?role=owner", ".operation-entry-form"],
        ["/transactions/new/money-out/expense?role=owner", ".operation-entry-form"],
        ["/money?role=owner", ".cashbox-only-panel"],
        ["/control/rates?role=owner", ".market-rate-table"],
        ["/control/business?role=owner", ".currency-settings-list"],
      ] as const) {
        await page.goto(`${workspace}${path}`);
        await expect(page.locator(selector)).toBeVisible();
        const layout = await page.evaluate(() => ({
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
        }));
        expect(layout.documentOverflow, path).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow, path).toBeLessThanOrEqual(1);
      }
    });
  }

  test("captures the required desktop and mobile visual evidence", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "One deterministic browser produces the audit screenshots");
    const output = path.join(process.cwd(), "artifacts", "calm-premium-v4", "screenshots");
    await mkdir(output, { recursive: true });
    for (const [language, label] of [["en", "en"], ["fa-AF", "dari"], ["ps-AF", "pashto"]] as const) {
      await page.addInitScript((value) => localStorage.setItem("sarafi-language", value), language);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${workspace}/home?role=owner`);
      await page.locator(".calm-home").waitFor();
      await page.screenshot({ path: path.join(output, `${label}-desktop-owner-home.png`), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${workspace}/transactions/new?role=cashier`);
      await page.locator(".transaction-family-grid").waitFor();
      await page.screenshot({ path: path.join(output, `${label}-mobile-390-transactions.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${workspace}/home?role=owner`);
    await page.locator(".calm-home").waitFor();
    await page.screenshot({ path: path.join(output, "pashto-mobile-360-owner-home.png"), fullPage: true });
  });
});
