import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const productionCsp =
  "default-src 'self'; base-uri 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:";

test.describe("workspace controls", () => {
  test("opening animation completes once and hands off to the real sign-in", async ({
    page,
  }) => {
    await page.route("**/*", async (route) => {
      if (!route.request().isNavigationRequest()) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "content-security-policy": productionCsp,
          "x-frame-options": "DENY",
        },
      });
    });
    await page.goto("/?public=1&opening=replay&openingSpeed=fast");
    await expect(
      page.getByRole("main", { name: "SARAFI opening" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible({ timeout: 8000 });
    await expect(
      page.getByRole("main", { name: "SARAFI opening" }),
    ).toHaveCount(0);

    await page.goto("/?public=1");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("opening animation can be skipped and respects reduced motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?public=1&opening=replay");
    await expect(page).toHaveURL(/\/sarafi-opening\.html\?/);
    await expect(page.locator("#openingMain")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?public=1&opening=replay&motion=reduce");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(
      page.getByRole("main", { name: "SARAFI opening" }),
    ).toHaveCount(0);
  });

  test("opening preserves the supplied story and hands off before real authentication", async ({
    page,
  }) => {
    await page.goto("/sarafi-opening.html?language=fa-AF&frame=0.52");
    await expect(
      page.getByRole("main", { name: "صفحه آغاز صرافی" }),
    ).toBeVisible();
    await expect(page.locator("#paperLayer .paper")).toHaveCount(6);
    await expect
      .poll(() =>
        page.locator("#paperLayer").evaluate((element) =>
          Number((element as SVGElement).style.opacity),
        ),
      )
      .toBeGreaterThan(0);
    await expect(page.getByText("نرخ‌های متغیر و سود نامشخص")).toHaveCount(1);

    await page.goto("/sarafi-opening.html?language=fa-AF&frame=0.90");
    await expect(page.getByText("دفتر هوشمند صرافی")).toBeVisible();
    await expect(page.locator("#brandName")).toBeVisible();
    await expect(page.locator("#authPage")).toBeHidden();
  });

  test("first-time visitor can explain the product and choose a language", async ({
    page,
  }) => {
    await page.goto("/?public=1");
    await expect(
      page.getByRole("heading", {
        name: "Simple digital daftar for Sarafi shops",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Record currency buying and selling, know where your money is, track debts, and control your shop from one place.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Language" })).toBeVisible();
    await page.getByRole("button", { name: "دری", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: "دفتر دیجیتلی ساده برای صرافی‌ها" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "ورود" })).toBeVisible();
  });

  test("primary navigation and More menu open their corresponding views", async ({
    page,
  }) => {
    await page.goto("/");
    for (const section of ["Transactions", "My money", "Customers & debts"]) {
      await page.getByRole("button", { name: new RegExp(section) }).click();
      await expect(
        page.getByRole("heading", {
          name:
            section === "Transactions"
              ? "Transaction history"
              : section === "My money"
                ? "Where is my money?"
                : "Customers & Sarafs",
          exact: true,
        }),
      ).toBeVisible();
    }
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    for (const [button, heading] of [
      ["Rates", "Shop rates"],
      ["Reports", "Reports"],
      ["Check cashbox", "Check cashbox"],
    ]) {
      await page
        .getByRole("button", { name: new RegExp(`^${button}`) })
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: /Back to Home/ }).click();
      await page
        .locator(".sidebar nav")
        .first()
        .getByRole("button", { name: /More/ })
        .click();
    }
    await page.getByRole("button", { name: /Team & Devices/ }).click();
    await expect(
      page.getByRole("heading", { name: "Team & Devices", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /Settings/ }).click();
    await expect(
      page.getByRole("heading", { name: "Shop settings", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".settings-card")).toHaveCount(3);
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /Compliance/ }).click();
    await expect(
      page.getByRole("heading", { name: "Compliance control", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".queue-card")).toHaveCount(2);
  });

  test("help, privacy, filter, and trade controls respond", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open help" }).click();
    await expect(
      page.getByRole("heading", { name: "Help & support" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close help" }).first().click();
    await page
      .locator("header")
      .getByRole("button", { name: "Hide amounts" })
      .click();
    await expect(
      page.locator("header").getByRole("button", { name: "Show amounts" }),
    ).toBeVisible();
    await page.locator(".filter-button").click();
    await expect(page.getByRole("button", { name: "All time" })).toBeVisible();
    await page.getByRole("button", { name: /History/ }).click();
    await expect(
      page.getByRole("heading", { name: "Shop rates", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page.getByRole("button", { name: /View all/ }).click();
    await expect(
      page.getByRole("heading", { name: "Where is my money?", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page.locator(".trade-launch").click();
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await expect(
      page.getByRole("heading", { name: /Sell currency/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await expect(
      page.getByRole("heading", { name: /Sell currency/ }),
    ).not.toBeVisible();
  });

  test("the visible daily grid opens a validated operation form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Expense" }).click();
    await expect(page.getByRole("heading", { name: "Expense" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Amount", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Currency" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Money comes from" }),
    ).toHaveValue("inspection-cashbox");
    await expect(page.locator(".money-flow-summary")).toContainText(
      "Main Counter",
    );
    await expect(page.locator(".money-flow-summary")).toContainText("Expense");
    await page.getByRole("button", { name: "Close operation" }).click();
    await expect(
      page.getByRole("heading", { name: "Expense" }),
    ).not.toBeVisible();
  });

  test("transfer visibly connects two different money accounts", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Transfer cash/ }).click();
    await expect(
      page.getByRole("heading", { name: "Transfer cash", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Money comes from" }),
    ).toHaveValue("inspection-cashbox");
    await expect(
      page.getByRole("combobox", { name: "Money goes to" }),
    ).toHaveValue("inspection-safe");
    const flow = page.locator(".money-flow-summary");
    await expect(flow).toContainText("Main Counter");
    await expect(flow).toContainText("Main Safe");
    await page
      .getByRole("combobox", { name: "Money goes to" })
      .selectOption("inspection-cashbox");
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("100");
    await page.getByRole("button", { name: /Post operation/ }).click();
    await expect(
      page.getByText("Choose two different accounts for this transfer."),
    ).toBeVisible();
  });

  test("foreign-currency operations require their AFN book value", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Expense" }).click();
    await page.getByRole("combobox", { name: "Currency" }).selectOption("USD");
    await expect(
      page.getByRole("textbox", { name: /Value in AFN/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/Currencies are never added together without a value/),
    ).toBeVisible();
  });

  test("transaction history shows the source and destination for each movement", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Transactions/ }).click();
    const rows = page.locator(".balance-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".transaction-flow-line")).toContainText(
      "Main Counter → Expense",
    );
    await expect(rows.nth(1).locator(".transaction-flow-line")).toContainText(
      "Customer or outside party → Main Counter",
    );
  });

  test("language selection switches RTL and survives reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Change language" })
      .selectOption("fa-AF");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("صبح بخیر.")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fa-AF");
    await expect(page.getByText("صبح بخیر.")).toBeVisible();
    await page
      .getByRole("combobox", { name: "تغییر زبان" })
      .selectOption("ps-AF");
    await expect(page.locator("html")).toHaveAttribute("lang", "ps-AF");
    await expect(page.getByText("زما پیسې").first()).toBeVisible();
  });

  test("translated trade labels keep the business perspective", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      window.localStorage.removeItem("sarafi-language"),
    );
    await page.goto("/");
    await page.locator(".trade-launch").click();
    await expect(page.getByRole("textbox", { name: /We give/ })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /We receive/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await page
      .getByRole("combobox", { name: "Change language" })
      .selectOption("fa-AF");
    await page.locator(".trade-launch").click();
    await page.getByRole("tab", { name: /خرید ارز/ }).click();
    await expect(
      page.getByRole("textbox", { name: /ما می‌دهیم/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /ما دریافت می‌کنیم/ }),
    ).toBeVisible();
  });

  test("debts section exposes receivable and payable posting fields", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Customers & debts/ }).click();
    await page.getByRole("button", { name: "Add debt" }).click();
    await expect(
      page.getByRole("heading", { name: "Debts", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Who owes whom?" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Who owes whom?" })
      .selectOption("payable");
    await expect(
      page.getByRole("combobox", { name: "Who owes whom?" }),
    ).toHaveValue("payable");
    await expect(page.getByRole("button", { name: /Save debt/ })).toBeVisible();
  });

  test("reconciliation section exposes cash count and variance reason fields", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /^Check cashbox/ }).click();
    await expect(
      page.getByRole("heading", { name: "Check cashbox", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /Counted amount · AFN/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /Counted amount · USD/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Reason for the difference" }),
    ).toBeVisible();
    await expect(
      page.getByText("Expected and counted cash").first(),
    ).toBeVisible();
  });

  test("owner can create a branch-and-cashbox-scoped employee invitation", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /Team & Devices/ }).click();
    await expect(
      page.getByRole("heading", { name: "Team & Devices", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Team access", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Registered devices", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Approval requests", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add employee" }).click();
    await expect(
      page.getByRole("heading", { name: "Add employee", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Allowed branches" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Allowed cashboxes" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Main branch" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Main Counter" })).toBeChecked();

    await page.getByRole("textbox", { name: "Full name" }).fill("Farid Ahmad");
    await page
      .getByRole("textbox", { name: "Work email" })
      .fill("farid.ahmad@example.com");
    await expect(page.getByRole("combobox", { name: "Job role" })).toHaveValue(
      "cashier",
    );
    await page.getByRole("button", { name: "Create invitation" }).click();

    await expect(page.getByText("Invitation ready", { exact: true })).toBeVisible();
    const invitationLink = page.getByRole("textbox", {
      name: "Copy invitation link",
    });
    await expect(invitationLink).toHaveValue(/\?invite=[a-f0-9]{64}$/);
    const pendingInvitation = page.locator("article").filter({
      has: page.getByText("farid.ahmad@example.com", { exact: true }),
    });
    await expect(
      pendingInvitation.getByText("Farid Ahmad · Cashier", { exact: true }),
    ).toBeVisible();
    await expect(
      pendingInvitation.getByText("Assigned to: Main branch · Main Counter", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("invitation link clearly offers sign-in or account creation", async ({
    page,
  }) => {
    await page.goto(`/?public=1&invite=${"ab".repeat(32)}`);
    await expect(
      page.getByRole("heading", { name: "Join your Sarafi team", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Sign in or create an account with the email address that received this invitation.",
      ),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Create an account" }).click();
    await expect(
      page.getByRole("button", { name: /Create account and join/ }),
    ).toBeVisible();
  });

  test.skip("offline drafts stay encrypted and never auto-post", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /^Offline/ }).click();
    await page
      .getByRole("combobox", { name: "Operation" })
      .selectOption("BUY_FX");
    await page.getByRole("textbox", { name: "Amount" }).fill("12345.67");
    await page.getByRole("button", { name: /Save as Draft/ }).click();
    await expect(
      page.getByText(/not posted and will not auto-submit/),
    ).toBeVisible();
    const raw = await page.evaluate(
      async () =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = indexedDB.open("sarafi-offline", 3);
          request.onsuccess = () => {
            const read = request.result
              .transaction("drafts", "readonly")
              .objectStore("drafts")
              .getAll();
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain("12345.67");
    expect(serialized).not.toContain("BUY_FX");
    await page.reload();
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /^Offline/ }).click();
    await expect(page.getByText(/DRAFT — NOT POSTED/)).toBeVisible();
    await page.evaluate(
      async () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("sarafi-offline", 3);
          request.onsuccess = () => {
            const transaction = request.result.transaction(
              "drafts",
              "readwrite",
            );
            const store = transaction.objectStore("drafts");
            const read = store.getAll();
            read.onsuccess = () => {
              const record = read.result[0];
              record.data = record.data.slice(0, -2) + "AA";
              store.put(record);
              transaction.oncomplete = () => resolve();
              transaction.onerror = () => reject(transaction.error);
            };
            read.onerror = () => reject(read.error);
          };
          request.onerror = () => reject(request.error);
        }),
    );
    await page.reload();
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.getByRole("button", { name: /^Offline/ }).click();
    await expect(page.getByText(/Draft storage unavailable/)).toBeVisible();
  });

  test("offline mode disables primary financial posting controls", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(
      page.locator(".trade-launch"),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.locator(".trade-launch")).toBeDisabled();
    for (const action of [
      /Receive money/,
      /Pay money/,
      /Transfer cash/,
      /Expense/,
    ]) {
      await expect(
        page.getByRole("button", { name: action }).first(),
      ).toBeDisabled();
    }
  });

  test("the daily grid exposes an opening balance form", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Opening money" }).click();
    await expect(
      page.getByRole("heading", { name: "Record opening money" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Amount in this currency" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Value in AFN" }),
    ).toBeVisible();
  });

  test("Hawala section exposes traceability fields", async ({ page }) => {
    await page.goto("/");
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await page.locator(".navigation-menu").getByRole("button", { name: /^Hawala/ }).click();
    await expect(
      page.getByRole("heading", { name: "Hawala", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Receiver" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Destination" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Reference code" }),
    ).toBeVisible();
  });

  test("core cashier actions are visible without another menu", async ({
    page,
  }) => {
    await page.goto("/");
    for (const action of [
      /New transaction/,
      /Receive money/,
      /Pay money/,
      /^Debts$/,
      /Transfer cash/,
      /Expense/,
    ]) {
      await expect(
        page.getByRole("button", { name: action }).first(),
      ).toBeVisible();
    }
    await page.locator(".trade-launch").click();
    await expect(
      page.getByRole("heading", { name: /Buy currency/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await page
      .getByRole("button", { name: "Receive money", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Receive money" }),
    ).toBeVisible();
  });

  test("owner surface exposes control-center sections without accounting terminology", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Customers & debts/ }).click();
    await expect(page.getByRole("button", { name: "Add debt" })).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page
      .locator(".sidebar nav")
      .first()
      .getByRole("button", { name: /More/ })
      .click();
    await expect(page.getByRole("button", { name: /^Reports/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Check cashbox/ }),
    ).toBeVisible();
    await expect(
      page.locator(".trade-launch"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay money/ })).toBeVisible();
  });

  test("Money Location supports currency and location views with evidence drill-down", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /My money/ }).click();
    await expect(
      page.getByRole("heading", { name: "Where is my money?" }),
    ).toBeVisible();
    await expect(page.locator(".account-card")).toHaveCount(3);
    await page.locator(".money-place-manager > summary").click();
    await expect(page.getByRole("heading", { name: "Money accounts" })).toBeVisible();
    await page.getByRole("button", { name: "Add money account" }).click();
    await expect(page.getByRole("textbox", { name: "Account name" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Account type" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("heading", { name: "Currencies used by this shop" }),
    ).toBeVisible();
    await page.locator(".currency-manager > summary").click();
    await expect(page.getByText("Base currency", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /AFN used by this shop/ })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Find a currency" }).fill("CNY");
    await expect(page.locator(".currency-catalog-item")).toHaveCount(1);
    await expect(page.locator(".currency-catalog-item")).toContainText(
      "Chinese Yuan",
    );
    await page.getByRole("textbox", { name: "Find a currency" }).fill("");
    await expect(page.locator(".currency-catalog-item")).toHaveCount(9);
    await expect(
      page.getByRole("button", { name: "By currency" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "By location" }).click();
    await expect(page.getByRole("button", { name: "By location" })).toHaveClass(
      /active/,
    );
    await page.locator(".money-columns .balance-list button.balance-row").first().click();
    await expect(page.getByRole("heading", { name: /Where this amount came from/ })).toBeVisible();
  });

  test("People supports search and statement views", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Customers & debts/ }).click();
    await expect(
      page.getByRole("heading", { name: "Customers & Sarafs", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search customers or Sarafs" })
      .fill("no-match");
    await expect(
      page.getByText("No person matches this search."),
    ).toBeVisible();
  });

  test("a customer can be created and immediately selected in a trade", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Customers & debts/ }).click();
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.getByRole("textbox", { name: "Customer or Saraf name" }).fill("Hamid Exchange");
    await page.getByRole("combobox", { name: "Type" }).selectOption("saraf");
    await page.getByRole("button", { name: "Save customer" }).click();
    await expect(page.getByText("Hamid Exchange", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page.locator(".trade-launch").click();
    await page.locator(".trade-optional-fields > summary").click();
    await expect(page.getByRole("combobox", { name: "Customer" })).toContainText("Hamid Exchange");
  });

  test("owner can open the plan and payment portal", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar nav").getByRole("button", { name: /More/ }).click();
    await page.getByRole("button", { name: "Plan & payment", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Plan and payment" })).toBeVisible();
    await expect(page.getByText("Small shop", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send for activation" })).toBeVisible();
  });

  test("owner sign-up is explicit and asks for password confirmation", async ({ page }) => {
    await page.goto("/?public=1&opening=skip");
    await page.getByRole("tab", { name: "Create an account" }).click();
    await expect(page.getByText("Creating a new Sarafi business", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Full name" })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByText(/Employees create or use their account from the owner’s invitation link/)).toBeVisible();
  });

  test("platform administrator has a separate sign-in gate", async ({ page }) => {
    await page.goto("/platform-admin");
    await expect(page.getByRole("heading", { name: "Platform administrator" })).toBeVisible();
    await expect(page.getByText(/Business owners and employees sign in on the main page/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Create an account" })).toHaveCount(0);
  });

  test("Buy, Sell, and Exchange open distinct FX forms", async ({ page }) => {
    await page.goto("/");
    for (const action of [
      "Buy currency",
      "Sell currency",
      "Exchange currency",
    ]) {
      await page.locator(".trade-launch").click();
      await page.getByRole("tab", { name: action, exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: new RegExp(action.split(" ")[0], "i"),
        }),
      ).toBeVisible();
      await page.locator(".trade-optional-fields > summary").click();
      await expect(page.getByRole("textbox", { name: /Fee/ })).toBeVisible();
      await expect(page.getByRole("textbox", { name: /Note/ })).toBeVisible();
      await page.getByRole("button", { name: "Close trade" }).click();
    }
  });

  test("live buy and sell rates are read-only displays", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("textbox", { name: "Current buy rate" }),
    ).toHaveValue("70.25");
    await expect(
      page.getByRole("textbox", { name: "Current sell rate" }),
    ).toHaveValue("70.35");
    await expect(
      page.getByRole("textbox", { name: "Current buy rate" }),
    ).toHaveAttribute("readonly");
  });

  test("daily report downloads as a localized A4 PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "One browser verifies the generated PDF artifact");
    test.setTimeout(60_000);
    await page.goto("/");
    await page.locator("select.lang-button").selectOption("fa-AF");
    await page.locator(".sidebar nav > button[aria-expanded]").click();
    await page.locator(".navigation-menu").getByRole("button", { name: /^گزارش‌ها/ }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "صدور PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/sarafi-daily-report-\d{4}-\d{2}-\d{2}\.pdf/);
    const outputDirectory = path.resolve("output/pdf");
    await mkdir(outputDirectory, { recursive: true });
    await download.saveAs(path.join(outputDirectory, "sarafi-daily-report-dari.pdf"));
  });

  test("FX form blocks zero amounts before an authoritative post", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".trade-launch").click();
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await page
      .locator(".trade-modal")
      .getByRole("textbox", { name: /We give USD/ })
      .fill("0");
    await page
      .locator(".trade-modal")
      .getByRole("button", { name: "Review transaction" })
      .click();
    await expect(
      page.getByRole("heading", { name: /Sell currency/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Enter an amount greater than zero."),
    ).toBeVisible();
  });

  test("Buy confirmation preserves the shop perspective and buy rate", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".trade-launch").click();
    await page
      .locator(".trade-modal")
      .getByRole("textbox", { name: /We receive/ })
      .fill("1000");
    await expect(
      page.locator(".trade-modal").getByRole("textbox", { name: /We give/ }),
    ).toHaveValue("70250.00");
    await page.locator(".trade-modal").getByRole("button", { name: "Review transaction" }).click({ force: true });
    const confirmation = page.locator(".trade-confirmation");
    await expect(confirmation).toContainText("1000.00 USD");
    await expect(confirmation).toContainText("70250.00 AFN");
    await expect(confirmation).toContainText("70.25 AFN");
    await expect(
      page.getByRole("button", { name: "Confirm and save" }),
    ).toBeVisible();
  });

  test("Sell confirmation preserves the shop perspective and sell rate", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".trade-launch").click();
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await page
      .locator(".trade-modal")
      .getByRole("textbox", { name: /We give/ })
      .fill("1000");
    await expect(
      page.locator(".trade-modal").getByRole("textbox", { name: /We receive/ }),
    ).toHaveValue("70350.00");
    await page.locator(".trade-modal").getByRole("button", { name: "Review transaction" }).click({ force: true });
    const confirmation = page.locator(".trade-confirmation");
    await expect(confirmation).toContainText("1000.00 USD");
    await expect(confirmation).toContainText("70350.00 AFN");
    await expect(confirmation).toContainText("70.35 AFN");
  });

  test("Exchange refuses to invent a rate for an unsupported currency pair", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".trade-launch").click();
    await page.getByRole("tab", { name: "Exchange currency" }).click();
    await expect(
      page.getByText(/No approved rate is available for this currency pair/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review transaction" }),
    ).toBeDisabled();
  });
});
