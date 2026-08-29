import { expect, test, type Page } from "@playwright/test";

const allowedLatinWords = new Set([
  "SARAFI",
  "Kabul",
  "Central",
  "Exchange",
  "English",
  "AFN",
  "USD",
  "EUR",
  "CSV",
  "PDF",
  "WhatsApp",
]);

async function visibleLatinWords(page: Page) {
  return page.locator("body").evaluate((body) => {
    const text = (body as HTMLElement).innerText;
    return [...new Set(text.match(/[A-Za-z]{3,}/g) ?? [])];
  });
}

async function expectNoEnglishLeak(page: Page, route: string) {
  const unexpected = (await visibleLatinWords(page)).filter(
    (word) => !allowedLatinWords.has(word),
  );
  expect(unexpected, `${route} contains visible English words`).toEqual([]);
}

const locales = [
  {
    code: "fa-AF",
    languageLabel: "Change language",
    home: "خانه",
    moneyNav: "پول من",
    moneyHeading: "پول من کجا است؟",
    peopleNav: "مشتریان و قرض‌ها",
    peopleHeading: "مشتریان و صرافان",
    transactionsNav: "معاملات",
    transactionsHeading: "تاریخچه معاملات",
    more: "بیشتر",
    reports: "گزارش‌ها",
    reportsHeading: "گزارش‌ها",
    rates: "نرخ‌ها",
    ratesHeading: "نرخ‌های صرافی",
    cashbox: "بررسی صندوق",
    cashboxHeading: "بررسی صندوق",
    team: "کارمندان و دستگاه‌ها",
    settings: "تنظیمات",
    importData: "انتقال معلومات",
    importHeading: "مرکز انتقال معلومات",
    hawala: "حواله",
    buy: "خرید ارز",
    buyHeading: /خرید ارز/,
    give: /ما می‌دهیم/,
    receive: /ما دریافت می‌کنیم/,
  },
  {
    code: "ps-AF",
    languageLabel: "Change language",
    home: "کور",
    moneyNav: "زما پیسې",
    moneyHeading: "زما پیسې چېرته دي؟",
    peopleNav: "پېرودونکي او پورونه",
    peopleHeading: "پېرودونکي او صرافان",
    transactionsNav: "معاملې",
    transactionsHeading: "د معاملو تاریخچه",
    more: "نور",
    reports: "راپورونه",
    reportsHeading: "راپورونه",
    rates: "نرخونه",
    ratesHeading: "د صرافۍ نرخونه",
    cashbox: "د صندوق کتنه",
    cashboxHeading: "صندوق کتل",
    team: "کارکوونکي او وسایل",
    settings: "امستنې",
    importData: "معلومات لېږدول",
    importHeading: "د معلوماتو د لېږد مرکز",
    hawala: "حواله",
    buy: "د اسعارو پېرود",
    buyHeading: /د اسعارو پېرود/,
    give: /موږ ورکوو/,
    receive: /موږ ترلاسه کوو/,
  },
] as const;

for (const locale of locales) {
  test(`${locale.code} core workspace has semantic translations without English leakage`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("combobox", { name: locale.languageLabel })
      .selectOption(locale.code);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: locale.home })).toBeVisible();
    await expectNoEnglishLeak(page, `${locale.code} home`);

    await page.getByRole("button", { name: locale.buy, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: locale.buyHeading }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: locale.give }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: locale.receive }),
    ).toBeVisible();
    await expectNoEnglishLeak(page, `${locale.code} buy`);
    await page.locator(".trade-modal .close").click();

    for (const [button, heading] of [
      [locale.moneyNav, locale.moneyHeading],
      [locale.peopleNav, locale.peopleHeading],
      [locale.transactionsNav, locale.transactionsHeading],
    ] as const) {
      await page.getByRole("button", { name: new RegExp(button) }).click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expectNoEnglishLeak(page, `${locale.code} ${button}`);
    }

    const moreButton = page
      .locator(".sidebar nav")
      .getByRole("button", { name: new RegExp(locale.more) });
    for (const [button, heading] of [
      [locale.reports, locale.reportsHeading],
      [locale.rates, locale.ratesHeading],
      [locale.cashbox, locale.cashboxHeading],
      [locale.team, locale.team],
      [locale.settings, locale.settings],
      [locale.importData, locale.importHeading],
      [locale.hawala, locale.hawala],
    ] as const) {
      await moreButton.click();
      await page
        .getByRole("button", { name: new RegExp(`^${button}`) })
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expectNoEnglishLeak(page, `${locale.code} ${button}`);
    }
  });
}

test("switching from Dari to Pashto replaces, rather than mixes, translated copy", async ({
  page,
}) => {
  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Change language" });
  await selector.selectOption("fa-AF");
  await expect(
    page.getByRole("heading", { name: "فعالیت اخیر" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "تغییر زبان" })
    .selectOption("ps-AF");
  await expect(
    page.getByRole("heading", { name: "وروستی فعالیت" }),
  ).toBeVisible();
  await expect(
    page.getByText("فعالیت اخیر", { exact: true }),
  ).not.toBeVisible();
});
