import { describe, expect, it } from 'vitest'
import { searchRecords } from './search'

describe('tenant and role scoped search', () => {
  const records = [
    { organizationId: 'org-a', id: 'trade-1', kind: 'transaction' as const, searchable: 'SAR-0001 Walk-in USD 1000' },
    { organizationId: 'org-b', id: 'trade-2', kind: 'transaction' as const, searchable: 'SAR-0002 Restricted USD 9000' },
    { organizationId: 'org-a', id: 'debt-1', kind: 'debt' as const, searchable: 'Ahmad 3000 USD', restrictedRoles: ['owner', 'manager'] },
  ]
  it('does not leak another tenant or restricted debt through search', () => {
    expect(searchRecords(records, 'USD', { organizationId: 'org-a', role: 'cashier' })).toHaveLength(1)
    expect(searchRecords(records, 'USD', { organizationId: 'org-b', role: 'owner' })).toHaveLength(1)
  })
})
