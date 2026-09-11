import { getSupabaseClient } from './supabase'
import { getActiveAppUnlockGrant } from './appLock'
import { releaseVersion } from './telemetry'
import {
  parseDebtCreateCommand,
  parseDebtSettlementCommand,
  parseFxTradeCommand,
  parseHawalaIncomingCommand,
  parseHawalaPayoutCommand,
  parseHawalaSendCommand,
  parseHawalaSettlementCommand,
  type FxTradeCommand,
} from '../domain/commands'
import { sanitizeIdentityImage, validateDocumentFile, type DocumentType } from './integrations'

export type RpcResult<T> = { data: T | null; error: string | null }

export async function recordClientError(input: {
  eventName: 'render_error' | 'route_error'
  sourceName: string
  errorCode: string
  httpStatus?: number
}): Promise<string> {
  const correlationId = crypto.randomUUID()
  const client = getSupabaseClient()
  if (!client) return correlationId
  await client.rpc('record_client_telemetry', { command: {
    organization_id: null,
    event_name: input.eventName,
    release_version: releaseVersion(),
    route: window.location.pathname,
    rpc_name: input.sourceName,
    rpc_error_code: input.errorCode,
    correlation_id: correlationId,
    http_status: input.httpStatus ?? null,
    online: navigator.onLine,
  } })
  return correlationId
}
export type DashboardSnapshot = { role_code?: string; profit_hidden?: boolean; transaction_count: number; buy_count: number; sell_count: number; exchange_count: number; volume_base: string; realized_profit: string; commission_income: string; expenses: string; net_result: string; net_position_base: string; reconciliation_differences: string; pending_approvals: number; fresh_at: string; positions: Array<{ currency: string; quantity: string; carrying_base_value: string }>; locations: Array<{ location_id: string; location_type: 'cashbox' | 'bank' | 'location' | 'account'; location_name: string; currency: string; quantity: string }>; receivables: Array<{ currency: string; amount: string }>; payables: Array<{ currency: string; amount: string }>; activity: Array<{ id: string; reference: string; type: string; occurred_at: string; status: string }> }
export type DebtRecord = { id: string; branch_id?: string; counterparty_id: string; counterparty_name?: string; direction: 'receivable' | 'payable'; currency_code: string; original_amount: string; outstanding_amount: string; due_at: string | null; notes: string | null; created_at?: string }
export type CounterpartyRecord = { id: string; customer_number?: number; customer_reference?: string; branch_id?: string | null; display_name: string; counterparty_type: string; risk_status: string; phone?: string | null; notes?: string | null }
export type HawalaTransferRecord = { id: string; beneficiary_name: string; origin_location: string; destination_location: string; currency_code: string; amount: string; fee: string; reference_code: string; status: string; created_at: string; direction?: 'incoming' | 'outgoing'; workflow_type?: string; hawala_partner_id?: string | null; integrity_state?: 'valid' | 'review_required'; journal_entry_id?: string | null; payout_journal_entry_id?: string | null; payout_receipt_id?: string | null; sender_organization_id?: string | null; sender_branch_id?: string | null; recipient_type?: 'internal_branch' | 'external_partner' | null; recipient_organization_id?: string | null; recipient_partner_id?: string | null; recipient_branch_id?: string | null; expires_at?: string | null }
export type HawalaPartnerRecord = { id: string; counterparty_id: string | null; name: string; active: boolean; endpoint_type?: 'internal_branch' | 'external_partner' | null; recipient_organization_id?: string | null; recipient_branch_id?: string | null; reciprocal_partner_id?: string | null; endpoint_verified_at?: string | null; endpoint_active?: boolean }
export type HawalaPayoutMatch = { transfer_id: string; reference_code: string; beneficiary_name: string; destination_location: string; currency_code: string; amount: string; branch_id: string; hawala_partner_id: string }
export type HawalaPartnerStatement = { partner_id: string; totals: Array<{ currency_code: string; payable: string; receivable: string; net_receivable: string }>; lines: Array<{ id: string; transfer_id: string; branch_id?: string; reference_code: string; beneficiary_name: string; direction: 'payable' | 'receivable'; currency_code: string; original_amount: string; settled_amount: string; remaining_amount: string; status: string; created_at: string }> }
export type JournalRecord = { id: string; transaction_number?: number; transaction_reference?: string; customer_number?: number; customer_reference?: string; receipt_number?: string | null; customer_rate?: string | null; fee_amount?: string | null; fee_currency?: string | null; status: string; memo: string | null; occurred_at: string; branch_id: string | null; source_type?: string; event_type?: string; immutable_reference?: string; source_account_name?: string | null; destination_account_name?: string | null; source_account_kind?: string | null; destination_account_kind?: string | null; legacy_location_name?: string | null; legacy_from_name?: string | null; legacy_to_name?: string | null; cashbox_name?: string | null; currency_code?: string | null; amount?: string | null; counterparty_name?: string | null; employee_name?: string | null; given_amount?: string | null; given_currency?: string | null; received_amount?: string | null; received_currency?: string | null }
export type LocationEvidenceRecord = { id: string; journal_entry_id: string; currency_code: string; native_debit: string; native_credit: string; occurred_at: string; memo: string | null; location_id: string; location_type: 'cashbox' | 'bank' | 'location' | 'account'; location_name: string }
export type CashboxBalanceRecord = { currency_code: string; expected_amount: string }
export type CounterpartyStatementRecord = { id: string; occurred_at: string; event_type: string; reference: string; status: string; memo: string | null; direction: 'receivable' | 'payable' | null; currency_code: string | null; amount: string | null }
export type RateHistoryRecord = { id: string; from_currency: string; to_currency: string; buy_rate: string; sell_rate: string; effective_from: string; group_name: string; branch_id: string | null }
export type OperationRateContext = { rate_id?: string; rate_group_id?: string; context_id?: string; from_currency: string; to_currency: string; buy_rate?: string; sell_rate?: string; spread_tolerance?: string; tolerance_bps?: string; effective_from?: string; expires_at?: string; age_seconds?: number; max_age_minutes?: number; branch_id?: string | null; source?: string; stale: boolean; missing: boolean; approval_required?: boolean }
export type CurrencyCatalogRecord = { code: string; name_en: string; name_dari: string; name_pashto: string; symbol: string; minor_unit: number; enabled: boolean; display_order?: number }
export type MoneyAccountRecord = { id: string; name: string; account_type: 'cashbox' | 'safe' | 'bank' | 'mobile_money' | 'partner' | 'other'; branch_id: string | null; cashbox_id: string | null; reference_label: string | null; active: boolean; balances: Array<{ currency: string; amount: string }> }
export type MoneyValuationSnapshot = {
  snapshot_id: string
  snapshot_sha256: string
  snapshot_date: string
  captured_at: string
  base_currency: string
  comparison_currency: string
  valuation_rate_set_id: string | null
  valuation_effective_at: string | null
  quality: 'current' | 'partial'
  excluded_currency_count: number
  totals: {
    available_base: string
    receivables_base: string
    payables_base: string
    hawala_net_base: string
    net_position_base: string
    book_value_base: string
    valuation_difference_base: string
    comparison_value: string | null
    comparison_rate: string | null
  }
  currencies: Array<{
    currency_code: string
    available: string
    receivable: string
    payable: string
    hawala_net: string
    native_net: string
    rate: string | null
    rate_status: 'current' | 'stale' | 'missing'
    current_base: string | null
    book_base: string
  }>
  locations: Array<{
    money_account_id: string
    name: string
    account_type: MoneyAccountRecord['account_type']
    branch_id: string | null
    cashbox_id: string | null
    balances: Array<{ currency_code: string; amount: string }>
  }>
}
export type TeamScopeRecord = { id: string; name: string; branch_id?: string }
export type TeamMemberRecord = { id: string; display_name: string; email: string; role_code: string; active: boolean; mfa_required: boolean; joined_at: string; is_current_user: boolean; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[] }
export type TeamInvitationRecord = { id: string; display_name: string; email: string; role_code: string; mfa_required: boolean; status: string; created_at: string; expires_at: string; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[] }
export type DeviceRecord = { id: string; friendly_name: string; status: string; last_seen_at: string; revoked_at: string | null; member_name: string }
export type LinkedDeviceRecord = { id: string; friendly_name: string; status: 'trusted' | 'untrusted' | 'revoked'; last_seen_at: string; revoked_at: string | null }
export type CapabilityContractRecord = {
  default_deny: true
  active: boolean
  organization_id: string
  membership_id: string | null
  role_code: string | null
  capabilities: string[]
  branch_ids: string[]
  cashbox_ids: string[]
  transaction_types: string[]
  amount_limits: Record<string, unknown>
  rate_override_limits: Record<string, unknown>
  capability_scopes: Record<string, { allowed: boolean; branch_ids: string[]; cashbox_ids: string[]; limits: Record<string, unknown> }>
  hawala_permissions: string[]
  document_permissions: string[]
  approval_permissions: string[]
  security_permissions: string[]
  issued_at: string
  expires_in_seconds: number
  expires_at: string
}
export type WorkspaceContextRecord = {
  membership_id: string
  organization_id: string
  organization_name: string
  role_code: string
  mfa_required: boolean
  capabilities: string[]
  capability_contract?: CapabilityContractRecord
  branches: Array<{ id: string; name: string }>
  cashboxes: Array<{ id: string; name: string; branch_id: string }>
  subscription: { status?: string; period_end?: string | null; plan_code?: string }
}
export type ApprovalRecord = { id: string; action_type: string; reason: string; amount_base: string | null; currency_code: string | null; status: string; requested_at: string; requested_by_name: string; decided_by_name: string | null }
export type ResumableApprovalDraft = { id: string; action_type: 'fx_trade' | 'hawala_payout'; status: string; reason: string; amount_base: string | null; currency_code: string | null; requested_at: string; expires_at: string; decided_at: string | null; decision_reason: string | null; resume_route: string | null; draft: Record<string, unknown>; consumed_at: string | null; consumed_journal_entry_id: string | null }
export type TeamControlPlane = { members: TeamMemberRecord[]; invitations: TeamInvitationRecord[]; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[]; devices: DeviceRecord[]; approvals: ApprovalRecord[] }
export type CreatedTeamInvitation = { id: string; invite_token: string; connection_code?: string; email: string; display_name: string; role_code: string; expires_at: string }
export type WorkerJoinRequestRecord = { id: string; display_name: string; email: string; status: string; requested_at: string; assigned_role: string | null; branch_ids: string[]; cashbox_ids: string[]; capability_overrides: Array<{ capability: string; allowed: boolean }>; limits: Record<string, unknown>; mfa_required: boolean; device_review_required: boolean }
export type MembershipCapabilityMatrixRecord = { membership_id: string; role_code: string; effective_capabilities: string[]; overrides: Array<{ capability: string; allowed: boolean; branch_ids: string[]; cashbox_ids: string[]; limits: Record<string, unknown> }> }
export type PrivateDocumentRecord = { id: string; organization_id: string; entity_id: string; entity_type: string; storage_path: string; content_type: string; size_bytes: number; sha256: string; uploaded_by: string; created_at: string }
export type ReceiptRecord = { id: string; journal_entry_id: string; receipt_number: string; language_code: string; created_at: string }
export type DocumentTemplateRecord = { template_code: string; document_kind: 'transaction_receipt' | 'report'; title_en: string; title_dari: string; title_pashto: string; body_en: string; body_dari: string; body_pashto: string }
export type WorkspaceSettingsRecord = { default_language: string; base_currency_code: string; negative_cash_allowed: boolean; receipt_prefix: string; timezone: string; date_display?: 'gregorian' | 'solar_hijri' | 'both'; digit_display?: 'western' | 'localized'; default_cost_basis?: 'weighted_average'; approval_threshold_base?: string; offline_limit_base?: string; cashier_profit_hidden?: boolean; receipt_number_pattern?: string; rate_max_age_minutes?: number; rate_tolerance_bps?: string; features: Array<{ feature_code: string; enabled: boolean }> }
export type NotificationRecord = { id: string; notification_type: string; subject_id: string; message: string; status: 'unread' | 'read' | 'dismissed'; created_at: string }
export type NotificationPreferenceRecord = { id: string; notification_type: string; in_app: boolean; push: boolean; threshold_base: string | null }
export type ReportExportRecord = { id: string; report_name: string; format: 'csv' | 'pdf' | 'xlsx' | 'print'; filters: Record<string, unknown>; generated_at: string; expires_at: string | null; report_snapshot_id?: string; snapshot_sha256?: string }
export type FinancialReportSnapshot = { id: string; report_code: string; filters: Record<string, unknown>; rows: NamedReportRow[]; summary: { row_count: number; total_amount: string | number; total_secondary_amount: string | number; currency_totals: Record<string, string | number> }; snapshot_sha256: string; generated_at: string; expires_at: string }
export type ComplianceWorkspaceRecord = {
  profile: { profile_name: string; legal_signoff_status: string; reviewed_at: string | null; reviewed_by: string | null } | null
  ruleSet: { id: string; version: string; source_reference: string | null; status: string; effective_from: string; required_documents: string[]; screening_required: boolean } | null
  alertCounts: { open: number; reviewing: number; closed: number }
  caseCounts: { draft: number; ready: number; submitted: number; closed: number }
  alerts: Array<{ id: string; alert_type: string; status: string; evidence?: Record<string, unknown>; disposition_reason?: string | null; created_at: string }>
  cases: Array<{ id: string; alert_id: string; report_status: string; notes?: string | null; submitted_reference: string | null; created_at: string }>
  kycProfiles: KycProfileRecord[]
  screeningProvider: string | null
}

