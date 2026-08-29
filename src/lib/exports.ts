import { jsPDF } from "jspdf";
import type { ReportRow } from "../domain/reporting";

export function downloadCsv(content: string, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadPdf(
  rows: ReportRow[],
  businessName: string,
  reportName: string,
): void {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  pdf.setFontSize(16);
  pdf.text(businessName, 42, 48);
  pdf.setFontSize(11);
  pdf.text(reportName, 42, 68);
  pdf.text(`Generated ${new Date().toISOString()}`, 42, 84);
  pdf.setFontSize(9);
  rows
    .slice(0, 42)
    .forEach((row, index) =>
      pdf.text(
        `${row.entryId}  ${row.occurredAt}  ${row.type}  ${row.status}  ${row.realizedProfit}`,
        42,
        112 + index * 14,
      ),
    );
  pdf.save(
    `${reportName.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`,
  );
}

export function printReport(): void {
  window.print();
}

export function shareReportViaWhatsApp(input: {
  reportName: string;
  reference: string;
  businessName: string;
}): void {
  const message = `${input.businessName} - ${input.reportName}\nReference: ${input.reference}`;
  window.open(
    `https://wa.me/?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

export type ThermalReceiptInput = {
  businessName: string;
  reference: string;
  type: string;
  amount: string;
  currency: string;
  rate?: string;
  direction: "ltr" | "rtl";
  locale: string;
  labels: { amount: string; rate: string; date: string };
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );

export function buildThermalReceiptHtml(
  input: ThermalReceiptInput,
  width: "58mm" | "80mm",
): string {
  const text = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" ? escapeHtml(value) : value,
    ]),
  ) as ThermalReceiptInput;
  const labels = Object.fromEntries(
    Object.entries(input.labels).map(([key, value]) => [
      key,
      escapeHtml(value),
    ]),
  ) as ThermalReceiptInput["labels"];
  const date = escapeHtml(new Date().toLocaleString(input.locale));
  return `<!doctype html><html lang="${text.locale}" dir="${text.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${text.reference}</title><style>@page{size:${width} auto;margin:0}*{box-sizing:border-box}body{width:${width};margin:0;padding:4mm;font:12px Tahoma,"Segoe UI",Arial,sans-serif;color:#000}h1{font-size:16px;text-align:center;margin:0 0 8px}p{margin:5px 0;border-bottom:1px dashed #000;padding-bottom:4px}.value{font-weight:700;font-size:14px}.money{direction:ltr;unicode-bidi:isolate;display:inline-block}</style></head><body><h1>${text.businessName}</h1><p>${text.type}<br><bdi>${text.reference}</bdi></p><p>${labels.amount}: <span class="value money">${text.amount} ${text.currency}</span></p>${text.rate ? `<p>${labels.rate}: <span class="money">${text.rate}</span></p>` : ""}<p>${labels.date}: <bdi>${date}</bdi></p></body></html>`;
}

export function printThermalReceipt(
  input: ThermalReceiptInput,
  width: "58mm" | "80mm",
): void {
  const receipt = window.open("", "_blank");
  if (!receipt) return;
  receipt.opener = null;
  receipt.document.write(buildThermalReceiptHtml(input, width));
  receipt.document.close();
  receipt.focus();
  window.setTimeout(() => receipt.print(), 150);
}
