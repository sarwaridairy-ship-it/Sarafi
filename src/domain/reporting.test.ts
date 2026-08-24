import { describe, expect, it } from 'vitest'
import { buildCsvReport, enqueueNotification, reconcileCashbox, summarizeProfit, type Notification } from './reporting'

const entries = [
  { id: 'je-1', organizationId: 'org-a', branchId: 'branch-a', status: 'posted' as const, sourceType: 'SELL_FX' as const, clientCommandId: 'one', occurredAt: '2026-08-25T09:00:00.000Z', realizedProfit: '10000.000000000000', lines: [] },
  { id: 'je-2', organizationId: 'org-a', branchId: 'branch-a', status: 'posted' as const, sourceType: 'SELL_FX' as const, clientCommandId: 'two', occurredAt: '2026-08-25T10:00:00.000Z', realizedProfit: '0.000000000000', lines: [] },
]

describe('owner reporting and control', () => {
  it('detects cash variance explicitly', () => {
    expect(reconcileCashbox([{ currency: 'AFN', expected: '643500', counted: '642500' }])[0]).toMatchObject({ variance: '-1000.000000000000', status: 'variance' })
  })
  it('derives period profit and transaction count from journal entries', () => {
    expect(summarizeProfit(entries, { organizationId: 'org-a', from: '2026-08-25T00:00:00.000Z' })).toEqual({ realizedProfit: '10000.000000000000', transactionCount: 2 })
  })
  it('exports report metadata and escaped rows', () => {
    const csv = buildCsvReport([{ entryId: 'je-1', occurredAt: 'now', type: 'SELL_FX', branchId: 'branch-a', status: 'posted', realizedProfit: '10' }], 'Kabul Exchange', 'Daily Journal', 'now')
    expect(csv).toContain('Business: Kabul Exchange')
    expect(csv).toContain('Entry,Occurred at,Type,Branch,Status,Realized profit')
  })
  it('deduplicates retried notifications by organization/type/subject', () => {
    const notifications: Notification[] = []
    const input = { organizationId: 'org-a', type: 'cash_variance', subjectId: 'close-1', message: 'Variance needs review' }
    expect(enqueueNotification(notifications, input).id).toBe(enqueueNotification(notifications, input).id)
    expect(notifications).toHaveLength(1)
  })
})
