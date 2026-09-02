import { describe, expect, it } from "vitest";
import { buildDailyReportHtml, buildThermalReceiptHtml } from "./exports";

describe("daily report rendering", () => {
  it("renders a simple Dari A4 report with isolated money values", () => {
    const html = buildDailyReportHtml({
      rows: [{ entryId: "trade-1", occurredAt: "2026-09-03 09:30", type: "BUY_FX", branchId: "main", status: "posted", realizedProfit: "250" }],
      businessName: "صرافی کابل <مرکز>",
      branchName: "شعبه مرکزی",
      reportName: "گزارش روزانه",
      language: "fa-AF",
      businessDate: "2026-09-03",
      snapshot: {
        transaction_count: 1,
        volume_base: "70250",
        realized_profit: "250",
        expenses: "0",
        net_position_base: "500000",
        reconciliation_differences: "0",
        locations: [{ location_name: "صندوق اصلی", currency: "AFN", quantity: "500000" }],
        receivables: [{ currency: "AFN", amount: "10000" }],
        payables: [],
      },
    });

    expect(html).toContain('lang="fa-AF" dir="rtl"');
    expect(html).toContain("خلاصه امروز");
    expect(html).toContain("پول فعلی صرافی");
    expect(html).toContain("70250 AFN");
    expect(html).toContain("unicode-bidi:isolate");
    expect(html).toContain("صرافی کابل &lt;مرکز&gt;");
    expect(html).not.toContain("<مرکز>");
  });

  it("uses local Pashto report language", () => {
    const html = buildDailyReportHtml({
      rows: [],
      businessName: "کابل صرافي",
      branchName: "اصلي څانګه",
      reportName: "ورځنی راپور",
      language: "ps-AF",
      businessDate: "2026-09-03",
      snapshot: null,
    });

    expect(html).toContain("د نن لنډیز");
    expect(html).toContain("د صرافۍ اوسني پیسې");
    expect(html).toContain("کومه معامله نه ده ثبت شوې");
  });
});

describe("thermal receipt rendering", () => {
  it("keeps Dari money values readable and escapes untrusted content", () => {
    const html = buildThermalReceiptHtml(
      {
        businessName: "صرافی <آزمایشی>",
        reference: "TEST-1000",
        type: "خرید ارز",
        amount: "70250.00",
        currency: "AFN",
        rate: "70.25",
        direction: "rtl",
        locale: "fa-AF",
        labels: { amount: "مبلغ", rate: "نرخ", date: "تاریخ" },
      },
      "58mm",
    );

    expect(html).toContain('lang="fa-AF" dir="rtl"');
    expect(html).toContain("size:58mm auto");
    expect(html).toContain("70250.00 AFN");
    expect(html).toContain("70.25");
    expect(html).toContain("صرافی &lt;آزمایشی&gt;");
    expect(html).not.toContain("<آزمایشی>");
  });

  it("renders an English 80mm receipt left-to-right", () => {
    const html = buildThermalReceiptHtml(
      {
        businessName: "Kabul Central Exchange",
        reference: "TEST-2000",
        type: "Sell currency",
        amount: "1000.00",
        currency: "USD",
        direction: "ltr",
        locale: "en",
        labels: { amount: "Amount", rate: "Rate", date: "Date" },
      },
      "80mm",
    );

    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain("size:80mm auto");
    expect(html).not.toContain("Rate:");
  });
});
