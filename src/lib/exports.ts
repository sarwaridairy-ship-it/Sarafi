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
