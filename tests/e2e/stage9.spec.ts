import { expect, test } from "@playwright/test";

test.describe("Stage 9 browser matrix", () => {
  test("public workspace does not expose authentication controls", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" }),
    ).not.toBeVisible();
  });

  test("dashboard remains usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your exchange at a glance" }),
    ).toBeVisible();
    await expect(
      page.locator(".calm-primary"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Workspace" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Make a Transaction/ })).toBeVisible();
  });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    test(`mobile navigation and content fit at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(
        page.getByRole("navigation", { name: "Workspace" }),
      ).toBeVisible();
      await expect(page.locator(".sidebar")).toBeHidden();
      const layout = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              className: element.className,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              text: element.innerText?.trim().slice(0, 40),
            };
          })
          .filter(
            (item) =>
              item.left < -1 ||
              item.right > document.documentElement.clientWidth + 1,
          )
          .slice(0, 12),
      }));
      expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
        layout.clientWidth,
      );
    });
  }

  test("transaction pages fit the complete three-language viewport matrix", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Chromium performs the complete visual-size matrix");
    test.setTimeout(120_000);
    for (const language of ["en", "fa-AF", "ps-AF"] as const) {
      await page.goto("/");
      await page.evaluate((value) => window.localStorage.setItem("sarafi-language", value), language);
      for (const width of [360, 390, 430, 768, 1024, 1366, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
        await page.goto("/app/inspection/transactions/new/fx/buy");
        await expect(page.locator(".transaction-page-form")).toBeVisible();
        await expect(page.locator(".modal-backdrop form")).toHaveCount(0);
        const layout = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        expect(layout.documentWidth, `${language} at ${width}px`).toBeLessThanOrEqual(layout.viewport);
      }
    }
  });

  test("navigation has no hidden overflow menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "More", exact: true })).toHaveCount(0);
    await expect(page.locator(".mobile-nav button")).toHaveCount(5);
  });

  test("tablet view fits without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await expect(page.locator(".sidebar")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("desktop navigation exposes its five primary destinations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await expect(page.locator(".sidebar nav button")).toHaveCount(5);
    await expect(page.getByRole("button", { name: /Manage Sarafi/ })).toBeVisible();
  });

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`desktop view fits at ${viewport.width}px without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".sidebar")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
});
