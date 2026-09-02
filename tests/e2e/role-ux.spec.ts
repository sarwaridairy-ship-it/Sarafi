import { expect, test } from "@playwright/test";

test.describe("role-aware workspace presentation", () => {
  test("cashier sees daily actions, cashbox, and settings without owner controls", async ({
    page,
  }) => {
    await page.goto("/?role=cashier");
    await expect(page.locator(".sidebar-footer")).toContainText("Cashier");
    for (const action of [
      /New transaction/,
      /Receive money/,
      /Pay money/,
      /Transfer cash/,
      /Expense/,
    ]) {
      await expect(
        page.getByRole("button", { name: action }).first(),
      ).toBeEnabled();
    }
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: /More/ })
      .click();
    await expect(
      page.locator(".navigation-menu").getByRole("button", { name: /^Check cashbox/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Settings/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Reports/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Team & Devices/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Import data/ }),
    ).not.toBeVisible();
    await page.locator(".sidebar nav").getByRole("button", { name: /My money/ }).click();
    await page.locator(".money-place-manager > summary").click();
    await expect(
      page.getByRole("button", { name: "Add money account" }),
    ).not.toBeVisible();
    await expect(page.locator(".currency-manager")).not.toBeVisible();
    await expect(page.getByText("Currencies ready to use", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Only the owner can add or change money accounts. Employees can use only the accounts assigned to them.",
      ),
    ).toBeVisible();
  });

  test("viewer is visibly read-only and cannot open financial entry controls", async ({
    page,
  }) => {
    await page.goto("/?role=viewer");
    await expect(page.locator(".sidebar-footer")).toContainText("Viewer");
    for (const action of [
      /New transaction .*Buy currency/,
      /Receive money/,
      /Pay money/,
    ]) {
      await expect(page.getByRole("button", { name: action }).first()).toBeDisabled();
    }
    await expect(
      page.locator(".sidebar nav").getByRole("button", {
        name: /New transaction/,
      }),
    ).toBeDisabled();
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: /More/ })
      .click();
    await expect(page.getByRole("button", { name: /^Settings/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Check cashbox/ }),
    ).not.toBeVisible();
  });

  for (const [role, heading] of [
    ["owner", "Owner control center"],
    ["manager", "Daily operations"],
    ["accountant", "Accounts and reports"],
    ["cashier", "My counter today"],
    ["compliance_officer", "Compliance review"],
    ["viewer", "Read-only review"],
  ] as const) {
    test(`${role} receives a clearly named role workspace`, async ({ page }) => {
      await page.goto(`/?role=${role}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    });
  }

  test("accountant can review reports but cannot post transactions", async ({ page }) => {
    await page.goto("/?role=accountant");
    await expect(page.getByRole("button", { name: /New transaction .*Buy currency/ })).toBeDisabled();
    await page.locator(".sidebar nav").getByRole("button", { name: /More/ }).click();
    await expect(page.locator(".navigation-menu").getByRole("button", { name: /^Reports/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Team & Devices/ })).toHaveCount(0);
  });
});
