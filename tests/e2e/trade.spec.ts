import { expect, test } from "@playwright/test";

test("visitors can open the public workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("SARAFI · Digital daftar for Sarafi shops");
  await expect(
    page.getByRole("heading", { name: "Good morning." }),
  ).toBeVisible();
  await expect(page.getByText("Read-only inspection")).toBeVisible();
});