export type OrganizationControlPlane = {
  organization: { id: string; display_name: string; legal_name: string; license_number: string | null; license_expires_on: string | null }
  settings: WorkspaceSettingsRecord
  branches: Array<{ id: string; name: string; timezone: string; active: boolean }>
  cashboxes: Array<{ id: string; name: string; branch_id: string; active: boolean }>
  categories: Array<{ id: string; name: string; active: boolean }>
  features: Array<{ code: string; enabled: boolean }>
  rate_groups: Array<{ id: string; name: string; code: string; active: boolean; rates: Array<{ id: string; branch_id: string | null; from_currency: string; to_currency: string; buy_rate: string; sell_rate: string; spread_tolerance: string | null; effective_from: string; active: boolean }> }>
  valuation_sets: Array<{ id: string; name: string; base_currency: string; effective_at: string; source: string; active: boolean; rates: Array<{ currency_code: string; rate: string }> }>
  periods: Array<{ id: string; starts_on: string; ends_on: string; status: string }>
  support_requests: Array<{ id: string; reason: string; requested_scope: string[]; requested_hours: number; status: string; requested_at: string; decided_at: string | null; expires_at: string | null }>
  security_events: Array<{ id: string; event_type: string; target_user_id: string | null; target_device_id: string | null; metadata: Record<string, unknown>; created_at: string }>
}

