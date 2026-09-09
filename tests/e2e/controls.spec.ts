import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const productionCsp =
  "default-src 'self'; base-uri 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:";

async function openFxForm(
  page: Page,
  side: "Buy currency" | "Sell currency" | "Exchange currency" = "Buy currency",
) {
  const route = {
    "Buy currency": "buy",
    "Sell currency": "sell",
    "Exchange currency": "exchange",
  }[side];
  await page.goto(`/app/inspection/transactions/new/fx/${route}`);
  await expect(page.locator(".financial-task-form")).toBeVisible();
}

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
    await expect(page).not.toHaveURL(/\/sarafi-opening\.html/);
    await expect(page.getByRole("main", { name: "SARAFI opening" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Skip" }).click({ force: true });
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
    await page.goto("/?public=1&opening=replay");
    await expect(page).not.toHaveURL(/\/sarafi-opening\.html/);
    await expect(page.getByRole("main", { name: "SARAFI opening" })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click({ force: true });
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
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

  test("primary navigation is visible and URL-backed", async ({
    page,
  }) => {
    await page.goto("/");
    const navigation = page.locator(".sidebar nav");
    for (const label of ["Home", "Make a Transaction", "My Money", "Activity", "Manage Sarafi"]) {
      await expect(navigation.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(navigation.getByRole("button")).toHaveCount(5);
    await page.goto("/app/inspection/money");
    await expect(page).toHaveURL(/\/app\/inspection\/money$/);
    await expect(page.getByRole("heading", { name: "Where is my money?", exact: true })).toBeVisible();
    await page.goto("/app/inspection/customers");
    await expect(page.getByRole("heading", { name: "Customers & Sarafs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Walk-in customer/ }).click();
    await expect(page).toHaveURL(/\/app\/inspection\/customers\/inspection-customer$/);
    await expect(page.getByRole("heading", { name: "Walk-in customer", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: /Manage Sarafi/ }).click();
    await expect(page).toHaveURL(/\/control$/);
    await expect(page.getByRole("heading", { name: "Manage SARAFI", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Business & branches/ }).click();
    await expect(page).toHaveURL(/\/control\/business$/);
    await expect(page.getByRole("heading", { name: "Shop settings", exact: true })).toBeVisible();
  });

  test("required routes survive direct navigation and refresh", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Chromium performs the complete direct-route inventory");
    test.setTimeout(120_000);
    const routes = [
      ["/app/inspection/home", "Your exchange at a glance"],
      ["/app/inspection/transactions/new", "Make a Transaction"],
      ["/app/inspection/transactions/new/fx/buy", /Buy currency/],
      ["/app/inspection/transactions/new/fx/sell", /Sell currency/],
      ["/app/inspection/transactions/new/fx/exchange", /Exchange/],
      ["/app/inspection/transactions/new/money-in/receive", "Receive money"],
      ["/app/inspection/transactions/new/money-out/pay", "Pay money"],
      ["/app/inspection/transactions/new/move/transfer", "Transfer cash"],
      ["/app/inspection/transactions/new/debt/receivable", "They owe us"],
      ["/app/inspection/transactions/new/debt/payable", "We owe them"],
      ["/app/inspection/debts/inspection-debt/settle", "Receive debt money"],
      ["/app/inspection/transactions/new/hawala/send", "Send Hawala"],
      ["/app/inspection/transactions/new/hawala/incoming", "Record incoming instruction"],
      ["/app/inspection/hawala/payout", "Pay by reference code"],
      ["/app/inspection/hawala/partners/inspection-partner/settle", "Settle a Hawala partner"],
      ["/app/inspection/transactions/new/correction", "Transaction history"],
      ["/app/inspection/transactions", "Transaction history"],
      ["/app/inspection/transactions/inspection-buy-entry", "Buy currency"],
      ["/app/inspection/money", "Where is my money?"],
      ["/app/inspection/customers", "Customers & Sarafs"],
      ["/app/inspection/customers/inspection-customer", "Walk-in customer"],
      ["/app/inspection/activity", "Transaction history"],
      ["/app/inspection/cashbox-close", "Check cashbox"],
      ["/app/inspection/reports", "Exact report snapshot"],
      ["/app/inspection/reconciliation", "Check cashbox"],
      ["/app/inspection/control", "Manage SARAFI"],
      ["/app/inspection/control/rates", "Shop rates"],
      ["/app/inspection/control/team", "Team & Devices"],
      ["/app/inspection/control/business", "Shop settings"],
      ["/app/inspection/control/security", "Security"],
      ["/app/inspection/control/billing", "Plan and payment"],
      ["/app/inspection/compliance", "Compliance control"],
      ["/app/inspection/compliance/cases/inspection-case", "Compliance control"],
    ] as const;
    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading }).first(), route).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: heading }).first(), `${route} after refresh`).toBeVisible();
    }
  });

  test("unauthorized direct transaction routes fail closed", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy?role=accountant");
    await expect(page.getByRole("heading", { name: "Access not allowed" })).toBeVisible();
    await expect(page.locator(".transaction-page-form")).toHaveCount(0);
  });

  test("profile, privacy, transaction family, and trade controls respond", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page.getByRole("button", { name: "Open help" }).click();
    await expect(
      page.getByRole("heading", { name: "Help & support" }),
    ).toBeVisible();
    await expect(page.locator(".help-guide-list details")).toHaveCount(10);
    await page.getByRole("button", { name: "Close help" }).first().click();
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page.getByRole("region", { name: "Profile and preferences" }).getByRole("button", { name: "Hide amounts" }).click();
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
    await page.goto("/app/inspection/transactions/new");
    await expect(page.locator(".transaction-family-grid > button")).toHaveCount(6);
    await openFxForm(page);
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await expect(
      page.getByRole("heading", { name: /Sell currency/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await expect(
      page.getByRole("heading", { name: /Sell currency/ }),
    ).not.toBeVisible();
  });

  test("global search and notifications lead to the matching workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search the whole shop" }).click();
    await page.getByPlaceholder("Find a person, account, or transaction").fill("Main Counter");
    await page.locator(".global-search-results button").first().click();
    await expect(page.getByRole("heading", { name: "Where is my money?" })).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await page.getByRole("button", { name: "Open notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await page.locator(".notification-open").first().click();
    await expect(page.getByRole("heading", { name: "Team & Devices", exact: true })).toBeVisible();
  });

  test("owner settings and complete-ledger report exports are usable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Manage Sarafi/ }).click();
    await expect(page.getByRole("heading", { name: "Manage SARAFI" })).toBeVisible();
    await page.getByRole("button", { name: /^Business & branches/ }).click();
    await expect(page.getByRole("heading", { name: "Shop settings" })).toBeVisible();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved and added to the security history.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your notifications" })).toBeVisible();
    await page.getByLabel("Actions waiting for approval").uncheck();
    await expect(page.getByText("Notification choice saved.")).toBeVisible();
    await page.goto("/app/inspection/reports");
    await expect(page.getByRole("heading", { name: "Exact report snapshot" })).toBeVisible();
    await expect(page.locator(".export-menu")).toHaveCount(0);
    await page.locator(".report-advanced-filters > summary").click();
    await page.getByLabel("Choose a full report").selectOption("fx_profit");
    await page.getByRole("button", { name: "Generate filtered report" }).click();
    await page.locator(".export-menu > summary").click();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Excel" })).toBeVisible();
    await expect(page.locator(".report-export-history > summary")).toHaveText("Recent exports");
    await page.locator(".report-export-history > summary").click();
    await expect(page.locator(".report-export-list")).toContainText("PDF");
  });

  test("the visible daily grid opens a validated operation form", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/money-out/expense");
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
    await page.goto("/app/inspection/transactions/new/move/transfer");
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

  test("foreign-currency operations accept only their native amount", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/money-out/expense");
    await page.getByRole("combobox", { name: "Currency" }).selectOption("USD");
    await expect(page.getByRole("textbox", { name: /Value in AFN/ })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Amount", exact: true })).toBeVisible();
    await expect(page.getByText(/SARAFI values it from the approved shop rate/i)).toBeVisible();
  });

  test("transaction history shows the source and destination for each movement", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator(".sidebar nav").getByRole("button", { name: /^Activity/ }).click();
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
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page
      .getByRole("combobox", { name: "Change language" })
      .selectOption("fa-AF");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("خلاصه صرافی شما")).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fa-AF");
    await expect(page.getByText("خلاصه صرافی شما")).toBeVisible();
    await page.getByRole("button", { name: "پروفایل و ترجیحات" }).click();
    await page
      .getByRole("combobox", { name: "تغییر زبان" })
      .selectOption("ps-AF");
    await expect(page.locator("html")).toHaveAttribute("lang", "ps-AF");
    await expect(page.getByText("ستاسو د صرافۍ لنډیز")).toBeVisible();
  });

  test("translated trade labels keep the business perspective", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      window.localStorage.removeItem("sarafi-language"),
    );
    await page.goto("/");
    await openFxForm(page);
    await expect(page.getByRole("textbox", { name: /We give/ })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /We receive/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page
      .getByRole("combobox", { name: "Change language" })
      .selectOption("fa-AF");
    await expect(page.locator("html")).toHaveAttribute("lang", "fa-AF");
    await page.getByRole("button", { name: /^خرید و فروش اسعار/ }).click();
    await page.getByRole("button", { name: "خرید اسعار", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: /ما می‌دهیم/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /ما می‌گیریم/ }),
    ).toBeVisible();
  });

  test("debts section exposes receivable and payable posting fields", async ({
    page,
  }) => {
    await page.goto("/app/inspection/transactions/new/debt/receivable");
    await expect(
      page.getByRole("heading", { name: "Debts", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Customer or Saraf" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save: they owe us/ })).toBeVisible();
    await page.goto("/app/inspection/transactions/new/debt/payable");
    await expect(page.getByRole("heading", { name: "We owe them" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Money goes to" })).toHaveValue("inspection-cashbox");
  });

  test("reconciliation section exposes cash count and variance reason fields", async ({
    page,
  }) => {
    await page.goto("/");
    await page.goto("/app/inspection/reconciliation");
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
    await page.goto("/app/inspection/control/team");
    await expect(
      page.getByRole("heading", { name: "Team & Devices", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add employee" }).click();
    await expect(
      page.getByRole("heading", { name: "Add employee", exact: true }),
    ).toBeVisible();
    await page.getByRole("textbox", { name: "Full name" }).fill("Farid Ahmad");
    await page
      .getByRole("textbox", { name: "Work email" })
      .fill("farid.ahmad@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("combobox", { name: "Job role" })).toHaveValue(
      "cashier",
    );
    await expect(page.getByRole("group", { name: "Allowed branches" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Allowed cashboxes" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Main branch" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Main Counter" })).toBeChecked();
    await expect(page.getByRole("group", { name: "Allowed action types" })).toBeVisible();
    await page.getByRole("spinbutton", { name: "Maximum transaction (AFN base)" }).fill("250000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Review invitation" })).toBeVisible();
    await expect(page.getByText("Transaction ceiling: 250000 AFN")).toBeVisible();
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
    await page.goto("/app/inspection/offline");
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
    await page.goto("/app/inspection/offline");
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
    await page.goto("/app/inspection/offline");
    await expect(page.getByText(/Draft storage unavailable/)).toBeVisible();
  });

  test("offline mode prevents financial posting", async ({
    page,
    context,
  }) => {
    await page.goto("/app/inspection/transactions/new/money-out/expense");
    await expect(page.locator(".financial-task-form")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await context.setOffline(true);
    await page.evaluate(async () => {
      window.dispatchEvent(new Event("offline"));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    await page.getByRole("textbox", { name: "Amount", exact: true }).fill("100");
    await page.getByRole("button", { name: /Save money paid/ }).click();
    await expect(page.getByText("Reconnect to the internet before saving this action.")).toBeVisible();
  });

  test("the transaction center exposes a native-only opening balance page", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/opening-money");
    await expect(page).toHaveURL(/\/transactions\/new\/opening-money$/);
    await expect(
      page.getByRole("heading", { name: "Record opening money" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Amount in this currency" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Value in AFN" })).toHaveCount(0);
    await expect(page.getByText(/SARAFI calculates the accounting value from the approved shop rate/i)).toBeVisible();
  });

  test("Hawala section exposes traceability fields", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/hawala/send");
    await expect(
      page.getByRole("heading", { name: "Hawala", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Receiver" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Destination" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Sender" })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Reference code" }),
    ).toHaveCount(0);
    await expect(page.getByText(/secure reference will be issued/i)).toBeVisible();
  });

  test("core cashier families lead to focused action menus", async ({
    page,
  }) => {
    await page.goto("/app/inspection/transactions/new");
    for (const family of ["Currency Exchange", "Money In", "Money Out", "Move Our Money", "Debt", "Hawala"])
      await expect(page.getByRole("button", { name: new RegExp(family) })).toBeVisible();
    await page.getByRole("button", { name: /^Currency Exchange/ }).click();
    await expect(page.getByRole("button", { name: "Buy currency", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sell currency", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Buy currency", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /Buy currency/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close trade" }).click();
    await page.goto("/app/inspection/transactions/new/money-in/receive");
    await expect(
      page.getByRole("heading", { name: "Receive money" }),
    ).toBeVisible();
  });

  test("owner surface exposes control-center sections without accounting terminology", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await expect(page.getByRole("region", { name: "Profile and preferences" }).getByText("Owner", { exact: true })).toBeVisible();
    await page.goto("/app/inspection/customers");
    await expect(page.getByRole("button", { name: "Add debt" })).toBeVisible();
    await page.getByRole("button", { name: /Back to Home/ }).click();
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /Manage Sarafi/ })).toBeVisible();
    await expect(page.locator(".sidebar nav").getByRole("button", { name: /Make a Transaction/ })).toBeVisible();
  });

  test("Money Location supports currency and location views with evidence drill-down", async ({
    page,
  }) => {
    await page.goto("/app/inspection/money");
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
    await page.goto("/app/inspection/customers");
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
    await page.goto("/app/inspection/customers");
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.getByRole("textbox", { name: "Customer or Saraf name" }).fill("Hamid Exchange");
    await page.getByRole("combobox", { name: "Type" }).selectOption("saraf");
    await page.getByRole("button", { name: "Save customer" }).click();
    await expect(page.getByText("Hamid Exchange", { exact: true })).toBeVisible();
    await page.locator(".sidebar nav").getByRole("button", { name: /^Make a Transaction/ }).click();
    await page.getByRole("button", { name: /^Currency Exchange/ }).click();
    await page.getByRole("button", { name: "Buy currency", exact: true }).click();
    await expect(page.locator(".financial-task-form")).toBeVisible();
    await page.locator(".trade-optional-fields > summary").click();
    await expect(page.getByRole("combobox", { name: "Customer" })).toContainText("Hamid Exchange");
  });

  test("owner can open the plan and payment portal", async ({ page }) => {
    await page.goto("/");
    await page.goto("/app/inspection/control/billing");
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

  test("platform administrator preview exposes plans and security history", async ({ page }) => {
    await page.goto("/platform-admin?preview=1");
    await expect(page.getByText("SARAFI administrator", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Plans", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Plan catalog" })).toBeVisible();
    await page.getByRole("button", { name: "Security history", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Administrator security history" })).toBeVisible();
    await expect(page.getByText("Payment approved")).toBeVisible();
  });

  test("Buy, Sell, and Exchange open distinct FX forms", async ({ page }) => {
    await page.goto("/");
    for (const action of [
      "Buy currency",
      "Sell currency",
      "Exchange currency",
    ]) {
      await openFxForm(page, action);
      await expect(
        page.getByRole("heading", {
          name: new RegExp(action.split(" ")[0], "i"),
        }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: /Commission/ })).toBeVisible();
      await page.locator(".trade-optional-fields > summary").click();
      await expect(page.getByRole("textbox", { name: /Note/ })).toBeVisible();
      await page.getByRole("button", { name: "Close trade" }).click();
    }
  });

  test("live buy and sell rates are open between the two currencies", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy");
    await expect(page.locator(".exchange-entry-row")).toBeVisible();
    await expect(page.locator(".rate-box")).toContainText("1 USD =");
    await expect(page.locator(".rate-box")).toContainText("AFN");
    await expect(page.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("70.25");
    await page.goto("/app/inspection/transactions/new/fx/sell");
    await expect(page.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("70.35");
  });

  test("FX transaction uses the current shop rate inline", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy");
    await expect(page.getByText("Current shop rate", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("70.25");
    await expect(page).toHaveURL(/\/transactions\/new\/fx\/buy$/);
  });

  test("missing FX rate can be entered once and published by an owner", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy?rate=missing");
    await expect(page.locator(".rate-box .rate-warning")).toHaveText("No shop rate is published for this currency.");
    await page.getByRole("textbox", { name: "Transaction rate" }).fill("70.50");
    await page.getByRole("textbox", { name: "Reason for the rate decision" }).fill("First rate for this customer");
    await expect(page.getByRole("checkbox", { name: "Publish this as the new shop rate" })).toBeVisible();
  });

  test("stale FX rate offers a reasoned continuation or a replacement", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy?rate=stale");
    await expect(page.getByText("This shop rate is older than 24 hours.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Continue with the current old rate" }).check();
    await expect(page.getByRole("textbox", { name: "Reason for the rate decision" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Transaction rate" })).toHaveValue("70.25");
  });

  test("cashier rate override requests approval and preserves the draft", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/buy?role=cashier&rate=missing");
    await page.getByRole("textbox", { name: "Transaction rate" }).fill("70.50");
    await page.getByRole("textbox", { name: "Reason for the rate decision" }).fill("Customer-agreed counter rate");
    await page.locator(".financial-task-form").getByRole("textbox", { name: /We receive/ }).fill("1000");
    await page.getByRole("button", { name: "Review transaction" }).click();
    await page.getByRole("button", { name: "Confirm and save" }).click();
    await expect(page.getByText("Approval requested. Your transaction draft is still here.")).toBeVisible();
    await expect(page.locator(".transaction-page-form")).toBeVisible();
    await expect(page.locator(".financial-task-form").getByRole("textbox", { name: /We receive/ })).toHaveValue("1000");
  });

  test("foreign expense resolves an expired rate without losing its draft", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("sarafi-language", "en"));
    await page.goto("/app/inspection/transactions/new/money-out/expense?rate=stale");
    await page.getByRole("textbox", { name: "Amount" }).fill("1234");
    await page.getByRole("combobox", { name: "Currency" }).selectOption("USD");
    await expect(page.getByRole("region", { name: "Rate for this transaction" })).toContainText("This rate has expired");
    await expect(page.getByRole("button", { name: /Save money paid/ })).toBeDisabled();
    await page.getByRole("textbox", { name: "Shop buy rate" }).fill("70.40");
    await page.getByRole("textbox", { name: "Shop sell rate" }).fill("70.50");
    await expect(page.getByRole("textbox", { name: "Amount" })).toHaveValue("1234");
    await expect(page.getByRole("button", { name: /Save money paid/ })).toBeEnabled();
  });

  test("cashier foreign expense stays in task while a manager rate is required", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("sarafi-language", "en"));
    await page.goto("/app/inspection/transactions/new/money-out/expense?role=cashier&rate=missing");
    await page.getByRole("combobox", { name: "Currency" }).selectOption("USD");
    await expect(page.getByText(/A manager must publish the rate/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Save money paid/ })).toBeDisabled();
    await expect(page).toHaveURL(/transactions\/new\/money-out\/expense/);
  });

  test("daily report downloads as a localized A4 PDF", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "One browser verifies the generated PDF artifact");
    test.setTimeout(60_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Profile and preferences" }).click();
    await page.getByRole("combobox", { name: "Change language" }).selectOption("fa-AF");
    await page.goto("/app/inspection/reports");
    await page.getByRole("button", { name: "ساخت گزارش امروز" }).click();
    await page.locator(".export-menu > summary").click();
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
    await openFxForm(page);
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await page
      .locator(".financial-task-form")
      .getByRole("textbox", { name: /We give USD/ })
      .fill("0");
    await page
      .locator(".financial-task-form")
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
    await openFxForm(page);
    await page
      .locator(".financial-task-form")
      .getByRole("textbox", { name: /We receive/ })
      .fill("1000");
    await expect(
      page.locator(".financial-task-form").getByRole("textbox", { name: /We give/ }),
    ).toHaveValue("70250.00");
    await page.locator(".financial-task-form").getByRole("button", { name: "Review transaction" }).click({ force: true });
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
    await openFxForm(page);
    await page.getByRole("tab", { name: "Sell currency" }).click();
    await page
      .locator(".financial-task-form")
      .getByRole("textbox", { name: /We give/ })
      .fill("1000");
    await expect(
      page.locator(".financial-task-form").getByRole("textbox", { name: /We receive/ }),
    ).toHaveValue("70350.00");
    await page.locator(".financial-task-form").getByRole("button", { name: "Review transaction" }).click({ force: true });
    const confirmation = page.locator(".trade-confirmation");
    await expect(confirmation).toContainText("1000.00 USD");
    await expect(confirmation).toContainText("70350.00 AFN");
    await expect(confirmation).toContainText("70.35 AFN");
  });

  test("Exchange derives two authoritative legs and reveals a reasoned customer override", async ({
    page,
  }) => {
    await page.goto("/");
    await openFxForm(page);
    await page.getByRole("tab", { name: "Exchange currency" }).click();
    const dialog = page.locator(".financial-task-form");
    await expect(dialog.getByRole("textbox", { name: "Transaction rate" })).toBeVisible();
    await expect(dialog.locator(".inline-rate-resolver")).toHaveCount(2);
    await dialog.getByRole("textbox", { name: "We give" }).fill("100");
    await expect(dialog.getByRole("textbox", { name: "We receive" })).toHaveValue("93.68");
    await dialog.getByRole("textbox", { name: "Transaction rate" }).fill("0.92");
    await dialog.getByRole("textbox", { name: "Reason for the rate decision" }).fill("Customer negotiated rate");
    await expect(dialog.getByRole("textbox", { name: "We receive" })).toHaveValue("92.00");
    await dialog.getByRole("button", { name: "Review transaction" }).click();
    const confirmation = dialog.locator(".trade-confirmation");
    await expect(confirmation).toContainText("100.00 USD");
    await expect(confirmation).toContainText("92.00 EUR");
    await expect(confirmation).toContainText("0.92 EUR");
  });

  test("Exchange keeps the draft blocked until both missing AFN legs are resolved in place", async ({ page }) => {
    await page.goto("/app/inspection/transactions/new/fx/exchange?rate=missing");
    await expect(page.locator(".financial-task-form")).toBeVisible();
    const dialog = page.locator(".financial-task-form");
    await dialog.getByRole("textbox", { name: "We give" }).fill("100");
    const review = dialog.getByRole("button", { name: "Review transaction" });
    await expect(review).toBeDisabled();
    const resolvers = dialog.locator(".inline-rate-resolver");
    await expect(resolvers).toHaveCount(2);
    await resolvers.nth(0).getByRole("textbox", { name: "Shop buy rate" }).fill("70.25");
    await resolvers.nth(0).getByRole("textbox", { name: "Shop sell rate" }).fill("70.35");
    await resolvers.nth(1).getByRole("textbox", { name: "Shop buy rate" }).fill("75.10");
    await resolvers.nth(1).getByRole("textbox", { name: "Shop sell rate" }).fill("75.20");
    await expect(dialog.getByRole("textbox", { name: "We receive" })).toHaveValue("93.68");
    await expect(review).toBeEnabled();
  });

  test("worker connection lobby accepts an owner-issued code before opening the assigned workspace", async ({ page }) => {
    await page.goto("/?workspace=empty");
    await expect(page.getByRole("heading", { name: "How will you use SARAFI?" })).toBeVisible();
    await page.getByRole("button", { name: /I work for a Sarafi/ }).click();
    await expect(page.getByRole("heading", { name: "Join your SARAFI team" })).toBeVisible();
    await page.getByLabel("10-character invitation code").fill("A1B2C3D4E5");
    await page.getByRole("button", { name: "Connect workplace" }).click();
    await expect(page.getByText("Cashier", { exact: true })).toBeVisible();
    await expect(page.getByText("Kabul Central Exchange", { exact: true })).toBeVisible();
  });
});
