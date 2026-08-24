import Decimal from 'decimal.js'

export type ComplianceRule = { id: string; version: string; effectiveFrom: string; effectiveTo?: string; transactionThresholdAfn?: string; aggregationWindowHours?: number; kycRequiredAboveAfn?: string; eddRequiredAboveAfn?: string; requiredDocuments: string[]; screeningRequired: boolean; retentionYears?: number; status: 'draft' | 'active' | 'awaiting_legal_signoff' }
export type ComplianceEvent = { id: string; organizationId: string; ruleId: string; sourceEventId: string; kind: 'large_transaction' | 'kyc_required' | 'edd_required' | 'screening_required' | 'document_missing'; evidence: Record<string, string>; status: 'open' | 'under_review' | 'cleared' | 'reported'; createdAt: string }
export type KycProfile = { personId: string; legalName: string; fatherName?: string; dateOfBirth?: string; nationality?: string; documentType?: 'tazkira' | 'passport' | 'other'; documentNumber?: string; documentExpiry?: string; address?: string; phone?: string; occupationOrBusiness?: string; purposeOfFunds?: string; sourceOfFunds?: string; riskLevel: 'low' | 'medium' | 'high'; reviewStatus: 'pending' | 'approved' | 'review_required'; nextReviewAt?: string }
export type ScreeningProvider = { name: string; version: string; screenedAt: string; screen: (name: string) => Promise<{ score: string; potentialMatch: boolean; details: string }> }

export function activeComplianceRule(rules: ComplianceRule[], at: string): ComplianceRule | undefined {
  const timestamp = new Date(at).getTime()
  return rules.filter((rule) => rule.status === 'active' && new Date(rule.effectiveFrom).getTime() <= timestamp && (!rule.effectiveTo || new Date(rule.effectiveTo).getTime() > timestamp)).sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0]
}

export function evaluateCompliance(input: { organizationId: string; sourceEventId: string; amountAfn: string; occurredAt: string; rule: ComplianceRule }): ComplianceEvent[] {
  const amount = new Decimal(input.amountAfn)
  if (!amount.isFinite() || amount.isNegative()) throw new Error('Compliance amount must be numeric')
  const events: ComplianceEvent[] = []
  const add = (kind: ComplianceEvent['kind'], evidence: Record<string, string>) => events.push({ id: `compliance_${events.length + 1}`, organizationId: input.organizationId, ruleId: input.rule.id, sourceEventId: input.sourceEventId, kind, evidence, status: 'open', createdAt: new Date().toISOString() })
  if (input.rule.transactionThresholdAfn && amount.gte(input.rule.transactionThresholdAfn)) add('large_transaction', { amountAfn: input.amountAfn, thresholdAfn: input.rule.transactionThresholdAfn })
  if (input.rule.kycRequiredAboveAfn && amount.gte(input.rule.kycRequiredAboveAfn)) add('kyc_required', { amountAfn: input.amountAfn, thresholdAfn: input.rule.kycRequiredAboveAfn })
  if (input.rule.eddRequiredAboveAfn && amount.gte(input.rule.eddRequiredAboveAfn)) add('edd_required', { amountAfn: input.amountAfn, thresholdAfn: input.rule.eddRequiredAboveAfn })
  if (input.rule.screeningRequired) add('screening_required', { reason: 'active_rule_requires_screening' })
  return events
}

export function createScreeningBoundary(provider: ScreeningProvider | null) {
  return async (name: string) => provider ? provider.screen(name) : { score: '0', potentialMatch: false, details: 'No approved screening provider configured; legal/compliance setup required' }
}

export function appendAuditHash(previousHash: string, event: { id: string; action: string; createdAt: string }): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${previousHash}|${event.id}|${event.action}|${event.createdAt}`)).then((digest) => Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''))
}
