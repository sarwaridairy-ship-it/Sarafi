import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

const outputDirectory = path.resolve("test-results/web-ux-production");

const roles = [
  "owner",
  "business_admin",
  "manager",
  "cashier",
  "accountant",
  "compliance_officer",
  "viewer",
] as const;

const locales = [
  {
    code: "en",
    slug: "en",
    authLanguage: "English",
    trade: /New transaction/,
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
    trade: /معامله جدید/,
    buy: "خرید اسعار",
    sell: "فروش اسعار",
    money: /پول من/,
    people: /مشتریان، طلب و قرض/,
    transactions: /معاملات/,
    settings: /تنظیمات/,
    compliance: /بررسی اصول کاری/,
  },
  {
    code: "ps-AF",
    slug: "pashto",
    authLanguage: "پښتو",
    trade: /نوې معامله/,
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
  test.setTimeout(360_000);
  await mkdir(outputDirectory, { recursive: true });

  for (const locale of locales) {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/?public=1");
    await page.getByRole("button", { name: locale.authLanguage, exact: true }).click();
    await page.screenshot({
      path: path.join(outputDirectory, `public-${locale.slug}-desktop.png`),
      fullPage: true,
    });

    for (const role of roles) {
      await page.goto(`/?role=${role}`);
      await page.screenshot({
        path: path.join(
          outputDirectory,
          `${role.replaceAll("_", "-")}-home-${locale.slug}-desktop.png`,
        ),
        fullPage: true,
      });
    }

    await page.goto("/");

    for (const [kind, route] of [
      ["buy", "/app/inspection/transactions/new/fx/buy"],
      ["sell", "/app/inspection/transactions/new/fx/sell"],
    ] as const) {
      await page.goto(route);
      await page.getByRole("heading", { name: kind === "buy" ? locale.buy : locale.sell }).waitFor();
      await page
        .locator(".financial-task-form .exchange-money-card input:not([readonly])")
        .fill("1000");
      await page
        .locator(".financial-task-form")
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
      await page.locator(".trade-confirmation .text-button").click();
      await page.locator(".transaction-back").click();
    }

    for (const [route, routePath] of [
      ["my-money", "/app/inspection/money"],
      ["customers-debts", "/app/inspection/customers"],
      ["transactions", "/app/inspection/transactions"],
    ] as const) {
      await page.goto(routePath);
      await page.screenshot({
        path: path.join(outputDirectory, `${route}-${locale.slug}-desktop.png`),
        fullPage: true,
      });
    }

    await page.goto("/app/inspection/control/business");
    await page.screenshot({
      path: path.join(outputDirectory, `settings-${locale.slug}-desktop.png`),
      fullPage: true,
    });
    await page.goto("/app/inspection/compliance");
    await page.screenshot({
      path: path.join(outputDirectory, `compliance-${locale.slug}-desktop.png`),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    for (const role of roles) {
      await page.goto(`/?role=${role}`);
      await page.screenshot({
        path: path.join(
          outputDirectory,
          `${role.replaceAll("_", "-")}-home-${locale.slug}-mobile-390.png`,
        ),
        fullPage: true,
      });
    }
    await page.goto("/app/inspection/control/business");
    await page.screenshot({
      path: path.join(outputDirectory, `settings-${locale.slug}-mobile-390.png`),
      fullPage: true,
    });
  }
});