export type ReconciliationCloseRecord = { id: string; branch_id: string; branch_name: string; cashbox_id: string; cashbox_name: string; business_date: string; status: string; submitted_at: string; approved_at: string | null; variance_reason: string | null; closed_by_current_user: boolean; lines: Array<{ currency_code: string; expected_amount: string; counted_amount: string; variance_amount: string }> }
export type KycProfileRecord = { id: string; organization_id: string; counterparty_id: string; legal_name: string; father_name: string | null; date_of_birth: string | null; nationality: string | null; identity_document_type: string | null; identity_document_expiry: string | null; address: string | null; phone: string | null; occupation_or_business: string | null; purpose_of_funds: string | null; source_of_funds: string | null; risk_level: 'low' | 'medium' | 'high'; review_status: 'pending' | 'approved' | 'review_required'; next_review_at: string | null; updated_at: string }
export type NamedReportRow = { reference: string; date: string; label: string; detail: string; amount: string | number; secondary_amount?: string | number; currency: string; status: string }

export async function postFxTrade(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed: FxTradeCommand = parseFxTradeCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_fx_trade_v5', { command: parsed })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function requestFxTradeApproval(command: unknown): Promise<RpcResult<ApprovalRecord>> {
  const parsed: FxTradeCommand = parseFxTradeCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('request_fx_trade_approval_v5', { command: parsed })
  return { data: result.data as ApprovalRecord | null, error: result.error?.message ?? null }
}

export async function resumeApprovedFxTrade(approvalId: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('resume_approved_fx_trade', { target_approval: approvalId })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function getMyResumableApprovalDraft(approvalId: string): Promise<RpcResult<ResumableApprovalDraft>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('get_my_resumable_approval_draft', { target_approval: approvalId })
  return { data: result.data as ResumableApprovalDraft | null, error: result.error?.message ?? null }
}

export async function getReceiptForJournalEntry(organizationId: string, journalEntryId: string): Promise<RpcResult<ReceiptRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_receipt_for_journal_v6', { target_org: organizationId, target_entry: journalEntryId })
  return { data: result.data as ReceiptRecord | null, error: result.error?.message ?? null }
}

export async function getWorkspaceSettings(organizationId: string): Promise<RpcResult<WorkspaceSettingsRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const [settings, features] = await Promise.all([
    client.from('organization_settings').select('default_language,base_currency_code,negative_cash_allowed,receipt_prefix,timezone,date_display,digit_display,default_cost_basis,approval_threshold_base,offline_limit_base,cashier_profit_hidden,receipt_number_pattern,rate_max_age_minutes,rate_tolerance_bps').eq('organization_id', organizationId).maybeSingle(),
    client.from('organization_features').select('feature_code,enabled').eq('organization_id', organizationId).order('feature_code'),
  ])
  const error = settings.error?.message ?? features.error?.message ?? null
  if (error || !settings.data) return { data: null, error: error ?? 'Organization settings were not found' }
  return { data: { ...settings.data, features: (features.data ?? []) as Array<{ feature_code: string; enabled: boolean }> } as WorkspaceSettingsRecord, error: null }
}

export async function updateWorkspaceSettings(input: { organizationId: string; language: string; timezone: string; receiptPrefix: string; negativeCashAllowed: boolean; dateDisplay?: string; digitDisplay?: string; approvalThresholdBase?: string; offlineLimitBase?: string; cashierProfitHidden?: boolean; rateMaxAgeMinutes?: number; rateToleranceBps?: string }): Promise<RpcResult<WorkspaceSettingsRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('update_organization_control_settings', {
    command: {
      organization_id: input.organizationId,
      default_language: input.language,
      timezone: input.timezone,
      receipt_prefix: input.receiptPrefix,
      negative_cash_allowed: input.negativeCashAllowed,
      date_display: input.dateDisplay ?? 'both',
      digit_display: input.digitDisplay ?? 'western',
      approval_threshold_base: input.approvalThresholdBase ?? '0',
      offline_limit_base: input.offlineLimitBase ?? '0',
      cashier_profit_hidden: input.cashierProfitHidden ?? true,
      rate_max_age_minutes: input.rateMaxAgeMinutes ?? 1440,
      rate_tolerance_bps: input.rateToleranceBps ?? '50',
    },
  })
  return { data: result.data ? { ...result.data, features: [] } as WorkspaceSettingsRecord : null, error: result.error?.message ?? null }
}

export async function listNotifications(organizationId: string): Promise<RpcResult<NotificationRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('notifications').select('id,notification_type,subject_id,message,status,created_at').eq('organization_id', organizationId).neq('status', 'dismissed').order('created_at', { ascending: false }).limit(30)
  return { data: result.data as NotificationRecord[] | null, error: result.error?.message ?? null }
}

export async function markNotificationState(notificationId: string, state: 'read' | 'dismissed'): Promise<RpcResult<NotificationRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('mark_notification_state', { target_notification: notificationId, state_input: state })
  return { data: result.data as NotificationRecord | null, error: result.error?.message ?? null }
}

export async function listNotificationPreferences(organizationId: string): Promise<RpcResult<NotificationPreferenceRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('notification_preferences').select('id,notification_type,in_app,push,threshold_base').eq('organization_id', organizationId).order('notification_type')
  return { data: result.data as NotificationPreferenceRecord[] | null, error: result.error?.message ?? null }
}

export async function setNotificationPreference(input: { organizationId: string; notificationType: string; inApp: boolean; thresholdBase?: string | null }): Promise<RpcResult<NotificationPreferenceRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_notification_preference', {
    target_org: input.organizationId,
    notification_type_input: input.notificationType,
    in_app_input: input.inApp,
    threshold_base_input: input.thresholdBase ?? null,
  })
  return { data: result.data as NotificationPreferenceRecord | null, error: result.error?.message ?? null }
}

