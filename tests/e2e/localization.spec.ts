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
  "AED",
  "PKR",
  "GBP",
  "SAR",
  "CNY",
  "INR",
  "IRR",
  "CHF",
  "AUD",
  "CAD",
  "RUB",
  "DKK",
  "SEK",
  "NOK",
  "TRY",
  "KWD",
  "QAR",
  "BHD",
  "JPY",
  "CSV",
  "PDF",
  "WhatsApp",
  "AI",
  "Ahmad",
  "Rahimi",
  "Farid",
  "Sediq",
  "Rahmani",
  "Laila",
  "Azizi",
  "Herat",
  "Main",
  "INCOMING",
]);

async function visibleLatinWords(page: Page) {
  return page.locator("body").evaluate((body) => {
    const text = (body as HTMLElement).innerText.replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "",
    );
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
    moneyHeading: "پول من",
    peopleNav: "مشتریان، طلب و قرض",
    peopleHeading: "مشتریان و صرافان",
    transactionsNav: "معاملات",
    transactionsHeading: "تاریخچه معاملات",
    reports: "گزارش‌ها",
    reportsHeading: "نسخه دقیق گزارش",
    rates: "نرخ‌ها",
    ratesHeading: "نرخ‌های بازار",
    cashbox: "بررسی صندوق",
    cashboxHeading: "بررسی صندوق",
    team: "کارمندان و دستگاه‌ها",
    settings: "تنظیمات",
    settingsHeading: "تنظیمات صرافی",
    importData: "انتقال معلومات",
    importHeading: "مرکز انتقال معلومات",
    hawala: "حواله",
    manageHeading: "مدیریت سرافی",
    buy: "خرید اسعار",
    buyHeading: /خرید اسعار/,
    give: /ما می‌دهیم/,
    receive: /ما می‌گیریم/,
  },
  {
    code: "ps-AF",
    languageLabel: "Change language",
    home: "کور",
    moneyNav: "زما پیسې",
    moneyHeading: "زما پیسې",
    peopleNav: "پېرودونکي او پورونه",
    peopleHeading: "پېرودونکي او صرافان",
    transactionsNav: "معاملې",
    transactionsHeading: "د معاملو تاریخچه",
    reports: "راپورونه",
    reportsHeading: "د راپور کره نسخه",
    rates: "نرخونه",
    ratesHeading: "د بازار نرخونه",
    cashbox: "د صندوق کتنه",
    cashboxHeading: "صندوق کتل",
    team: "کارکوونکي او وسایل",
    settings: "امستنې",
    settingsHeading: "د صرافۍ امستنې",
    importData: "معلومات لېږدول",
    importHeading: "د معلوماتو د لېږد مرکز",
    hawala: "حواله",
    manageHeading: "سرافي اداره کړئ",
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
    test.setTimeout(60_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page
      .getByRole("combobox", { name: locale.languageLabel })
      .selectOption(locale.code);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("button", { name: locale.home })).toBeVisible();
    await expectNoEnglishLeak(page, `${locale.code} home`);

    await page.goto("/app/inspection/transactions/new/fx/buy");
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
    await page.locator(".transaction-back").click();

    for (const [path, heading] of [
      ["/app/inspection/money", locale.moneyHeading],
      ["/app/inspection/customers", locale.peopleHeading],
      ["/app/inspection/transactions", locale.transactionsHeading],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expectNoEnglishLeak(page, `${locale.code} ${path}`);
    }

    for (const [path, heading] of [
      ["/app/inspection/reports", locale.reportsHeading],
      ["/app/inspection/control/rates", locale.ratesHeading],
      ["/app/inspection/reconciliation", locale.cashboxHeading],
      ["/app/inspection/control/team", locale.team],
      ["/app/inspection/control", locale.manageHeading],
      ["/app/inspection/hawala", locale.hawala],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expectNoEnglishLeak(page, `${locale.code} ${path}`);
    }
  });
}

test("switching from Dari to Pashto replaces, rather than mixes, translated copy", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile and preferences" }).click();
  const selector = page.getByRole("combobox", { name: "Change language" });
  await selector.selectOption("fa-AF");
  await expect(
    page.getByRole("heading", { name: "خلاصه صرافی شما" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "تغییر زبان" })
    .selectOption("ps-AF");
  await expect(
    page.getByRole("heading", { name: "ستاسو د صرافۍ لنډیز" }),
  ).toBeVisible();
  await expect(
    page.getByText("خلاصه صرافی شما", { exact: true }),
  ).not.toBeVisible();
});

test("Afghan Dari transaction forms use short shop wording", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("sarafi-language", "fa-AF"));

  await page.goto("/app/inspection/transactions/new/fx/buy");
  const exchangeRow = page.locator(".exchange-entry-row");
  await expect(exchangeRow.getByRole("textbox", { name: "ما می‌گیریم USD" })).toBeVisible();
  await expect(exchangeRow.getByRole("textbox", { name: "نرخ معامله" })).toHaveValue("70.25");
  await expect(exchangeRow.getByRole("textbox", { name: "ما می‌دهیم AFN" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "کمیشن (AFN)" })).toBeVisible();

  await page.goto("/app/inspection/transactions/new/money-in/receive");
  await expect(page.getByRole("heading", { name: "پول گرفتن" })).toBeVisible();
  await expect(page.getByText("این پول به صرافی می‌آید.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /گرفتن پول را ثبت کنید/ })).toBeVisible();

  await page.goto("/app/inspection/transactions/new/money-out/pay");
  await expect(page.getByRole("heading", { name: "پول دادن" })).toBeVisible();
  await expect(page.getByText("این پول از صرافی بیرون می‌شود.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /دادن پول را ثبت کنید/ })).toBeVisible();

  await page.goto("/app/inspection/transactions/new/debt/receivable");
  await expect(page.getByRole("heading", { name: "مردم به ما قرضدار اند" })).toBeVisible();
  await expect(page.getByText("این شخص باید این پول را به ما بدهد.", { exact: true })).toBeVisible();

  await page.goto("/app/inspection/transactions/new/debt/payable");
  await expect(page.getByRole("heading", { name: "ما به مردم قرضدار استیم" })).toBeVisible();
  await expect(page.getByText("ما باید این پول را به این شخص بدهیم.", { exact: true })).toBeVisible();
});

for (const locale of [
  {
    code: "fa-AF",
    money: "پول من",
    cashboxes: "موجودی صندوق‌ها",
    currenciesTab: "اسعار",
    currencies: "اسعار مورد استفاده صرافی",
    search: "جستجوی اسعار",
  },
  {
    code: "ps-AF",
    money: "زما پیسې",
    cashboxes: "د صندوقونو پیسې",
    currenciesTab: "اسعار",
    currencies: "د صرافۍ کارېدونکي اسعار",
    search: "اسعار ولټوئ",
  },
] as const) {
  test(`${locale.code} money controls use local wording`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page
      .getByRole("combobox", { name: "Change language" })
      .selectOption(locale.code);
    await page.goto("/app/inspection/money");
    await expect(page.getByRole("heading", { name: locale.money, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: locale.cashboxes, exact: true })).toBeVisible();
    await expect(page.locator(".account-card")).toHaveCount(1);
    await expectNoEnglishLeak(page, `${locale.code} money controls`);
    await page.goto("/app/inspection/control/business?role=owner");
    await page.getByRole("tab", { name: new RegExp(locale.currenciesTab) }).click();
    await expect(page.getByRole("heading", { name: locale.currencies })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: locale.search })).toBeVisible();
  });
}
