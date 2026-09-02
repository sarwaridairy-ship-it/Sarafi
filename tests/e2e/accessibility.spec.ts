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
    await page.goto("/");
    for (const action of [
      /New transaction/,
      /Receive money/,
      /Pay money/,
      /^Debts$/,
      /Transfer cash/,
    ]) {
      const control = page.getByRole("button", { name: action }).first();
      await expect(control).toBeVisible();
      await control.focus();
      await expect(control).toBeFocused();
    }
  });

  test("trade dialog traps focus, closes with Escape, and restores focus", async ({
    page,
  }) => {
    await page.goto("/");
    const launch = page.locator(".trade-launch");
    await launch.click();
    const dialog = page.getByRole("dialog", { name: /Buy currency/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: /We receive/ }).fill("1000");
    await dialog.getByRole("button", { name: "Review transaction" }).click();
    const confirm = dialog.getByRole("button", { name: "Confirm and save" });
    const close = dialog.getByRole("button", { name: "Close trade" });
    await confirm.focus();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(launch).toBeFocused();
  });

  test("trade dialog has no critical or serious automated violations", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".trade-launch").click();
    const results = await new AxeBuilder({ page })
      .include(".trade-modal")
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
