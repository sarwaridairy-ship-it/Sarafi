export type Role = 'owner' | 'manager' | 'accountant' | 'cashier' | 'viewer' | 'compliance_officer'
export type Permission = 'organization:manage' | 'financial:overview' | 'financial:post' | 'financial:report' | 'reconciliation:manage' | 'team:manage' | 'approval:decide' | 'compliance:review' | 'security:manage'

const rolePermissions: Record<Role, Permission[]> = {
  owner: ['organization:manage', 'financial:overview', 'financial:post', 'financial:report', 'reconciliation:manage', 'team:manage', 'approval:decide', 'compliance:review', 'security:manage'],
  manager: ['financial:overview', 'financial:post', 'financial:report', 'reconciliation:manage', 'approval:decide'],
  accountant: ['financial:overview', 'financial:report', 'reconciliation:manage'],
  cashier: ['financial:post'],
  viewer: ['financial:overview', 'financial:report'],
  compliance_officer: ['compliance:review', 'financial:overview'],
}

export type Membership = { userId: string; organizationId: string; role: Role; branchIds: string[]; cashboxIds: string[]; active: boolean }
export type ApprovalRequest = { id: string; organizationId: string; requestedBy: string; action: string; amountBase: string; payloadSummary: string; status: 'pending' | 'approved' | 'rejected' | 'expired'; expiresAt: string; decidedBy?: string }
export type Device = { id: string; organizationId: string; userId: string; friendlyName: string; status: 'trusted' | 'untrusted' | 'revoked'; lastBranchId?: string; lastSeenAt: string; revokedAt?: string }

export function can(membership: Membership, permission: Permission, scope?: { branchId?: string; cashboxId?: string }): boolean {
  if (!membership.active || !rolePermissions[membership.role].includes(permission)) return false
  if (scope?.branchId && membership.branchIds.length > 0 && !membership.branchIds.includes(scope.branchId)) return false
  if (scope?.cashboxId && membership.cashboxIds.length > 0 && !membership.cashboxIds.includes(scope.cashboxId)) return false
  return true
}

export function requestApproval(input: Omit<ApprovalRequest, 'status'>): ApprovalRequest {
  if (!input.payloadSummary.trim() || !input.expiresAt) throw new Error('Approval requests require a summary and expiry')
  return { ...input, status: 'pending' }
}

export function decideApproval(request: ApprovalRequest, approver: Membership, decision: 'approved' | 'rejected', reason: string): ApprovalRequest {
  if (!can(approver, 'approval:decide')) throw new Error('This user cannot decide approvals')
  if (request.requestedBy === approver.userId) throw new Error('A user cannot approve their own action')
  if (!reason.trim()) throw new Error('An approval decision requires a reason')
  if (new Date(request.expiresAt).getTime() <= Date.now()) throw new Error('Approval request has expired')
  return { ...request, status: decision, decidedBy: approver.userId }
}

export function revokeDevice(device: Device, actor: Membership): Device {
  if (!can(actor, 'security:manage') || actor.organizationId !== device.organizationId) throw new Error('Only an authorized organization security administrator can revoke devices')
  return { ...device, status: 'revoked', revokedAt: new Date().toISOString() }
}
