import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const authUrl = process.env.SARAFI_AUTH_E2E_URL;

test.describe("accessibility acceptance", () => {
  test("public workspace has no critical or serious automated violations", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("/");
    const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });

  test("cashier actions are keyboard reachable in the public workspace", async ({
    page,
  }) => {
    await page.goto("/app/inspection/transactions/new?role=cashier");
    for (const action of [/Currency Exchange/, /Money In/, /Money Out/, /Move Our Money/, /^Debt/, /^Hawala/]) {
      const control = page.getByRole("button", { name: action }).first();
      await expect(control).toBeVisible();
      await control.focus();
      await expect(control).toBeFocused();
    }
    await page.getByRole("button", { name: /Currency Exchange/ }).click();
    for (const action of [/Buy currency/, /Sell currency/]) {
      const control = page.getByRole("button", { name: action });
      await expect(control).toBeVisible();
      await control.focus();
      await expect(control).toBeFocused();
    }
  });

  test("trade page is keyboard usable and returns to the transaction types", async ({
    page,
  }) => {
    await page.goto("/app/inspection/transactions/new?role=owner");
    await page.getByRole("button", { name: /^Currency Exchange/ }).click();
    await page.getByRole("button", { name: "Buy currency", exact: true }).click();
    const form = page.locator(".transaction-page-form");
    await expect(form).toBeVisible();
    await expect(page).toHaveURL(/\/transactions\/new\/fx\/buy$/);
    const amount = form.getByRole("textbox", { name: /We receive/ });
    await amount.focus();
    await expect(amount).toBeFocused();
    await amount.fill("1000");
    const back = form.getByRole("button", { name: "Close trade" });
    await back.focus();
    await expect(back).toBeFocused();
    await back.click();
    await expect(page).toHaveURL(/\/transactions\/new$/);
    await expect(page.getByRole("heading", { name: "Make a Transaction" })).toBeVisible();
  });

  test("trade page has no critical or serious automated violations", async ({
    page,
  }) => {
    await page.goto("/app/inspection/transactions/new?role=owner");
    await page.getByRole("button", { name: /^Currency Exchange/ }).click();
    await page.getByRole("button", { name: "Buy currency", exact: true }).click();
    const results = await new AxeBuilder({ page })
      .include(".financial-task-form")
      .setLegacyMode(true)
      .analyze();
    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
});

test.describe("production authentication accessibility", () => {
  test.skip(
    !authUrl,
    "Set SARAFI_AUTH_E2E_URL to run authentication accessibility against a production-like target",
  );

  test("authentication screen has no critical or serious automated violations", async ({
    page,
  }) => {
    await page.goto(authUrl!);
    const results = await new AxeBuilder({ page }).setLegacyMode(true).analyze();
    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
  });
});
