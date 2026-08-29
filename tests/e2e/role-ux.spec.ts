import { expect, test } from "@playwright/test";

test.describe("role-aware workspace presentation", () => {
  test("cashier sees daily actions, cashbox, and settings without owner controls", async ({
    page,
  }) => {
    await page.goto("/?role=cashier");
    await expect(page.locator(".sidebar-footer")).toContainText("Cashier");
    for (const action of [
      "Buy currency",
      "Sell currency",
      "Exchange currency",
      "Receive money",
      "Pay money",
    ]) {
      await expect(
        page.getByRole("button", { name: action, exact: true }),
      ).toBeEnabled();
    }
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: /More/ })
      .click();
    await expect(
      page.getByRole("button", { name: /^Check cashbox/ }),
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
  });

  test("viewer is visibly read-only and cannot open financial entry controls", async ({
    page,
  }) => {
    await page.goto("/?role=viewer");
    await expect(page.locator(".sidebar-footer")).toContainText("Viewer");
    for (const action of [
      "Buy currency",
      "Sell currency",
      "Exchange currency",
      "Receive money",
      "Pay money",
      "More actions",
    ]) {
      await expect(page.getByRole("button", { name: action })).toBeDisabled();
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
});