export async function getComplianceWorkspace(organizationId: string): Promise<RpcResult<ComplianceWorkspaceRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const [profile, ruleSet, alerts, cases, kycProfiles, providers] = await Promise.all([
    client.from('compliance_profiles').select('profile_name,legal_signoff_status,reviewed_at,reviewed_by').eq('organization_id', organizationId).maybeSingle(),
    client.from('compliance_rule_sets').select('id,version,source_reference,status,effective_from,required_documents,screening_required').eq('organization_id', organizationId).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    client.from('compliance_alerts').select('id,alert_type,status,evidence,disposition_reason,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
    client.from('compliance_cases').select('id,alert_id,report_status,notes,submitted_reference,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
    client.from('kyc_profiles').select('id,organization_id,counterparty_id,legal_name,father_name,date_of_birth,nationality,identity_document_type,identity_document_expiry,address,phone,occupation_or_business,purpose_of_funds,source_of_funds,risk_level,review_status,next_review_at,updated_at').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(100),
    client.from('organization_features').select('feature_code').eq('organization_id', organizationId).eq('enabled', true).like('feature_code', 'sanctions_provider:%').limit(1),
  ])
  const error = profile.error?.message ?? ruleSet.error?.message ?? alerts.error?.message ?? cases.error?.message ?? kycProfiles.error?.message ?? providers.error?.message ?? null
  if (error) return { data: null, error }
  const alertCounts = { open: 0, reviewing: 0, closed: 0 }
  for (const row of alerts.data ?? []) {
    if (row.status === 'open') alertCounts.open += 1
    else if (row.status === 'under_review') alertCounts.reviewing += 1
    else if (row.status === 'cleared' || row.status === 'reported') alertCounts.closed += 1
  }
  const caseCounts = { draft: 0, ready: 0, submitted: 0, closed: 0 }
  for (const row of cases.data ?? []) {
    const status = row.report_status as keyof typeof caseCounts
    if (status in caseCounts) caseCounts[status] += 1
  }
  const providerCode = providers.data?.[0]?.feature_code ?? null
  return {
    data: {
      profile: profile.data,
      ruleSet: ruleSet.data,
      alertCounts,
      caseCounts,
      alerts: (alerts.data ?? []).slice(0, 8),
      cases: (cases.data ?? []).slice(0, 8),
      kycProfiles: (kycProfiles.data ?? []) as KycProfileRecord[],
      screeningProvider: providerCode?.replace('sanctions_provider:', '') ?? null,
    } as ComplianceWorkspaceRecord,
    error: null,
  }
}

export async function getOrganizationControlPlane(organizationId: string): Promise<RpcResult<OrganizationControlPlane>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_organization_control_plane', { target_org: organizationId })
  return { data: result.data as OrganizationControlPlane | null, error: result.error?.message ?? null }
}

