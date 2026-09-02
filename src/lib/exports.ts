import { jsPDF } from "jspdf";
import type { ReportRow } from "../domain/reporting";

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

export function downloadCsv(content: string, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export type DailyReportSnapshot = {
  transaction_count: number;
  volume_base: string;
  realized_profit: string;
  expenses: string;
  net_position_base: string;
  reconciliation_differences: string;
  locations: Array<{ location_name: string; currency: string; quantity: string }>;
  receivables: Array<{ currency: string; amount: string }>;
  payables: Array<{ currency: string; amount: string }>;
};

export type DailyReportInput = {
  rows: ReportRow[];
  businessName: string;
  branchName: string;
  reportName: string;
  language: "en" | "fa-AF" | "ps-AF";
  businessDate: string;
  snapshot: DailyReportSnapshot | null;
};

const dailyReportCopy = {
  en: {
    title: "Daily report", summary: "Today at a glance", count: "Transactions", volume: "Turnover", profit: "Profit", expenses: "Expenses", position: "Net position", money: "Money now", debts: "Debts and receivables", receivable: "People owe the shop", payable: "The shop owes", activity: "Recent activity", empty: "No transactions were recorded for this report.", branch: "Branch", date: "Business date", made: "Prepared", cashbox: "Cashbox check", difference: "Difference",
  },
  "fa-AF": {
    title: "گزارش روزانه", summary: "خلاصه امروز", count: "تعداد معاملات", volume: "گردش امروز", profit: "مفاد امروز", expenses: "مصارف", position: "ارزش خالص", money: "پول فعلی صرافی", debts: "طلب و قرض", receivable: "مردم به صرافی بدهکار اند", payable: "صرافی بدهکار است", activity: "معاملات اخیر", empty: "در این گزارش معامله‌ای ثبت نشده است.", branch: "شعبه", date: "تاریخ کاری", made: "ساخته‌شده", cashbox: "بررسی صندوق", difference: "تفاوت",
  },
  "ps-AF": {
    title: "ورځنی راپور", summary: "د نن لنډیز", count: "د معاملو شمېر", volume: "د نن راکړه ورکړه", profit: "د نن ګټه", expenses: "لګښتونه", position: "خالص ارزښت", money: "د صرافۍ اوسني پیسې", debts: "پورونه او طلبونه", receivable: "خلک صرافۍ ته پوروړي دي", payable: "صرافي پوروړې ده", activity: "وروستۍ معاملې", empty: "په دې راپور کې کومه معامله نه ده ثبت شوې.", branch: "څانګه", date: "کاري نېټه", made: "جوړ شوی", cashbox: "د صندوق کتنه", difference: "توپیر",
  },
} as const;

export function buildDailyReportHtml(input: DailyReportInput): string {
  const labels = dailyReportCopy[input.language];
  const direction = input.language === "en" ? "ltr" : "rtl";
  const snapshot = input.snapshot;
  const money = (value: string, currency = "AFN") =>
    `<bdi class="pdf-money">${escapeHtml(value || "0")} ${escapeHtml(currency)}</bdi>`;
  const locations = snapshot?.locations.slice(0, 8).map((location) =>
    `<li><span>${escapeHtml(location.location_name)}</span>${money(location.quantity, location.currency)}</li>`,
  ).join("") ?? "";
  const debtLine = (items: Array<{ currency: string; amount: string }> | undefined) =>
    items?.length ? items.map((item) => money(item.amount, item.currency)).join(" · ") : money("0");
  const activities = input.rows.slice(0, 8).map((row) =>
    `<tr><td><bdi>${escapeHtml(row.entryId)}</bdi></td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.status)}</td><td><bdi>${escapeHtml(row.occurredAt)}</bdi></td></tr>`,
  ).join("");
  const prepared = new Intl.DateTimeFormat(input.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  return `<article class="sarafi-daily-pdf" lang="${input.language}" dir="${direction}">
    <style>
      .sarafi-daily-pdf{position:relative;box-sizing:border-box;width:794px;height:1123px;overflow:hidden;padding:52px 58px;color:#11252e;background:#fff;font-family:Tahoma,"Segoe UI",Arial,sans-serif;font-size:13px;line-height:1.45}
      .sarafi-daily-pdf *{box-sizing:border-box}.pdf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:28px;padding-bottom:20px;border-bottom:3px solid #0d7169}.pdf-brand{display:flex;align-items:center;gap:13px}.pdf-mark{display:grid;width:46px;height:46px;place-items:center;border-radius:13px;color:#f4d58a;background:#102a36;font-size:24px;font-weight:900}.pdf-head h1{margin:0;color:#102a36;font-size:25px}.pdf-head p,.pdf-meta{margin:4px 0 0;color:#607078}.pdf-meta{text-align:${direction === "rtl" ? "left" : "right"};font-size:11px}.pdf-section{margin-top:22px}.pdf-section h2{margin:0 0 11px;color:#173541;font-size:15px}.pdf-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.pdf-stat{min-height:75px;padding:11px;border:1px solid #d9e2df;border-radius:10px;background:#f7f8f5}.pdf-stat span{display:block;min-height:30px;color:#607078;font-size:10px}.pdf-stat strong{display:block;color:#102a36;font-size:15px}.pdf-money{direction:ltr;unicode-bidi:isolate;display:inline-block;font-weight:800}.pdf-columns{display:grid;grid-template-columns:1.35fr .85fr;gap:14px}.pdf-card{padding:15px;border:1px solid #d9e2df;border-radius:11px}.pdf-card ul{display:grid;grid-template-columns:1fr 1fr;gap:0 22px;margin:0;padding:0;list-style:none}.pdf-card li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #edf0ed}.pdf-debt{display:grid;gap:10px}.pdf-debt div{padding:12px;border-inline-start:4px solid #c49a4b;border-radius:7px;background:#fbf8f0}.pdf-debt span{display:block;margin-bottom:4px;color:#68767b;font-size:10px}.pdf-cashbox{display:flex;justify-content:space-between;gap:12px;margin-top:10px;padding:11px 12px;border-radius:8px;background:#eef6f3}.pdf-table{width:100%;border-collapse:collapse;font-size:10px}.pdf-table th{padding:8px 9px;color:#fff;background:#102a36;text-align:start}.pdf-table td{padding:8px 9px;border-bottom:1px solid #e4e9e6}.pdf-empty{padding:22px;border:1px dashed #ccd7d2;border-radius:10px;color:#68767b;text-align:center}.pdf-foot{position:absolute;right:58px;bottom:40px;left:58px;display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid #d9e2df;color:#6d797e;font-size:10px}
    </style>
    <header class="pdf-head"><div class="pdf-brand"><span class="pdf-mark">S</span><div><h1>${escapeHtml(input.businessName)}</h1><p>${escapeHtml(input.reportName || labels.title)}</p></div></div><div class="pdf-meta">${labels.branch}: ${escapeHtml(input.branchName)}<br>${labels.date}: <bdi>${escapeHtml(input.businessDate)}</bdi></div></header>
    <section class="pdf-section"><h2>${labels.summary}</h2><div class="pdf-summary"><div class="pdf-stat"><span>${labels.count}</span><strong>${snapshot?.transaction_count ?? input.rows.length}</strong></div><div class="pdf-stat"><span>${labels.volume}</span><strong>${money(snapshot?.volume_base ?? "0")}</strong></div><div class="pdf-stat"><span>${labels.profit}</span><strong>${money(snapshot?.realized_profit ?? "0")}</strong></div><div class="pdf-stat"><span>${labels.expenses}</span><strong>${money(snapshot?.expenses ?? "0")}</strong></div><div class="pdf-stat"><span>${labels.position}</span><strong>${money(snapshot?.net_position_base ?? "0")}</strong></div></div></section>
    <section class="pdf-section pdf-columns"><div class="pdf-card"><h2>${labels.money}</h2>${locations ? `<ul>${locations}</ul>` : `<div class="pdf-empty">—</div>`}</div><div class="pdf-card"><h2>${labels.debts}</h2><div class="pdf-debt"><div><span>${labels.receivable}</span>${debtLine(snapshot?.receivables)}</div><div><span>${labels.payable}</span>${debtLine(snapshot?.payables)}</div></div><div class="pdf-cashbox"><span>${labels.cashbox} · ${labels.difference}</span>${money(snapshot?.reconciliation_differences ?? "0")}</div></div></section>
    <section class="pdf-section"><h2>${labels.activity}</h2>${activities ? `<table class="pdf-table"><tbody>${activities}</tbody></table>` : `<div class="pdf-empty">${labels.empty}</div>`}</section>
    <footer class="pdf-foot"><span>SARAFI · ${labels.title}</span><span>${labels.made}: <bdi>${escapeHtml(prepared)}</bdi></span></footer>
  </article>`;
}

export async function downloadPdf(input: DailyReportInput): Promise<void> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;overflow:hidden;background:#fff;z-index:-1";
  host.innerHTML = buildDailyReportHtml(input);
  document.body.append(host);
  try {
    await document.fonts.ready;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
      width: 794,
      height: 1123,
    });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 595.28, 841.89, undefined, "FAST");
    const asciiName = input.reportName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
    pdf.save(`${asciiName || "sarafi-daily-report"}-${input.businessDate}.pdf`);
  } finally {
    host.remove();
  }
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
