import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptSuccessDialog } from "./ProfessionalWorkspace";

const completedTrade = {
  receiptNumber: "SAR-00001234",
  journalEntryId: "8a6ec497-77b7-4f53-a55f-07cc3e580f1a",
  givenAmount: "1000.00",
  givenCurrency: "USD",
  receivedAmount: "70350.00",
  receivedCurrency: "AFN",
  rate: "70.35",
  occurredAt: "2026-08-29T10:30:00.000Z",
};

describe("professional transaction receipt", () => {
  it("renders the authoritative receipt references and thermal actions", () => {
    const markup = renderToStaticMarkup(
      <ReceiptSuccessDialog
        language="en"
        businessName="Kabul Central Exchange"
        trade={completedTrade}
        onPrint={() => undefined}
        onDone={() => undefined}
      />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Transaction recorded");
    expect(markup).toContain("SAR-00001234");
    expect(markup).toContain(completedTrade.journalEntryId);
    expect(markup).toContain("Print 58 mm");
    expect(markup).toContain("Print 80 mm");
  });

  it.each([
    ["fa-AF", "معامله ثبت شد", "صرافی می‌پردازد"],
    ["ps-AF", "معامله ثبت شوه", "صرافي ورکوي"],
  ] as const)("renders local receipt language for %s", (language, title, gives) => {
    const markup = renderToStaticMarkup(
      <ReceiptSuccessDialog
        language={language}
        businessName="Kabul Central Exchange"
        trade={completedTrade}
        onPrint={() => undefined}
        onDone={() => undefined}
      />,
    );
    expect(markup).toContain(title);
    expect(markup).toContain(gives);
    expect(markup).not.toContain("Transaction recorded");
  });
});
