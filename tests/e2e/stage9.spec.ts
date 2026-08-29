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
      page.getByRole("heading", { name: "Good morning." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Buy currency", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Workspace" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /My money/ })).toBeVisible();
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

  test("More remains grouped and readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: /More/ })
      .click();
    const menu = page.locator(".mobile-more-menu");
    await expect(menu).toBeVisible();
    for (const group of ["Business", "Team", "Settings", "Advanced"]) {
      await expect(
        menu.locator(".menu-group-label").getByText(group, { exact: true }),
      ).toBeVisible();
    }
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

  test("desktop More menu stays inside the sidebar and every item is reachable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page
      .locator(".sidebar nav")
      .getByRole("button", { name: /More/ })
      .click();
    const menu = page.locator(".navigation-menu");
    await expect(menu).toBeVisible();
    const bounds = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport);
    await menu.getByRole("button", { name: /Settings/ }).click();
    await expect(
      page.getByRole("heading", { name: "Shop settings" }),
    ).toBeVisible();
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
