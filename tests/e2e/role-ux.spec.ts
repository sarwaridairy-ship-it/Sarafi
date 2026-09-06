import { expect, test } from "@playwright/test";

test.describe("role-aware workspace presentation", () => {
  test("cashier sees daily actions and only assigned operational navigation", async ({
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
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /^Customers/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Reports/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Team & Devices/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Import data/ }),
    ).not.toBeVisible();
    await page.locator(".sidebar nav").getByRole("button", { name: /^Customers/ }).click();
    await expect(page.getByRole("heading", { name: "Customers & Sarafs" })).toBeVisible();
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
      page.locator(".sidebar nav").getByRole("button", { name: /New transaction/ }),
    ).toHaveCount(0);
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /^Money/ })).toBeVisible();
  });

  for (const [role, heading] of [
    ["owner", "Owner control center"],
    ["business_admin", "Business operations"],
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

  for (const [role, labels] of [
    ["owner", ["Home", "Make a Transaction", "My Money", "Activity", "Control Center"]],
    ["business_admin", ["Home", "Make a Transaction", "Customers", "Activity", "Manage Sarafi"]],
    ["manager", ["Home", "Make a Transaction", "Cashboxes", "Activity", "Team"]],
    ["cashier", ["Home", "Make a Transaction", "Customers", "My Activity", "Close Cashbox"]],
    ["accountant", ["Home", "Transactions", "Reports", "Debts", "Reconcile"]],
    ["compliance_officer", ["Home", "Hawala", "Reviews", "Cases", "Search"]],
    ["viewer", ["Home", "Money", "Transactions", "Reports", "Search"]],
  ] as const) {
    test(`${role} receives the required five-item navigation`, async ({ page }) => {
      await page.goto(`/?role=${role}`);
      const navigation = page.locator(".sidebar nav");
      await expect(navigation.getByRole("button")).toHaveCount(5);
      for (const label of labels) {
        await expect(navigation.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
      }
    });
  }

  test("accountant can review reports but cannot post transactions", async ({ page }) => {
    await page.goto("/?role=accountant");
    await expect(page.getByRole("button", { name: /New transaction .*Buy currency/ })).toBeDisabled();
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /^Reports/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Team & Devices/ })).toHaveCount(0);
  });
});
