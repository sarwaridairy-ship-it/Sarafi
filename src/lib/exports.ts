import { jsPDF } from 'jspdf'
import type { ReportRow } from '../domain/reporting'

export function downloadCsv(content: string, filename: string): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

export function downloadPdf(rows: ReportRow[], businessName: string, reportName: string): void {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  pdf.setFontSize(16)
  pdf.text(businessName, 42, 48)
  pdf.setFontSize(11)
  pdf.text(reportName, 42, 68)
  pdf.text(`Generated ${new Date().toISOString()}`, 42, 84)
  pdf.setFontSize(9)
  rows.slice(0, 42).forEach((row, index) => pdf.text(`${row.entryId}  ${row.occurredAt}  ${row.type}  ${row.status}  ${row.realizedProfit}`, 42, 112 + index * 14))
  pdf.save(`${reportName.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.pdf`)
}

export function printReport(): void { window.print() }

export function shareReportViaWhatsApp(input: { reportName: string; reference: string; businessName: string }): void {
  const message = `${input.businessName} - ${input.reportName}\nReference: ${input.reference}`
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

export function printThermalReceipt(input: { businessName: string; reference: string; type: string; amount: string; currency: string; rate?: string }, width: '58mm' | '80mm'): void {
  const receipt = window.open('', '_blank', 'noopener,noreferrer')
  if (!receipt) return
  receipt.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${input.reference}</title><style>@page{size:${width} auto;margin:0}body{width:${width};margin:0;padding:4mm;box-sizing:border-box;font:12px monospace;color:#000}h1{font-size:16px;text-align:center;margin:0 0 8px}p{margin:5px 0;border-bottom:1px dashed #000;padding-bottom:4px}.value{font-weight:bold;font-size:14px}</style></head><body><h1>${input.businessName}</h1><p>${input.type}<br>${input.reference}</p><p>Amount: <span class="value">${input.amount} ${input.currency}</span></p>${input.rate ? `<p>Rate: ${input.rate}</p>` : ''}<p>${new Date().toLocaleString()}</p><script>window.print();window.close();</script></body></html>`)
  receipt.document.close()
}