export async function updateOrganizationProfile(input: { organizationId: string; displayName: string; legalName: string; licenseNumber?: string; licenseExpiresOn?: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('update_organization_profile', {
    target_org: input.organizationId,
    display_name_input: input.displayName,
    legal_name_input: input.legalName,
    license_number_input: input.licenseNumber || null,
    license_expires_input: input.licenseExpiresOn || null,
  })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function createOrganizationBranch(input: { organizationId: string; name: string; timezone: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_organization_branch', { target_org: input.organizationId, name_input: input.name, timezone_input: input.timezone })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setOrganizationBranchState(branchId: string, active: boolean, reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_branch_state', { target_branch: branchId, active_input: active, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function createOrganizationCashbox(input: { organizationId: string; branchId: string; name: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_organization_cashbox', { target_org: input.organizationId, target_branch: input.branchId, name_input: input.name })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setOrganizationCashboxState(cashboxId: string, active: boolean, reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_cashbox_state', { target_cashbox: cashboxId, active_input: active, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function saveExpenseCategory(organizationId: string, name: string, active = true): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('upsert_expense_category', { target_org: organizationId, name_input: name, active_input: active })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setOrganizationFeatureState(organizationId: string, feature: string, enabled: boolean): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_feature_state', { target_org: organizationId, feature_input: feature, enabled_input: enabled })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function createRateGroup(input: { organizationId: string; name: string; code: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_rate_group', { target_org: input.organizationId, name_input: input.name, code_input: input.code })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setRateGroupExchangeRate(input: { organizationId: string; groupId: string; branchId?: string | null; sourceCurrency: string; targetCurrency: string; buyRate: string; sellRate: string; spreadTolerance?: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_rate_group_exchange_rate', {
    target_org: input.organizationId,
    target_group: input.groupId,
    target_branch: input.branchId ?? null,
    source_currency: input.sourceCurrency,
    target_currency: input.targetCurrency,
    buy_rate_input: input.buyRate,
    sell_rate_input: input.sellRate,
    spread_tolerance_input: input.spreadTolerance || null,
  })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function createValuationRateSet(input: { organizationId: string; name: string; effectiveAt: string; rates: Array<{ currency_code: string; rate: string }> }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_valuation_rate_set', { command: { organization_id: input.organizationId, name: input.name, effective_at: input.effectiveAt, rates: input.rates } })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function decideApproval(approvalId: string, decision: 'approved' | 'rejected', reason: string): Promise<RpcResult<ApprovalRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('decide_approval', { target_id: approvalId, decision, decision_reason_input: reason })
  return { data: result.data as ApprovalRecord | null, error: result.error?.message ?? null }
}

export async function getReconciliationWorkspace(organizationId: string): Promise<RpcResult<{ closes: ReconciliationCloseRecord[] }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_reconciliation_workspace', { target_org: organizationId })
  return { data: result.data as { closes: ReconciliationCloseRecord[] } | null, error: result.error?.message ?? null }
}

export async function rejectCashboxClose(closeId: string, reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('reject_cashbox_close', { target_id: closeId, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function saveKycProfile(command: Record<string, unknown>): Promise<RpcResult<KycProfileRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('upsert_kyc_profile', { command })
  return { data: result.data as KycProfileRecord | null, error: result.error?.message ?? null }
}

export async function decideComplianceAlert(alertId: string, status: 'under_review' | 'cleared' | 'reported', reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('decide_compliance_alert', { target_alert: alertId, status_input: status, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function saveComplianceCase(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('save_compliance_case', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function getNamedFinancialReport(input: { organizationId: string; reportCode: string; fromDate?: string; toDate?: string }): Promise<RpcResult<NamedReportRow[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_named_financial_report', { target_org: input.organizationId, report_code: input.reportCode, from_date: input.fromDate || null, to_date: input.toDate || null })
  return { data: result.data as NamedReportRow[] | null, error: result.error?.message ?? null }
}

export async function createFinancialReportSnapshot(input: { organizationId: string; reportCode: string; fromDate?: string; toDate?: string; currency?: string; status?: string; branchId?: string; cashboxId?: string }): Promise<RpcResult<FinancialReportSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_financial_report_snapshot', { command: {
    organization_id: input.organizationId,
    report_code: input.reportCode,
    from_date: input.fromDate || null,
    to_date: input.toDate || null,
    currency: input.currency || 'All',
    status: input.status || 'All',
    branch_id: input.branchId || null,
    cashbox_id: input.cashboxId || null,
  } })
  return { data: result.data as FinancialReportSnapshot | null, error: result.error?.message ?? null }
}

export async function getOrganizationDataExport(organizationId: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_organization_data_export', { target_org: organizationId })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function decideSupportAccess(requestId: string, decision: 'approved' | 'rejected', reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('decide_support_access', { target_request: requestId, decision_input: decision, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function revokeSupportAccess(requestId: string, reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('revoke_support_access', { target_request: requestId, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function recordOperation(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_operation', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function listCurrencyCatalog(organizationId?: string | null): Promise<RpcResult<CurrencyCatalogRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const currencies = await client.from('currencies').select('code,name_en,name_dari,name_pashto,symbol,minor_unit').eq('active', true).order('code')
  if (currencies.error) return { data: null, error: currencies.error.message }
  let enabled = new Set<string>()
  const displayOrder = new Map<string, number>()
  if (organizationId && organizationId !== 'inspection') {
    const selected = await client.from('organization_currencies').select('currency_code,display_order').eq('organization_id', organizationId).eq('enabled', true)
    if (selected.error) return { data: null, error: selected.error.message }
    enabled = new Set((selected.data ?? []).map((row) => row.currency_code))
    for (const row of selected.data ?? []) displayOrder.set(row.currency_code, row.display_order)
  }
  return {
    data: (currencies.data ?? [])
      .map((row) => ({
        ...row,
        enabled: organizationId === 'inspection' ? ['AFN', 'USD', 'EUR', 'AED', 'PKR'].includes(row.code) : enabled.has(row.code),
        display_order: organizationId === 'inspection'
          ? ({ AFN: 0, USD: 1, EUR: 2, AED: 3, PKR: 4 } as Record<string, number>)[row.code] ?? 999
          : displayOrder.get(row.code) ?? 999,
      }))
      .sort((left, right) => (left.display_order - right.display_order) || left.code.localeCompare(right.code)) as CurrencyCatalogRecord[],
    error: null,
  }
}

export async function setOrganizationCurrency(organizationId: string, currencyCode: string, enabled: boolean): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_currency', { target_org: organizationId, target_currency: currencyCode, enabled_input: enabled })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function setOrganizationRateCurrencies(organizationId: string, currencyCodes: string[]): Promise<RpcResult<{ currencies: string[] }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_rate_currencies', {
    target_org: organizationId,
    target_currencies: currencyCodes,
  })
  return { data: result.data as { currencies: string[] } | null, error: result.error?.message ?? null }
}

export async function listDocumentTemplates(documentKind?: DocumentTemplateRecord['document_kind']): Promise<RpcResult<DocumentTemplateRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  let query = client.from('document_templates').select('template_code,document_kind,title_en,title_dari,title_pashto,body_en,body_dari,body_pashto').eq('active', true)
  if (documentKind) query = query.eq('document_kind', documentKind)
  const result = await query.order('template_code')
  return { data: result.data as DocumentTemplateRecord[] | null, error: result.error?.message ?? null }
}

export async function listMoneyAccounts(organizationId: string): Promise<RpcResult<MoneyAccountRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_money_accounts', { target_org: organizationId })
  return { data: result.data as MoneyAccountRecord[] | null, error: result.error?.message ?? null }
}

export async function getMoneyValuationSnapshot(input: { organizationId: string; businessDate?: string; comparisonCurrency?: string; branchId?: string | null; cashboxId?: string | null }): Promise<RpcResult<MoneyValuationSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_money_valuation_snapshot', {
    target_org: input.organizationId,
    target_business_date: input.businessDate ?? new Date().toISOString().slice(0, 10),
    target_comparison_currency: input.comparisonCurrency ?? 'USD',
    target_scope: {
      ...(input.branchId ? { branch_id: input.branchId } : {}),
      ...(input.cashboxId ? { cashbox_id: input.cashboxId } : {}),
    },
  })
  return { data: result.data as MoneyValuationSnapshot | null, error: result.error?.message ?? null }
}

export async function createMoneyAccount(input: { organizationId: string; name: string; accountType: Exclude<MoneyAccountRecord['account_type'], 'cashbox'>; branchId?: string | null; reference?: string }): Promise<RpcResult<MoneyAccountRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_money_account', {
    target_org: input.organizationId,
    name_input: input.name.trim(),
    account_type_input: input.accountType,
    branch_id_input: input.branchId ?? null,
    reference_input: input.reference?.trim() ?? '',
  })
  return { data: result.data as MoneyAccountRecord | null, error: result.error?.message ?? null }
}

export async function setExchangeRate(input: { organizationId: string; branchId?: string | null; sourceCurrency: string; targetCurrency: string; buyRate: string; sellRate: string }): Promise<RpcResult<RateHistoryRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_exchange_rate', {
    target_org: input.organizationId,
    target_branch: input.branchId ?? null,
    source_currency_input: input.sourceCurrency,
    target_currency_input: input.targetCurrency,
    buy_rate_input: input.buyRate,
    sell_rate_input: input.sellRate,
  })
  return { data: result.data as RateHistoryRecord | null, error: result.error?.message ?? null }
}

export async function commitImport(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('commit_import', { command })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function recordDebt(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed = parseDebtCreateCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_debt', { command: parsed })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function settleDebt(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed = parseDebtSettlementCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('settle_debt', { command: parsed })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function listDebts(organizationId: string): Promise<RpcResult<DebtRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_debts_v5', { target_org: organizationId })
  return { data: result.data as DebtRecord[] | null, error: result.error?.message ?? null }
}

export async function getDebtDetail(organizationId: string, debtId: string): Promise<RpcResult<DebtRecord & { can_settle: boolean; settlements: Array<Record<string, unknown>> }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_debt_detail_v5', { target_org: organizationId, target_debt: debtId })
  return { data: result.data as (DebtRecord & { can_settle: boolean; settlements: Array<Record<string, unknown>> }) | null, error: result.error?.message ?? null }
}

export async function listCounterparties(organizationId: string): Promise<RpcResult<CounterpartyRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('search_counterparties_v7', { target_org: organizationId, search_text: null })
  return { data: result.data as CounterpartyRecord[] | null, error: result.error?.message ?? null }
}

export async function getCounterpartyDetail(organizationId: string, counterpartyId: string): Promise<RpcResult<CounterpartyRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_counterparty_detail_v6', { target_org: organizationId, target_counterparty: counterpartyId })
  return { data: result.data as CounterpartyRecord | null, error: result.error?.message ?? null }
}

export async function createCounterparty(input: {
  organizationId: string
  branchId: string
  displayName: string
  counterpartyType: 'customer' | 'saraf' | 'hawala_partner' | 'supplier' | 'employee' | 'other'
  phone?: string
  notes?: string
}): Promise<RpcResult<CounterpartyRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_counterparty_v6', { command: {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    display_name: input.displayName.trim(),
    counterparty_type: input.counterpartyType,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
  } })
  return { data: result.data as CounterpartyRecord | null, error: result.error?.message ?? null }
}

