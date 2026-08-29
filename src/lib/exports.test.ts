import { describe, expect, it } from "vitest";
import { buildThermalReceiptHtml } from "./exports";

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
