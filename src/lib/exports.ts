import { jsPDF } from "jspdf";
import { strToU8, zipSync } from "fflate";
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

const escapeXml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[character]!);

const spreadsheetCell = (reference: string, value: string, style = 0) =>
  `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

export function buildXlsxReport(input: {
  rows: ReportRow[];
  businessName: string;
  reportName: string;
  generatedAt: string;
  language: "en" | "fa-AF" | "ps-AF";
  branchName?: string;
  cashboxName?: string;
  period?: string;
  filters?: string;
  preparedBy?: string;
  snapshotHash?: string;
}): Uint8Array {
  const labels = input.language === "en"
    ? ["Reference", "Date", "Description", "Branch", "Status", "Amount"]
    : input.language === "fa-AF"
      ? ["شماره", "تاریخ", "شرح", "شعبه", "حالت", "مبلغ"]
      : ["شمېره", "نېټه", "تشریح", "څانګه", "حالت", "اندازه"];
  const evidenceLabels = input.language === "en"
    ? { branch: "Branch", cashbox: "Cashbox", period: "Period", filters: "Filters", preparedBy: "Prepared by", snapshot: "Snapshot" }
    : input.language === "fa-AF"
      ? { branch: "شعبه", cashbox: "صندوق", period: "دوره", filters: "فیلترها", preparedBy: "تهیه‌کننده", snapshot: "نشان نسخه" }
      : { branch: "څانګه", cashbox: "صندوق", period: "موده", filters: "چاڼونه", preparedBy: "چمتو کوونکی", snapshot: "د نسخې نښه" };
  const evidenceRows = [
    input.branchName ? [`${evidenceLabels.branch}: ${input.branchName}`] : null,
    input.cashboxName ? [`${evidenceLabels.cashbox}: ${input.cashboxName}`] : null,
    input.period ? [`${evidenceLabels.period}: ${input.period}`] : null,
    input.filters ? [`${evidenceLabels.filters}: ${input.filters}`] : null,
    input.preparedBy ? [`${evidenceLabels.preparedBy}: ${input.preparedBy}`] : null,
    input.snapshotHash ? [`${evidenceLabels.snapshot}: ${input.snapshotHash}`] : null,
  ].filter((row): row is string[] => row !== null);
  const metadata = [
    [input.businessName],
    [input.reportName],
    [input.generatedAt],
    ...evidenceRows,
    [],
    labels,
  ];
  const values = [...metadata, ...input.rows.map((row) => [row.entryId, row.occurredAt, row.type, row.branchId, row.status, row.realizedProfit])];
  const sheetRows = values.map((row, rowIndex) => {
    const headingRow = metadata.length - 1;
    const style = rowIndex === 0 ? 2 : rowIndex === headingRow ? 1 : 0;
    const cells = row.map((value, columnIndex) => spreadsheetCell(`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`, String(value ?? ""), style)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const headingRowNumber = metadata.length;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="${input.language === "en" ? 0 : 1}"><pane ySplit="${headingRowNumber}" topLeftCell="A${headingRowNumber + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="23" customWidth="1"/><col min="3" max="3" width="42" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/><col min="5" max="5" width="16" customWidth="1"/><col min="6" max="6" width="18" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A${headingRowNumber}:F${Math.max(headingRowNumber, values.length)}"/></worksheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(input.reportName)}</dc:title><dc:creator>SARAFI</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(input.generatedAt)}</dcterms:created></cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SARAFI</Application></Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="SARAFI" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0D756C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };
  return zipSync(files, { level: 6 });
}

export function downloadXlsx(input: Parameters<typeof buildXlsxReport>[0], filename: string): void {
  const workbook = buildXlsxReport(input);
  const data = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
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
  cashboxName?: string;
  period?: string;
  filters?: string;
  preparedBy?: string;
  generatedAt?: string;
  snapshotHash?: string;
};

const dailyReportCopy = {
  en: {
    title: "Daily report", summary: "Today at a glance", count: "Transactions", volume: "Turnover", profit: "Profit", expenses: "Expenses", position: "Net position", money: "Money now", debts: "Debts and receivables", receivable: "People owe the shop", payable: "The shop owes", activity: "Recent activity", empty: "No transactions were recorded for this report.", branch: "Branch", date: "Business date", made: "Prepared", preparedBy: "Prepared by", cashbox: "Cashbox", cashboxCheck: "Cashbox check", period: "Period", filters: "Filters", snapshot: "Snapshot", page: "Page", difference: "Difference", reference: "ID", amount: "Amount", status: "Status",
  },
  "fa-AF": {
    title: "گزارش روزانه", summary: "خلاصه امروز", count: "تعداد معاملات", volume: "گردش امروز", profit: "مفاد امروز", expenses: "مصارف", position: "ارزش خالص", money: "پول فعلی صرافی", debts: "طلب و قرض", receivable: "مردم به صرافی قرضدار اند", payable: "صرافی به مردم قرضدار است", activity: "معاملات و کارهای روز", empty: "در این گزارش معامله‌ای ثبت نشده است.", branch: "شعبه", date: "تاریخ کاری", made: "ساخته‌شده", preparedBy: "تهیه‌کننده", cashbox: "صندوق", cashboxCheck: "بررسی صندوق", period: "دوره", filters: "فیلترها", snapshot: "نشان نسخه", page: "صفحه", difference: "تفاوت", reference: "شماره", amount: "مبلغ", status: "حالت",
  },
  "ps-AF": {
    title: "ورځنی راپور", summary: "د نن لنډیز", count: "د معاملو شمېر", volume: "د نن راکړه ورکړه", profit: "د نن ګټه", expenses: "لګښتونه", position: "خالص ارزښت", money: "د صرافۍ اوسني پیسې", debts: "پورونه او طلبونه", receivable: "خلک صرافۍ ته پوروړي دي", payable: "صرافي پوروړې ده", activity: "د ورځې معاملې او کارونه", empty: "په دې راپور کې کومه معامله نه ده ثبت شوې.", branch: "څانګه", date: "کاري نېټه", made: "جوړ شوی", preparedBy: "چمتو کوونکی", cashbox: "صندوق", cashboxCheck: "د صندوق کتنه", period: "موده", filters: "چاڼونه", snapshot: "د نسخې نښه", page: "پاڼه", difference: "توپیر", reference: "شمېره", amount: "اندازه", status: "حالت",
  },
} as const;

export function buildDailyReportHtml(input: DailyReportInput): string {
  const labels = dailyReportCopy[input.language];
  const direction = input.language === "en" ? "ltr" : "rtl";
  const snapshot = input.snapshot;
  const money = (value: string, currency = "AFN") =>
    `<bdi class="pdf-money">${escapeHtml(value || "0")} ${escapeHtml(currency)}</bdi>`;
  const activities = input.rows.map((row) =>
    `<tr><td><bdi>${escapeHtml(row.entryId)}</bdi></td><td>${escapeHtml(row.type)}</td><td><bdi>${escapeHtml(row.realizedProfit)}</bdi></td><td>${escapeHtml(row.status)}</td><td><bdi>${escapeHtml(row.occurredAt)}</bdi></td></tr>`,
  ).join("");
  const prepared = new Intl.DateTimeFormat(input.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(input.generatedAt ?? Date.now()));
  return `<article class="sarafi-daily-pdf" lang="${input.language}" dir="${direction}">
    <style>
      .sarafi-daily-pdf{position:relative;box-sizing:border-box;width:794px;min-height:1123px;padding:52px 58px;color:#11252e;background:#fff;font-family:Tahoma,"Segoe UI",Arial,sans-serif;font-size:13px;line-height:1.45}
      .sarafi-daily-pdf *{box-sizing:border-box}.pdf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:28px;padding-bottom:20px;border-bottom:3px solid #0d7169}.pdf-brand{display:flex;align-items:center;gap:13px}.pdf-mark{display:grid;width:46px;height:46px;place-items:center;border-radius:13px;color:#f4d58a;background:#102a36;font-size:24px;font-weight:900}.pdf-head h1{margin:0;color:#102a36;font-size:25px}.pdf-head p,.pdf-meta{margin:4px 0 0;color:#607078}.pdf-meta{text-align:${direction === "rtl" ? "left" : "right"};font-size:11px}.pdf-section{margin-top:22px}.pdf-section h2{margin:0 0 11px;color:#173541;font-size:15px}.pdf-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.pdf-stat{min-height:75px;padding:11px;border:1px solid #d9e2df;border-radius:10px;background:#f7f8f5}.pdf-stat span{display:block;min-height:30px;color:#607078;font-size:10px}.pdf-stat strong{display:block;color:#102a36;font-size:15px}.pdf-money{direction:ltr;unicode-bidi:isolate;display:inline-block;font-weight:800}.pdf-table{width:100%;border-collapse:collapse;font-size:10px}.pdf-table tr{break-inside:avoid}.pdf-table th{padding:8px 9px;color:#fff;background:#102a36;text-align:start}.pdf-table td{padding:8px 9px;border-bottom:1px solid #e4e9e6}.pdf-empty{padding:22px;border:1px dashed #ccd7d2;border-radius:10px;color:#68767b;text-align:center}.pdf-foot{display:flex;justify-content:space-between;margin-top:28px;padding-top:12px;border-top:1px solid #d9e2df;color:#6d797e;font-size:10px}
    </style>
    <header class="pdf-head"><div class="pdf-brand"><span class="pdf-mark">S</span><div><h1>${escapeHtml(input.businessName)}</h1><p>${labels.title}</p></div></div><div class="pdf-meta">${labels.date}: <bdi>${escapeHtml(input.businessDate)}</bdi><br>${labels.branch}: ${escapeHtml(input.branchName)}<br>${labels.cashbox}: ${escapeHtml(input.cashboxName ?? "—")}</div></header>
    <section class="pdf-section"><h2>${labels.summary}</h2><div class="pdf-summary"><div class="pdf-stat"><span>${labels.count}</span><strong>${snapshot?.transaction_count ?? input.rows.length}</strong></div><div class="pdf-stat"><span>${labels.volume}</span><strong>${money(snapshot?.volume_base ?? "0")}</strong></div><div class="pdf-stat"><span>${labels.profit}</span><strong>${money(snapshot?.realized_profit ?? "0")}</strong></div><div class="pdf-stat"><span>${labels.expenses}</span><strong>${money(snapshot?.expenses ?? "0")}</strong></div></div></section>
    <section class="pdf-section"><h2>${labels.activity}</h2>${activities ? `<table class="pdf-table"><tbody>${activities}</tbody></table>` : `<div class="pdf-empty">${labels.empty}</div>`}</section>
    <footer class="pdf-foot"><span>SARAFI · ${labels.title}</span><span>${labels.made}: <bdi>${escapeHtml(prepared)}</bdi></span></footer>
  </article>`;
}

export async function downloadPdf(input: DailyReportInput): Promise<void> {
  // Keep the report as PDF text instead of a canvas image: users can search,
  // select, copy, and print the exported record. The source HTML remains the
  // print-quality preview used by the report screen.
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const toBase64 = (bytes: Uint8Array) => {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
  };
  let reportFont = "helvetica";
  try {
    const fontResponse = await fetch("/fonts/NotoSansArabic-Regular.ttf", { cache: "force-cache" });
    if (!fontResponse.ok) throw new Error("Report font unavailable");
    pdf.addFileToVFS("NotoSansArabic-Regular.ttf", toBase64(new Uint8Array(await fontResponse.arrayBuffer())));
    pdf.addFont("NotoSansArabic-Regular.ttf", "NotoSansArabic", "normal");
    reportFont = "NotoSansArabic";
  } catch (error) {
    if (input.language !== "en") throw error;
    // English remains exportable with the built-in font if the local font is
    // unavailable. Dari/Pashto must never silently lose Arabic shaping.
  }
  const labels = dailyReportCopy[input.language];
  const snapshot = input.snapshot;
  const lines = [
    input.businessName,
    labels.title,
    `${labels.date}: ${input.businessDate}`,
    `${labels.branch}: ${input.branchName}`,
    `${labels.cashbox}: ${input.cashboxName ?? "—"}`,
    "",
    labels.summary,
    `${labels.count}: ${snapshot?.transaction_count ?? input.rows.length}`,
    `${labels.volume}: ${snapshot?.volume_base ?? "0"} AFN`,
    `${labels.profit}: ${snapshot?.realized_profit ?? "0"} AFN`,
    `${labels.expenses}: ${snapshot?.expenses ?? "0"} AFN`,
    "",
    labels.activity,
  ];
  pdf.setFont(reportFont, "normal");
  pdf.setFontSize(10);
  let y = 46;
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line, 500) as string[];
    for (const item of wrapped) {
      if (y > 800) { pdf.addPage(); y = 46; }
      pdf.text(item, input.language === "en" ? 48 : 547, y, { align: input.language === "en" ? "left" : "right" });
      y += 15;
    }
  }
  const textX = input.language === "en" ? 58 : 537;
  const textAlign = input.language === "en" ? "left" : "right";
  const referenceX = input.language === "en" ? 537 : 58;
  const referenceAlign = input.language === "en" ? "right" : "left";
  for (const row of input.rows) {
    const descriptionLines = row.type
      .split(" · ")
      .flatMap((part) => pdf.splitTextToSize(part, 320) as string[]);
    const rowHeight = Math.max(58, 36 + descriptionLines.length * 13);
    if (y + rowHeight > 795) {
      pdf.addPage();
      y = 46;
      pdf.setFontSize(11);
      pdf.text(labels.activity, input.language === "en" ? 48 : 547, y, { align: input.language === "en" ? "left" : "right" });
      y += 18;
    }
    pdf.setDrawColor(218, 226, 223);
    pdf.roundedRect(48, y, 499, rowHeight, 5, 5);
    pdf.setFontSize(10);
    descriptionLines.forEach((line, index) => {
      pdf.text(line, textX, y + 16 + index * 13, { align: textAlign });
    });
    pdf.setFontSize(8);
    pdf.text(`${labels.reference}: ${row.entryId}`, referenceX, y + 16, { align: referenceAlign });
    const detailY = y + 22 + descriptionLines.length * 13;
    pdf.text(`${labels.status}: ${row.status}`, textX, detailY, { align: textAlign });
    pdf.text(`${labels.amount}: ${row.realizedProfit}`, referenceX, detailY, { align: referenceAlign });
    pdf.text(row.occurredAt, referenceX, detailY + 13, { align: referenceAlign });
    y += rowHeight + 7;
  }
  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pdf.setPage(pageNumber);
    pdf.setFontSize(8);
    pdf.text(`${labels.page} ${pageNumber} / ${pageCount}`, input.language === "en" ? 48 : 547, 820, { align: input.language === "en" ? "left" : "right" });
  }
  const asciiName = input.reportName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  pdf.save(`${asciiName || "sarafi-daily-report"}-${input.businessDate}.pdf`);
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