export async function getMyWorkspaceContext(): Promise<RpcResult<WorkspaceContextRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_my_workspace_context')
  if (result.error) return { data: null, error: result.error.message }
  const contexts = (result.data ?? []) as WorkspaceContextRecord[]
  const contracts = await Promise.all(contexts.map(async (context) => {
    const contract = await client.rpc('get_my_capabilities', { target_org: context.organization_id })
    return { context, contract }
  }))
  const failed = contracts.find(({ contract }) => contract.error)
  if (failed?.contract.error) return { data: null, error: failed.contract.error.message }
  return {
    data: contracts.map(({ context, contract }) => {
      const authority = contract.data as CapabilityContractRecord
      if (!authority.active || authority.membership_id !== context.membership_id) {
        return { ...context, capabilities: [], branches: [], cashboxes: [], capability_contract: authority }
      }
      const branchIds = new Set(authority.branch_ids)
      const cashboxIds = new Set(authority.cashbox_ids)
      return {
        ...context,
        capabilities: authority.capabilities,
        branches: context.branches.filter((branch) => branchIds.has(branch.id)),
        cashboxes: context.cashboxes.filter((cashbox) => cashboxIds.has(cashbox.id)),
        capability_contract: authority,
      }
    }),
    error: null,
  }
}

export async function registerBrowserDevice(input: {
  organizationId: string
  branchId?: string | null
  friendlyName: string
  fingerprintHash: string
}): Promise<RpcResult<LinkedDeviceRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('register_device', {
    target_org: input.organizationId,
    friendly_name_input: input.friendlyName,
    fingerprint_hash_input: input.fingerprintHash,
    app_version_input: 'sarafi-web',
    target_branch: input.branchId ?? null,
  })
  return { data: result.data as LinkedDeviceRecord | null, error: result.error?.message ?? null }
}

export async function trustTeamDevice(deviceId: string, reason: string): Promise<RpcResult<LinkedDeviceRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('trust_device', { target_device: deviceId, reason_input: reason.trim() })
  return { data: result.data as LinkedDeviceRecord | null, error: result.error?.message ?? null }
}

export async function revokeTeamDevice(deviceId: string, reason: string): Promise<RpcResult<LinkedDeviceRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('revoke_device', { target_device: deviceId, reason_input: reason.trim() })
  return { data: result.data as LinkedDeviceRecord | null, error: result.error?.message ?? null }
}

export async function recordHawalaSend(command: unknown): Promise<RpcResult<HawalaTransferRecord>> {
  const parsed = parseHawalaSendCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_hawala_send_v7', { command: parsed })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function listHawalaTransfers(organizationId: string, branchId: string): Promise<RpcResult<HawalaTransferRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('list_hawala_transfers_v7', { target_org: organizationId, target_branch: branchId })
  return { data: result.data as HawalaTransferRecord[] | null, error: result.error?.message ?? null }
}

export async function listHawalaPartners(organizationId: string): Promise<RpcResult<HawalaPartnerRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_hawala_partners', { target_org: organizationId })
  return { data: result.data as HawalaPartnerRecord[] | null, error: result.error?.message ?? null }
}

export async function findHawalaPayout(organizationId: string, referenceCode: string): Promise<RpcResult<HawalaPayoutMatch>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('find_hawala_payout', { target_org: organizationId, reference_code_input: referenceCode.trim().toUpperCase() })
  return { data: result.data as HawalaPayoutMatch | null, error: result.error?.message ?? null }
}

export async function getHawalaPartnerStatement(organizationId: string, partnerId: string): Promise<RpcResult<HawalaPartnerStatement>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_hawala_partner_statement', { target_org: organizationId, target_partner: partnerId })
  return { data: result.data as HawalaPartnerStatement | null, error: result.error?.message ?? null }
}

export async function recordReportExport(command: Record<string, unknown>): Promise<RpcResult<ReportExportRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_report_export', { command })
  return { data: result.data as ReportExportRecord | null, error: result.error?.message ?? null }
}

export async function transitionHawalaStatus(command: Record<string, unknown>): Promise<RpcResult<HawalaTransferRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('transition_hawala_status_v7', { command })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function recordHawalaIncoming(command: unknown): Promise<RpcResult<HawalaTransferRecord>> {
  const parsed = parseHawalaIncomingCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_hawala_incoming_v7', { command: parsed })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function payHawalaBeneficiary(command: unknown): Promise<RpcResult<HawalaTransferRecord>> {
  const input = command as Record<string, unknown>
  const parsed = parseHawalaPayoutCommand({ ...input, app_unlock_grant: getActiveAppUnlockGrant(String(input.organization_id ?? ''), String(input.device_id ?? '')) })
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('pay_hawala_beneficiary', { command: parsed })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function requestHawalaPayoutApproval(command: unknown): Promise<RpcResult<ApprovalRecord>> {
  const parsed = parseHawalaPayoutCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('request_hawala_payout_approval', { command: parsed })
  return { data: result.data as ApprovalRecord | null, error: result.error?.message ?? null }
}

export async function resumeApprovedHawalaPayout(approvalId: string): Promise<RpcResult<HawalaTransferRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('resume_approved_hawala_payout', { target_approval: approvalId })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function settleHawalaPartner(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed = parseHawalaSettlementCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('settle_hawala_partner', { command: parsed })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function listReportExports(organizationId: string): Promise<RpcResult<ReportExportRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('report_exports').select('id,report_name,format,filters,generated_at,expires_at,report_snapshot_id,snapshot_sha256').eq('organization_id', organizationId).order('generated_at', { ascending: false }).limit(20)
  return { data: result.data as ReportExportRecord[] | null, error: result.error?.message ?? null }
}

export async function recordCashboxClose(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_cashbox_close', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function approveCashboxClose(closeId: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('approve_cashbox_close', { target_id: closeId })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function recordOpeningBalance(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_opening_balance', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function requestReversal(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('request_reversal', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function listJournalEntries(organizationId: string): Promise<RpcResult<JournalRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const history = await client.rpc('search_transaction_history_v7', { target_org: organizationId, search_text: null, target_from: null, target_to: null, page_size: 100 })
  return { data: history.data as JournalRecord[] | null, error: history.error?.message ?? null }
}

export async function searchJournalEntries(input: { organizationId: string; search?: string; from?: string | null; to?: string | null; pageSize?: number }): Promise<RpcResult<JournalRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('search_transaction_history_v7', {
    target_org: input.organizationId,
    search_text: input.search?.trim() || null,
    target_from: input.from || null,
    target_to: input.to || null,
    page_size: input.pageSize ?? 250,
  })
  return { data: result.data as JournalRecord[] | null, error: result.error?.message ?? null }
}

export async function getTransactionDetail(organizationId: string, entryId: string): Promise<RpcResult<JournalRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_transaction_detail', { target_org: organizationId, target_entry: entryId })
  return { data: result.data as JournalRecord | null, error: result.error?.message ?? null }
}

export async function listCompleteJournalEntries(organizationId: string): Promise<RpcResult<JournalRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const pageSize = 1000
  const complete: JournalRecord[] = []
  for (let pageOffset = 0; pageOffset <= 1000000; pageOffset += pageSize) {
    const result = await client.rpc('get_transaction_history_page', {
      target_org: organizationId,
      page_size: pageSize,
      page_offset: pageOffset,
    })
    if (result.error) return { data: null, error: result.error.message }
    const page = (result.data ?? []) as JournalRecord[]
    complete.push(...page)
    if (page.length < pageSize) return { data: complete, error: null }
  }
  return { data: null, error: 'Report history is too large to load safely in one export' }
}

