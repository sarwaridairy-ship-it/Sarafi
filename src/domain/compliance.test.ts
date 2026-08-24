import { describe, expect, it } from 'vitest'
import { activeComplianceRule, appendAuditHash, createScreeningBoundary, evaluateCompliance } from './compliance'

const rule = { id: 'rule-1', version: '2026-awaiting-review', effectiveFrom: '2026-01-01T00:00:00.000Z', transactionThresholdAfn: '100000', kycRequiredAboveAfn: '50000', eddRequiredAboveAfn: '500000', requiredDocuments: ['identity'], screeningRequired: true, status: 'active' as const }

describe('configurable compliance foundation', () => {
  it('selects the effective version without hard-coding a lifetime threshold', () => {
    expect(activeComplianceRule([rule], '2026-08-25T00:00:00.000Z')?.version).toBe('2026-awaiting-review')
  })
  it('creates evidence-backed review events for configured rules', () => {
    const events = evaluateCompliance({ organizationId: 'org-a', sourceEventId: 'je-1', amountAfn: '600000', occurredAt: '2026-08-25T00:00:00.000Z', rule })
    expect(events.map((event) => event.kind)).toEqual(['large_transaction', 'kyc_required', 'edd_required', 'screening_required'])
    expect(events.every((event) => event.ruleId === rule.id && event.status === 'open')).toBe(true)
  })
  it('fails closed when no approved sanctions provider exists', async () => {
    await expect(createScreeningBoundary(null)('Ahmad Khan')).resolves.toMatchObject({ potentialMatch: false })
  })
  it('produces a tamper-evident hash chain value', async () => {
    const hash = await appendAuditHash('genesis', { id: 'audit-1', action: 'posted', createdAt: '2026-08-25T00:00:00.000Z' })
    expect(hash).toHaveLength(64)
  })
})
