import { expect, test } from "@playwright/test";

test.describe("role-aware workspace presentation", () => {
  test("cashier sees daily actions and only assigned operational navigation", async ({
    page,
  }) => {
    await page.goto("/?role=cashier");
    await expect(page.locator(".sidebar-footer")).toContainText("Cashier");
    await expect(page.getByRole("button", { name: "New transaction" })).toBeEnabled();
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /^Customers/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Reports/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Manage Sarafi/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Import data/ }),
    ).not.toBeVisible();
    await page.locator(".sidebar nav").getByRole("button", { name: /^Customers/ }).click();
    await expect(page.getByRole("heading", { name: "Customers & Sarafs" })).toBeVisible();
    await page.locator(".sidebar nav").getByRole("button", { name: /^Make a Transaction/ }).click();
    await expect(page.locator(".transaction-family-grid > button")).toHaveCount(6);
  });

  test("viewer is visibly read-only and cannot open financial entry controls", async ({
    page,
  }) => {
    await page.goto("/?role=viewer");
    await expect(page.locator(".sidebar-footer")).toContainText("Viewer");
    await expect(
      page.locator(".sidebar nav").getByRole("button", { name: /Make a Transaction/ }),
    ).toHaveCount(0);
    await page.goto("/app/inspection/transactions/new/fx/buy?role=viewer");
    await expect(page.getByRole("heading", { name: "Access not allowed" })).toBeVisible();
    await expect(page.locator(".financial-task-form")).toHaveCount(0);
  });

  for (const [role, heading] of [
    ["owner", "Your exchange at a glance"],
    ["business_admin", "Operations are under control"],
    ["manager", "Today’s branch work"],
    ["accountant", "Review today’s books"],
    ["cashier", "Ready for the next customer"],
    ["compliance_officer", "Compliance review queue"],
    ["viewer", "Business overview"],
  ] as const) {
    test(`${role} receives a clearly named role workspace`, async ({ page }) => {
      await page.goto(`/?role=${role}`);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    });
  }

  for (const [role, labels] of [
    ["owner", ["Home", "Make a Transaction", "My Money", "Activity", "Rates", "Manage Sarafi"]],
    ["business_admin", ["Home", "Make a Transaction", "Customers", "Activity", "Rates", "Manage Sarafi"]],
    ["manager", ["Home", "Make a Transaction", "Cashboxes", "Activity", "Rates", "Team"]],
    ["cashier", ["Home", "Make a Transaction", "Customers", "My Activity", "Close Cashbox"]],
    ["accountant", ["Home", "Activity", "Reports", "Debts", "Reconcile"]],
    ["compliance_officer", ["Home", "Hawala Review", "Reviews", "Cases", "Search"]],
    ["viewer", ["Home", "My Money", "Activity", "Reports", "Search"]],
  ] as const) {
    test(`${role} receives the required role navigation`, async ({ page }) => {
      await page.goto(`/?role=${role}`);
      const navigation = page.locator(".sidebar nav");
      await expect(navigation.getByRole("button")).toHaveCount(labels.length);
      for (const label of labels) {
        await expect(navigation.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
      }
    });
  }

  test("accountant can review reports but cannot post transactions", async ({ page }) => {
    await page.goto("/?role=accountant");
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /Make a Transaction/ })).toHaveCount(0);
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /^Reports/ })).toBeVisible();
    await page.goto("/app/inspection/transactions/new/money-in/receive?role=accountant");
    await expect(page.getByRole("heading", { name: "Access not allowed" })).toBeVisible();
    await expect(page.locator(".financial-task-form")).toHaveCount(0);
  });
});