export async function listLocationEvidence(organizationId: string): Promise<RpcResult<LocationEvidenceRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_money_location_evidence', { target_org: organizationId })
  return { data: result.data as LocationEvidenceRecord[] | null, error: result.error?.message ?? null }
}

export async function listCashboxBalances(organizationId: string, cashboxId: string): Promise<RpcResult<CashboxBalanceRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_cashbox_balances_v6', { target_org: organizationId, target_cashbox: cashboxId })
  return { data: result.data as CashboxBalanceRecord[] | null, error: result.error?.message ?? null }
}

export async function listCounterpartyStatement(organizationId: string, counterpartyId: string): Promise<RpcResult<CounterpartyStatementRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_counterparty_statement_v6', { target_org: organizationId, target_counterparty: counterpartyId })
  return { data: result.data as CounterpartyStatementRecord[] | null, error: result.error?.message ?? null }
}

export async function getOwnerDashboard(organizationId: string, targetDay?: string): Promise<RpcResult<DashboardSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('get_role_dashboard', { target_org: organizationId, target_day: targetDay })
  return { data: result.data as DashboardSnapshot | null, error: result.error?.message ?? null }
}

export async function getCurrentRates(organizationId: string, branchId?: string, fromCurrency = 'USD', toCurrency = 'AFN'): Promise<RpcResult<{ buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  if (!branchId) return { data: null, error: 'An assigned branch is required' }
  const result = await client.rpc('get_current_rates_v6', { target_org: organizationId, target_branch: branchId, source_currency: fromCurrency, target_currency: toCurrency })
  return { data: result.data as { buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[] | null, error: result.error?.message ?? null }
}

export async function listRateHistory(organizationId: string): Promise<RpcResult<RateHistoryRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('list_rate_history_v6', { target_org: organizationId })
  return { data: result.data as RateHistoryRecord[] | null, error: result.error?.message ?? null }
}

export async function getTeamControlPlane(organizationId: string): Promise<RpcResult<TeamControlPlane>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_team_control_plane', { target_org: organizationId })
  return { data: result.data as TeamControlPlane | null, error: result.error?.message ?? null }
}

export async function getTransactionRateContext(organizationId: string, branchId: string, fromCurrency: string, toCurrency = 'AFN'): Promise<RpcResult<OperationRateContext>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_transaction_rate_context', { target_org: organizationId, target_branch: branchId, source_currency: fromCurrency, target_currency: toCurrency })
  return { data: result.data as OperationRateContext | null, error: result.error?.message ?? null }
}

export async function createTeamInvitation(input: { organizationId: string; email: string; displayName: string; role: string; branchIds: string[]; cashboxIds: string[]; capabilityOverrides?: Array<{ capability: string; allowed: boolean }>; limits?: Record<string, unknown>; requiresMfa?: boolean }): Promise<RpcResult<CreatedTeamInvitation>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  if (input.role === 'business_admin') {
    const adminResult = await client.rpc('create_business_admin_invitation', { target_org: input.organizationId, invited_email: input.email.trim(), invited_name: input.displayName.trim() })
    return { data: adminResult.data as CreatedTeamInvitation | null, error: adminResult.error?.message ?? null }
  }
  const result = await client.rpc('create_team_invitation_v4', { command: {
    organization_id: input.organizationId,
    email: input.email.trim(),
    display_name: input.displayName.trim(),
    role: input.role,
    branch_ids: input.branchIds,
    cashbox_ids: input.cashboxIds,
    capability_overrides: input.capabilityOverrides ?? [],
    limits: input.limits ?? {},
    requires_mfa: input.requiresMfa ?? true,
  } })
  return { data: result.data as CreatedTeamInvitation | null, error: result.error?.message ?? null }
}

export async function acceptTeamInvitation(inviteToken: string): Promise<RpcResult<{ organization_id: string; membership_id: string; display_name: string; role_code: string }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('accept_team_invitation', { invite_token: inviteToken.trim() })
  return { data: result.data as { organization_id: string; membership_id: string; display_name: string; role_code: string } | null, error: result.error?.message ?? null }
}

export async function acceptTeamConnectionCode(connectionCode: string): Promise<RpcResult<{ organization_id: string; membership_id: string; display_name: string; role_code: string }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('accept_team_connection_code', { connection_code: connectionCode.trim() })
  return { data: result.data as { organization_id: string; membership_id: string; display_name: string; role_code: string } | null, error: result.error?.message ?? null }
}

export async function requestBusinessAccess(connectionCode: string, displayName: string): Promise<RpcResult<{ request_id: string; organization_id: string; status: string }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('request_business_access', { connection_code: connectionCode.trim(), requested_name: displayName.trim() })
  return { data: result.data as { request_id: string; organization_id: string; status: string } | null, error: result.error?.message ?? null }
}

export async function listWorkerJoinRequests(organizationId: string): Promise<RpcResult<WorkerJoinRequestRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_worker_join_requests', { target_org: organizationId })
  return { data: result.data as WorkerJoinRequestRecord[] | null, error: result.error?.message ?? null }
}

export async function createOrganizationJoinCode(organizationId: string): Promise<RpcResult<{ id: string; connection_code: string; label: string; expires_at: string | null }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_organization_join_code', { target_org: organizationId, label_input: 'Team access', expires_at_input: null })
  return { data: result.data as { id: string; connection_code: string; label: string; expires_at: string | null } | null, error: result.error?.message ?? null }
}

export async function reviewWorkerJoinRequest(input: { requestId: string; decision: 'approved' | 'rejected'; role?: string; branchIds?: string[]; cashboxIds?: string[]; capabilityOverrides?: Array<{ capability: string; allowed: boolean }>; limits?: Record<string, unknown>; requiresMfa?: boolean; reason: string }): Promise<RpcResult<{ request_id: string; status: string; membership_id: string | null }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('review_worker_join_request', {
    target_request: input.requestId,
    decision_input: input.decision,
    role_input: input.role ?? null,
    branch_scope: input.branchIds ?? [],
    cashbox_scope: input.cashboxIds ?? [],
    capability_overrides_input: input.capabilityOverrides ?? [],
    limits_input: input.limits ?? {},
    requires_mfa: input.requiresMfa ?? true,
    reason_input: input.reason,
  })
  return { data: result.data as { request_id: string; status: string; membership_id: string | null } | null, error: result.error?.message ?? null }
}

