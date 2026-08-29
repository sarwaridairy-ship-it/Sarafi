import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

const outputDirectory = path.resolve("test-results/web-ux-production");

const locales = [
  {
    code: "en",
    slug: "en",
    authLanguage: "English",
    buy: "Buy currency",
    sell: "Sell currency",
    money: /My money/,
    people: /Customers & debts/,
    transactions: /Transactions/,
    settings: /Settings/,
    compliance: /Compliance/,
  },
  {
    code: "fa-AF",
    slug: "dari",
    authLanguage: "دری",
    buy: "خرید ارز",
    sell: "فروش ارز",
    money: /پول من/,
    people: /مشتریان و قرض‌ها/,
    transactions: /معاملات/,
    settings: /تنظیمات/,
    compliance: /بررسی اصول کاری/,
  },
  {
    code: "ps-AF",
    slug: "pashto",
    authLanguage: "پښتو",
    buy: "د اسعارو پېرود",
    sell: "د اسعارو پلور",
    money: /زما پیسې/,
    people: /پېرودونکي او پورونه/,
    transactions: /معاملې/,
    settings: /امستنې/,
    compliance: /د اصولو کتنه/,
  },
] as const;

test("capture controlled three-language desktop and mobile UX matrix", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "One controlled Chromium visual matrix is sufficient",
  );
  test.setTimeout(180_000);
  await mkdir(outputDirectory, { recursive: true });

  for (const locale of locales) {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/?public=1");
    await page.getByRole("button", { name: locale.authLanguage, exact: true }).click();
    await page.screenshot({
      path: path.join(outputDirectory, `public-${locale.slug}-desktop.png`),
      fullPage: true,
    });

    await page.goto("/");
    await page.locator("select.lang-button").selectOption(locale.code);
    await page.screenshot({
      path: path.join(outputDirectory, `owner-home-${locale.slug}-desktop.png`),
      fullPage: true,
    });

    await page.goto("/?role=cashier");
    await page.locator("select.lang-button").selectOption(locale.code);
    await page.screenshot({
      path: path.join(
        outputDirectory,
        `cashier-home-${locale.slug}-desktop.png`,
      ),
      fullPage: true,
    });

    await page.goto("/");
    await page.locator("select.lang-button").selectOption(locale.code);

    for (const [kind, button, inputLabel] of [
      [
        "buy",
        locale.buy,
        locale.code === "en"
          ? /We receive/
          : locale.code === "fa-AF"
            ? /ما دریافت می‌کنیم/
            : /موږ ترلاسه کوو/,
      ],
      [
        "sell",
        locale.sell,
        locale.code === "en"
          ? /We give/
          : locale.code === "fa-AF"
            ? /ما می‌دهیم/
            : /موږ ورکوو/,
      ],
    ] as const) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await page
        .locator(".trade-modal")
        .getByRole("textbox", { name: inputLabel })
        .fill("1000");
      await page
        .locator(".trade-modal")
        .getByRole("button", {
          name:
            locale.code === "en"
              ? "Review transaction"
              : locale.code === "fa-AF"
                ? "بررسی معامله"
                : "معامله کتل",
        })
        .click();
      await page.screenshot({
        path: path.join(outputDirectory, `${kind}-${locale.slug}-desktop.png`),
        fullPage: true,
      });
      await page.locator(".trade-modal .close").click();
    }

    for (const [route, button] of [
      ["my-money", locale.money],
      ["customers-debts", locale.people],
      ["transactions", locale.transactions],
    ] as const) {
      await page
        .locator(".sidebar nav")
        .getByRole("button", { name: button })
        .click();
      await page.screenshot({
        path: path.join(outputDirectory, `${route}-${locale.slug}-desktop.png`),
        fullPage: true,
      });
    }

    await page.locator(".sidebar nav > button[aria-expanded]").click();
    await page.screenshot({
      path: path.join(outputDirectory, `more-${locale.slug}-desktop.png`),
      fullPage: true,
    });
    await page.locator(".navigation-menu").getByRole("button", { name: locale.settings }).click();
    await page.screenshot({
      path: path.join(outputDirectory, `settings-${locale.slug}-desktop.png`),
      fullPage: true,
    });
    await page.locator(".sidebar nav > button[aria-expanded]").click();
    await page.locator(".navigation-menu").getByRole("button", { name: locale.compliance }).click();
    await page.screenshot({
      path: path.join(outputDirectory, `compliance-${locale.slug}-desktop.png`),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator("select.lang-button").selectOption(locale.code);
    await page.screenshot({
      path: path.join(
        outputDirectory,
        `owner-home-${locale.slug}-mobile-390.png`,
      ),
      fullPage: true,
    });
    await page.locator(".mobile-nav > button[aria-expanded]").click();
    await page.screenshot({
      path: path.join(outputDirectory, `more-${locale.slug}-mobile-390.png`),
      fullPage: true,
    });
    await page.locator(".mobile-more-menu").getByRole("button", { name: locale.settings }).click();
    await page.screenshot({
      path: path.join(outputDirectory, `settings-${locale.slug}-mobile-390.png`),
      fullPage: true,
    });
  }
});
