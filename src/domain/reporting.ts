import Decimal from 'decimal.js'
import type { JournalEntry, LedgerState } from './ledger'

export type CashCount = { currency: string; expected: string; counted: string }
export type ReconciliationResult = { currency: string; expected: string; counted: string; variance: string; status: 'balanced' | 'variance' }
export type ReportFilter = { organizationId: string; from?: string; to?: string; branchId?: string; currency?: string; status?: string }
export type ReportRow = { entryId: string; occurredAt: string; type: string; branchId: string; status: string; realizedProfit: string }
export type Notification = { id: string; organizationId: string; type: string; subjectId: string; message: string; createdAt: string; delivered: boolean }

const decimal = (value: string) => new Decimal(value)

export function reconcileCashbox(counts: CashCount[]): ReconciliationResult[] {
  return counts.map(({ currency, expected, counted }) => {
    const variance = decimal(counted).minus(expected)
    return { currency, expected, counted, variance: variance.toFixed(12), status: variance.isZero() ? 'balanced' : 'variance' }
  })
}

export function filterJournalEntries(entries: JournalEntry[], filter: ReportFilter): ReportRow[] {
  return entries.filter((entry) => entry.organizationId === filter.organizationId && (!filter.branchId || entry.branchId === filter.branchId) && (!filter.status || entry.status === filter.status) && (!filter.from || entry.occurredAt >= filter.from) && (!filter.to || entry.occurredAt <= filter.to) && (!filter.currency || entry.lines.some((line) => line.currency === filter.currency))).map((entry) => ({ entryId: entry.id, occurredAt: entry.occurredAt, type: entry.sourceType, branchId: entry.branchId, status: entry.status, realizedProfit: entry.realizedProfit }))
}

export function summarizeProfit(entries: JournalEntry[], filter: ReportFilter): { realizedProfit: string; transactionCount: number } {
  const rows = filterJournalEntries(entries, filter)
  return { realizedProfit: rows.reduce((total, row) => total.plus(row.realizedProfit), new Decimal(0)).toFixed(12), transactionCount: rows.length }
}

export function buildCsvReport(rows: ReportRow[], businessName: string, reportName: string, generatedAt: string): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const header = [`Business: ${businessName}`, `Report: ${reportName}`, `Generated: ${generatedAt}`, '']
  const columns = ['Entry', 'Occurred at', 'Type', 'Branch', 'Status', 'Realized profit']
  return [...header, columns.join(','), ...rows.map((row) => [row.entryId, row.occurredAt, row.type, row.branchId, row.status, row.realizedProfit].map(escape).join(','))].join('\n')
}

export function enqueueNotification(notifications: Notification[], input: Omit<Notification, 'id' | 'createdAt' | 'delivered'>): Notification {
  const existing = notifications.find((notification) => notification.organizationId === input.organizationId && notification.type === input.type && notification.subjectId === input.subjectId)
  if (existing) return existing
  const notification = { ...input, id: `notification_${notifications.length + 1}`, createdAt: new Date().toISOString(), delivered: false }
  notifications.push(notification)
  return notification
}

export function deriveCurrencyBalances(state: LedgerState): Record<string, string> {
  return Object.fromEntries(Object.entries(state.positions).map(([currency, position]) => [currency, position.quantity.toFixed(12)]))
}
