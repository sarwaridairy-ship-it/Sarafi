import { describe, expect, it } from 'vitest'
import { can, decideApproval, requestApproval, revokeDevice, type Membership } from './access'

const owner: Membership = { userId: 'owner-1', organizationId: 'org-a', role: 'owner', branchIds: ['branch-a'], cashboxIds: ['cash-a'], active: true }
const cashier: Membership = { userId: 'cashier-1', organizationId: 'org-a', role: 'cashier', branchIds: ['branch-a'], cashboxIds: ['cash-a'], active: true }
const accountant: Membership = { userId: 'accountant-1', organizationId: 'org-a', role: 'accountant', branchIds: [], cashboxIds: [], active: true }

describe('organization access controls', () => {
  it('limits cashier posting to assigned branch and cashbox', () => {
    expect(can(cashier, 'financial:post', { branchId: 'branch-a', cashboxId: 'cash-a' })).toBe(true)
    expect(can(cashier, 'financial:report')).toBe(false)
    expect(can(cashier, 'financial:post', { branchId: 'branch-b' })).toBe(false)
  })

  it('gives accountants reporting without team administration', () => {
    expect(can(accountant, 'financial:report')).toBe(true)
    expect(can(accountant, 'team:manage')).toBe(false)
  })

  it('prevents approval self-bypass and requires a reason', () => {
    const request = requestApproval({ id: 'approval-1', organizationId: 'org-a', requestedBy: owner.userId, action: 'REVERSAL', amountBase: '1000', payloadSummary: 'Reverse trade 001', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(() => decideApproval(request, owner, 'approved', 'Looks good')).toThrow('cannot approve their own')
    expect(decideApproval(request, { ...owner, userId: 'manager-1', role: 'manager' }, 'approved', 'Verified against receipt').status).toBe('approved')
  })

  it('allows only same-organization security administrators to revoke devices', () => {
    const device = { id: 'device-1', organizationId: 'org-a', userId: 'cashier-1', friendlyName: 'Counter tablet', status: 'trusted' as const, lastSeenAt: new Date().toISOString() }
    expect(revokeDevice(device, owner).status).toBe('revoked')
    expect(() => revokeDevice({ ...device, organizationId: 'org-b' }, owner)).toThrow('security administrator')
  })
})