export async function getMembershipCapabilityMatrix(organizationId: string): Promise<RpcResult<MembershipCapabilityMatrixRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_membership_capability_matrix', { target_org: organizationId })
  return { data: result.data as MembershipCapabilityMatrixRecord[] | null, error: result.error?.message ?? null }
}

export async function setMembershipCapability(input: { membershipId: string; capability: string; allowed: boolean; branchIds?: string[]; cashboxIds?: string[]; limits?: Record<string, unknown>; reason: string }): Promise<RpcResult<{ membership_id: string; capability: string; allowed: boolean }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_membership_capability', {
    target_membership: input.membershipId,
    capability: input.capability,
    allowed_input: input.allowed,
    branch_scope: input.branchIds ?? [],
    cashbox_scope: input.cashboxIds ?? [],
    limits_input: input.limits ?? {},
    reason_input: input.reason.trim(),
  })
  return { data: result.data as { membership_id: string; capability: string; allowed: boolean } | null, error: result.error?.message ?? null }
}

export async function cancelTeamInvitation(invitationId: string, reason: string): Promise<RpcResult<{ id: string; status: string }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('cancel_team_invitation', { target_invitation: invitationId, reason_input: reason.trim() })
  return { data: result.data as { id: string; status: string } | null, error: result.error?.message ?? null }
}

export async function updateTeamMembership(input: { membershipId: string; role: string; branchIds: string[]; cashboxIds: string[]; active: boolean; reason: string }): Promise<RpcResult<{ id: string; role_code: string; active: boolean }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  if (input.role === 'business_admin') {
    const adminResult = await client.rpc('delegate_business_admin', { target_membership: input.membershipId, active_input: input.active, reason_input: input.reason.trim() })
    return { data: adminResult.data as { id: string; role_code: string; active: boolean } | null, error: adminResult.error?.message ?? null }
  }
  const result = await client.rpc('update_team_membership', {
    target_membership: input.membershipId,
    new_role: input.role,
    branch_scope: input.branchIds,
    cashbox_scope: input.cashboxIds,
    active_input: input.active,
    reason_input: input.reason.trim(),
  })
  return { data: result.data as { id: string; role_code: string; active: boolean } | null, error: result.error?.message ?? null }
}

export async function updateTeamAssignment(input: { membershipId: string; role: string; branchIds: string[]; cashboxIds: string[]; active: boolean; reason: string; capabilityOverrides: Array<{ capability: string; allowed: boolean }>; limits?: Record<string, unknown> }): Promise<RpcResult<{ id: string; role_code: string; active: boolean }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('update_team_assignment_v4', { command: {
    membership_id: input.membershipId,
    role: input.role,
    branch_ids: input.branchIds,
    cashbox_ids: input.cashboxIds,
    active: input.active,
    reason: input.reason.trim(),
    capability_overrides: input.capabilityOverrides,
    limits: input.limits ?? {},
  } })
  return { data: result.data as { id: string; role_code: string; active: boolean } | null, error: result.error?.message ?? null }
}

export async function uploadPrivateCounterpartyDocument(organizationId: string, counterpartyId: string, documentType: DocumentType, file: File): Promise<RpcResult<PrivateDocumentRecord>> {
  const validationError = validateDocumentFile(file)
  if (validationError) return { data: null, error: validationError }
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const documentId = crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${organizationId}/${counterpartyId}/${documentId}-${safeName}`
  const upload = await client.storage.from('sarafi-private-documents').upload(storagePath, file, { contentType: file.type, upsert: false })
  if (upload.error) return { data: null, error: upload.error.message }
  const inserted = await client.from('attachments').insert({ id: documentId, organization_id: organizationId, entity_type: `counterparty:${documentType}`, entity_id: counterpartyId, storage_path: storagePath, content_type: file.type, size_bytes: file.size, sha256, uploaded_by: session.data.session.user.id }).select('id,organization_id,entity_id,entity_type,storage_path,content_type,size_bytes,sha256,uploaded_by,created_at').single()
  if (inserted.error) { await client.storage.from('sarafi-private-documents').remove([storagePath]); return { data: null, error: inserted.error.message } }
  await client.rpc('record_sensitive_document_access', { target_org: organizationId, target_entity: documentId, action: 'upload' })
  return { data: inserted.data as PrivateDocumentRecord, error: null }
}

export async function getPrivateCounterpartyDocuments(organizationId: string, counterpartyId: string): Promise<RpcResult<PrivateDocumentRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('attachments').select('id,organization_id,entity_id,entity_type,storage_path,content_type,size_bytes,sha256,uploaded_by,created_at').eq('organization_id', organizationId).eq('entity_id', counterpartyId).like('entity_type', 'counterparty:%').order('created_at', { ascending: false })
  return { data: result.data as PrivateDocumentRecord[] | null, error: result.error?.message ?? null }
}

export async function getPrivateDocumentUrl(organizationId: string, documentId: string): Promise<RpcResult<string>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.functions.invoke('private-document-url', {
    body: { organization_id: organizationId, document_id: documentId, action: 'view' },
  })
  const signedUrl = (result.data as { signedUrl?: string } | null)?.signedUrl
  if (result.error || !signedUrl) return { data: null, error: result.error?.message ?? 'Document access denied' }
  return { data: signedUrl, error: null }
}

export async function uploadPrivateHawalaIdentityDocument(organizationId: string, transferId: string, side: 'tazkira_front' | 'tazkira_back', file: File): Promise<RpcResult<PrivateDocumentRecord>> {
  const sanitized = await sanitizeIdentityImage(file)
  if (!sanitized.file) return { data: null, error: sanitized.error ?? 'Image could not be processed safely' }
  const safeFile = sanitized.file
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const documentId = crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', await safeFile.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const storagePath = `${organizationId}/${transferId}/${documentId}.jpg`
  const upload = await client.storage.from('sarafi-private-documents').upload(storagePath, safeFile, { contentType: safeFile.type, upsert: false })
  if (upload.error) return { data: null, error: upload.error.message }
  const inserted = await client.from('attachments').insert({ id: documentId, organization_id: organizationId, entity_type: `hawala:${side}`, entity_id: transferId, storage_path: storagePath, content_type: safeFile.type, size_bytes: safeFile.size, sha256, uploaded_by: session.data.session.user.id }).select('id,organization_id,entity_id,entity_type,storage_path,content_type,size_bytes,sha256,uploaded_by,created_at').single()
  if (inserted.error) { await client.storage.from('sarafi-private-documents').remove([storagePath]); return { data: null, error: inserted.error.message } }
  await client.rpc('record_sensitive_document_access', { target_org: organizationId, target_entity: documentId, action: 'upload' })
  return { data: inserted.data as PrivateDocumentRecord, error: null }
}
