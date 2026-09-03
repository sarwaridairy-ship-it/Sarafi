import { getSupabaseClient } from './supabase'
import Decimal from 'decimal.js'
import { parseFxTradeCommand, type FxTradeCommand } from '../domain/commands'
import { validateDocumentFile, type DocumentType } from './integrations'

export type RpcResult<T> = { data: T | null; error: string | null }
export type DashboardSnapshot = { transaction_count: number; buy_count: number; sell_count: number; exchange_count: number; volume_base: string; realized_profit: string; commission_income: string; expenses: string; net_result: string; net_position_base: string; reconciliation_differences: string; pending_approvals: number; fresh_at: string; positions: Array<{ currency: string; quantity: string; carrying_base_value: string }>; locations: Array<{ location_id: string; location_type: 'cashbox' | 'bank' | 'location' | 'account'; location_name: string; currency: string; quantity: string }>; receivables: Array<{ currency: string; amount: string }>; payables: Array<{ currency: string; amount: string }>; activity: Array<{ id: string; reference: string; type: string; occurred_at: string; status: string }> }
export type DebtRecord = { id: string; counterparty_id: string; direction: 'receivable' | 'payable'; currency_code: string; original_amount: string; outstanding_amount: string; due_at: string | null; notes: string | null }
export type CounterpartyRecord = { id: string; display_name: string; counterparty_type: string; risk_status: string; phone?: string | null; notes?: string | null }
export type HawalaTransferRecord = { id: string; beneficiary_name: string; origin_location: string; destination_location: string; currency_code: string; amount: string; fee: string; reference_code: string; status: string; created_at: string }
export type JournalRecord = { id: string; status: string; memo: string | null; occurred_at: string; branch_id: string | null; source_type?: string; event_type?: string; immutable_reference?: string; source_account_name?: string | null; destination_account_name?: string | null; source_account_kind?: string | null; destination_account_kind?: string | null; legacy_location_name?: string | null; legacy_from_name?: string | null; legacy_to_name?: string | null; cashbox_name?: string | null; currency_code?: string | null; amount?: string | null; counterparty_name?: string | null; employee_name?: string | null; given_amount?: string | null; given_currency?: string | null; received_amount?: string | null; received_currency?: string | null }
export type LocationEvidenceRecord = { id: string; journal_entry_id: string; currency_code: string; native_debit: string; native_credit: string; occurred_at: string; memo: string | null; location_id: string; location_type: 'cashbox' | 'bank' | 'location' | 'account'; location_name: string }
export type CashboxBalanceRecord = { currency_code: string; expected_amount: string }
export type CounterpartyStatementRecord = { id: string; occurred_at: string; event_type: string; reference: string; status: string; memo: string | null; direction: 'receivable' | 'payable' | null; currency_code: string | null; amount: string | null }
export type RateHistoryRecord = { id: string; from_currency: string; to_currency: string; buy_rate: string; sell_rate: string; effective_from: string; group_name: string; branch_id: string | null }
export type CurrencyCatalogRecord = { code: string; name_en: string; name_dari: string; name_pashto: string; symbol: string; minor_unit: number; enabled: boolean }
export type MoneyAccountRecord = { id: string; name: string; account_type: 'cashbox' | 'safe' | 'bank' | 'mobile_money' | 'partner' | 'other'; branch_id: string | null; cashbox_id: string | null; reference_label: string | null; active: boolean; balances: Array<{ currency: string; amount: string }> }
export type TeamScopeRecord = { id: string; name: string; branch_id?: string }
export type TeamMemberRecord = { id: string; display_name: string; email: string; role_code: string; active: boolean; mfa_required: boolean; joined_at: string; is_current_user: boolean; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[] }
export type TeamInvitationRecord = { id: string; display_name: string; email: string; role_code: string; mfa_required: boolean; status: string; created_at: string; expires_at: string; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[] }
export type DeviceRecord = { id: string; friendly_name: string; status: string; last_seen_at: string; revoked_at: string | null; member_name: string }
export type LinkedDeviceRecord = { id: string; friendly_name: string; status: 'trusted' | 'untrusted' | 'revoked'; last_seen_at: string; revoked_at: string | null }
export type WorkspaceContextRecord = {
  membership_id: string
  organization_id: string
  organization_name: string
  role_code: string
  mfa_required: boolean
  branches: Array<{ id: string; name: string }>
  cashboxes: Array<{ id: string; name: string; branch_id: string }>
  subscription: { status?: string; period_end?: string | null; plan_code?: string }
}
export type ApprovalRecord = { id: string; action_type: string; reason: string; amount_base: string | null; currency_code: string | null; status: string; requested_at: string; requested_by_name: string; decided_by_name: string | null }
export type TeamControlPlane = { members: TeamMemberRecord[]; invitations: TeamInvitationRecord[]; branches: TeamScopeRecord[]; cashboxes: TeamScopeRecord[]; devices: DeviceRecord[]; approvals: ApprovalRecord[] }
export type CreatedTeamInvitation = { id: string; invite_token: string; email: string; display_name: string; role_code: string; expires_at: string }
export type PrivateDocumentRecord = { id: string; organization_id: string; entity_id: string; entity_type: string; storage_path: string; content_type: string; size_bytes: number; sha256: string; uploaded_by: string; created_at: string }
export type ReceiptRecord = { id: string; journal_entry_id: string; receipt_number: string; language_code: string; created_at: string }
export type WorkspaceSettingsRecord = { default_language: string; base_currency_code: string; negative_cash_allowed: boolean; receipt_prefix: string; timezone: string; features: Array<{ feature_code: string; enabled: boolean }> }
export type NotificationRecord = { id: string; notification_type: string; subject_id: string; message: string; status: 'unread' | 'read' | 'dismissed'; created_at: string }
export type NotificationPreferenceRecord = { id: string; notification_type: string; in_app: boolean; push: boolean; threshold_base: string | null }
export type ReportExportRecord = { id: string; report_name: string; format: 'csv' | 'pdf' | 'xlsx' | 'print'; filters: Record<string, unknown>; generated_at: string; expires_at: string | null }
export type ComplianceWorkspaceRecord = {
  profile: { profile_name: string; legal_signoff_status: string; reviewed_at: string | null; reviewed_by: string | null } | null
  ruleSet: { id: string; version: string; source_reference: string | null; status: string; effective_from: string; required_documents: string[]; screening_required: boolean } | null
  alertCounts: { open: number; reviewing: number; closed: number }
  caseCounts: { draft: number; ready: number; submitted: number; closed: number }
  alerts: Array<{ id: string; alert_type: string; status: string; created_at: string }>
  cases: Array<{ id: string; alert_id: string; report_status: string; submitted_reference: string | null; created_at: string }>
  screeningProvider: string | null
}

export async function postFxTrade(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed: FxTradeCommand = parseFxTradeCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_fx_trade', { command: parsed })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function getReceiptForJournalEntry(organizationId: string, journalEntryId: string): Promise<RpcResult<ReceiptRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('receipts').select('id,journal_entry_id,receipt_number,language_code,created_at').eq('organization_id', organizationId).eq('journal_entry_id', journalEntryId).maybeSingle()
  return { data: result.data as ReceiptRecord | null, error: result.error?.message ?? null }
}

export async function getWorkspaceSettings(organizationId: string): Promise<RpcResult<WorkspaceSettingsRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const [settings, features] = await Promise.all([
    client.from('organization_settings').select('default_language,base_currency_code,negative_cash_allowed,receipt_prefix,timezone').eq('organization_id', organizationId).maybeSingle(),
    client.from('organization_features').select('feature_code,enabled').eq('organization_id', organizationId).order('feature_code'),
  ])
  const error = settings.error?.message ?? features.error?.message ?? null
  if (error || !settings.data) return { data: null, error: error ?? 'Organization settings were not found' }
  return { data: { ...settings.data, features: (features.data ?? []) as Array<{ feature_code: string; enabled: boolean }> } as WorkspaceSettingsRecord, error: null }
}

export async function updateWorkspaceSettings(input: { organizationId: string; language: string; timezone: string; receiptPrefix: string; negativeCashAllowed: boolean }): Promise<RpcResult<WorkspaceSettingsRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('update_organization_settings', {
    target_org: input.organizationId,
    language_input: input.language,
    timezone_input: input.timezone,
    receipt_prefix_input: input.receiptPrefix,
    negative_cash_input: input.negativeCashAllowed,
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
  const [profile, ruleSet, alerts, cases, providers] = await Promise.all([
    client.from('compliance_profiles').select('profile_name,legal_signoff_status,reviewed_at,reviewed_by').eq('organization_id', organizationId).maybeSingle(),
    client.from('compliance_rule_sets').select('id,version,source_reference,status,effective_from,required_documents,screening_required').eq('organization_id', organizationId).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    client.from('compliance_alerts').select('id,alert_type,status,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
    client.from('compliance_cases').select('id,alert_id,report_status,submitted_reference,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
    client.from('organization_features').select('feature_code').eq('organization_id', organizationId).eq('enabled', true).like('feature_code', 'sanctions_provider:%').limit(1),
  ])
  const error = profile.error?.message ?? ruleSet.error?.message ?? alerts.error?.message ?? cases.error?.message ?? providers.error?.message ?? null
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
      screeningProvider: providerCode?.replace('sanctions_provider:', '') ?? null,
    } as ComplianceWorkspaceRecord,
    error: null,
  }
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
  if (organizationId && organizationId !== 'inspection') {
    const selected = await client.from('organization_currencies').select('currency_code').eq('organization_id', organizationId).eq('enabled', true)
    if (selected.error) return { data: null, error: selected.error.message }
    enabled = new Set((selected.data ?? []).map((row) => row.currency_code))
  }
  return {
    data: (currencies.data ?? []).map((row) => ({ ...row, enabled: organizationId === 'inspection' ? ['AFN', 'USD', 'EUR', 'AED', 'PKR'].includes(row.code) : enabled.has(row.code) })) as CurrencyCatalogRecord[],
    error: null,
  }
}

export async function setOrganizationCurrency(organizationId: string, currencyCode: string, enabled: boolean): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_currency', { target_org: organizationId, target_currency: currencyCode, enabled_input: enabled })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}

export async function listMoneyAccounts(organizationId: string): Promise<RpcResult<MoneyAccountRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_money_accounts', { target_org: organizationId })
  return { data: result.data as MoneyAccountRecord[] | null, error: result.error?.message ?? null }
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

export async function recordDebt(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_debt', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function settleDebt(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('settle_debt', { command })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function listDebts(organizationId: string): Promise<RpcResult<DebtRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('debts').select('id,counterparty_id,direction,currency_code,original_amount,outstanding_amount,due_at,notes').eq('organization_id', organizationId).gt('outstanding_amount', 0).order('created_at', { ascending: false })
  return { data: result.data as DebtRecord[] | null, error: result.error?.message ?? null }
}

export async function listCounterparties(organizationId: string): Promise<RpcResult<CounterpartyRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('counterparties').select('id,display_name,counterparty_type,risk_status').eq('organization_id', organizationId).neq('risk_status', 'blocked').order('display_name')
  return { data: result.data as CounterpartyRecord[] | null, error: result.error?.message ?? null }
}

export async function createCounterparty(input: {
  organizationId: string
  displayName: string
  counterpartyType: 'customer' | 'saraf' | 'hawala_partner' | 'supplier' | 'employee' | 'other'
  phone?: string
  notes?: string
}): Promise<RpcResult<CounterpartyRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_counterparty', {
    target_org: input.organizationId,
    display_name_input: input.displayName.trim(),
    counterparty_type_input: input.counterpartyType,
    phone_input: input.phone?.trim() || null,
    notes_input: input.notes?.trim() || null,
  })
  return { data: result.data as CounterpartyRecord | null, error: result.error?.message ?? null }
}

export async function getMyWorkspaceContext(): Promise<RpcResult<WorkspaceContextRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_my_workspace_context')
  return { data: result.data as WorkspaceContextRecord[] | null, error: result.error?.message ?? null }
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

export async function recordHawalaSend(command: Record<string, unknown>): Promise<RpcResult<HawalaTransferRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_hawala_send', { command })
  return { data: result.data as HawalaTransferRecord | null, error: result.error?.message ?? null }
}

export async function listHawalaTransfers(organizationId: string): Promise<RpcResult<HawalaTransferRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('hawala_transfers').select('id,beneficiary_name,origin_location,destination_location,currency_code,amount,fee,reference_code,status,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false })
  return { data: result.data as HawalaTransferRecord[] | null, error: result.error?.message ?? null }
}

export async function recordReportExport(command: Record<string, unknown>): Promise<RpcResult<ReportExportRecord>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_report_export', { command })
  return { data: result.data as ReportExportRecord | null, error: result.error?.message ?? null }
}

export async function listReportExports(organizationId: string): Promise<RpcResult<ReportExportRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('report_exports').select('id,report_name,format,filters,generated_at,expires_at').eq('organization_id', organizationId).order('generated_at', { ascending: false }).limit(20)
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
  const history = await client.rpc('get_transaction_history', { target_org: organizationId, page_size: 50 })
  if (!history.error) return { data: history.data as JournalRecord[] | null, error: null }
  const [result, cashboxes] = await Promise.all([
    client.from('journal_entries').select('id,status,memo,occurred_at,branch_id,financial_events!inner(event_type,immutable_reference,metadata)').eq('organization_id', organizationId).order('occurred_at', { ascending: false }).limit(100),
    client.from('cashboxes').select('id,name').eq('organization_id', organizationId),
  ])
  const cashboxNames = new Map((cashboxes.data ?? []).map((cashbox) => [cashbox.id, cashbox.name]))
  const rows = (result.data ?? []).map((row) => {
    const event = Array.isArray(row.financial_events) ? row.financial_events[0] : row.financial_events
    return {
      id: row.id,
      status: row.status,
      memo: row.memo,
      occurred_at: row.occurred_at,
      branch_id: row.branch_id,
      event_type: event?.event_type,
      immutable_reference: event?.immutable_reference,
      source_account_name: event?.metadata?.source_account_name ?? null,
      destination_account_name: event?.metadata?.destination_account_name ?? null,
      source_account_kind: event?.metadata?.source_account_kind ?? null,
      destination_account_kind: event?.metadata?.destination_account_kind ?? null,
      legacy_location_name: event?.metadata?.location ?? event?.metadata?.origin_location ?? null,
      legacy_from_name: event?.metadata?.from_location ?? null,
      legacy_to_name: event?.metadata?.to_location ?? null,
      cashbox_name: cashboxNames.get(event?.metadata?.cashbox_id) ?? null,
      currency_code: event?.metadata?.currency ?? event?.metadata?.sold_currency ?? null,
      amount: event?.metadata?.amount ?? event?.metadata?.sold_amount ?? null,
    }
  }) as JournalRecord[]
  return { data: rows, error: result.error?.message ?? cashboxes.error?.message ?? null }
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
  const result = await client.from('journal_lines').select('currency_code,native_debit,native_credit,ledger_accounts!inner(cashbox_id),journal_entries!inner(status)').eq('organization_id', organizationId).eq('ledger_accounts.cashbox_id', cashboxId).eq('journal_entries.status', 'posted')
  const balances = new Map<string, Decimal>()
  for (const row of result.data ?? []) balances.set(row.currency_code, (balances.get(row.currency_code) ?? new Decimal(0)).plus(row.native_debit).minus(row.native_credit))
  return { data: Array.from(balances, ([currency_code, expected_amount]) => ({ currency_code, expected_amount: expected_amount.toFixed(12) })), error: result.error?.message ?? null }
}

export async function listCounterpartyStatement(organizationId: string, counterpartyId: string): Promise<RpcResult<CounterpartyStatementRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const [events, debts, settlements] = await Promise.all([
    client.from('financial_events').select('id,occurred_at,event_type,immutable_reference,metadata,journal_entries!inner(status,memo,organization_id)').eq('organization_id', organizationId).eq('journal_entries.organization_id', organizationId).eq('metadata->>counterparty_id', counterpartyId),
    client.from('debts').select('id,created_at,direction,currency_code,original_amount,originating_entry_id,notes').eq('organization_id', organizationId).eq('counterparty_id', counterpartyId),
    client.from('settlements').select('id,created_at,direction,currency_code,amount,journal_entry_id').eq('organization_id', organizationId).eq('counterparty_id', counterpartyId),
  ])
  const rows: CounterpartyStatementRecord[] = []
  for (const row of events.data ?? []) {
    const entry = Array.isArray(row.journal_entries) ? row.journal_entries[0] : row.journal_entries
    rows.push({ id: row.id, occurred_at: row.occurred_at, event_type: row.event_type, reference: row.immutable_reference, status: entry?.status ?? 'posted', memo: entry?.memo ?? null, direction: row.metadata?.direction === 'receivable' || row.metadata?.direction === 'payable' ? row.metadata.direction : null, currency_code: row.metadata?.currency ?? null, amount: row.metadata?.amount ?? null })
  }
  for (const row of debts.data ?? []) rows.push({ id: row.id, occurred_at: row.created_at, event_type: 'debt_created', reference: row.originating_entry_id ?? row.id, status: 'posted', memo: row.notes, direction: row.direction, currency_code: row.currency_code, amount: row.original_amount })
  for (const row of settlements.data ?? []) rows.push({ id: row.id, occurred_at: row.created_at, event_type: 'settlement', reference: row.journal_entry_id ?? row.id, status: 'posted', memo: null, direction: row.direction, currency_code: row.currency_code, amount: row.amount })
  rows.sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
  return { data: rows, error: events.error?.message ?? debts.error?.message ?? settlements.error?.message ?? null }
}

export async function getOwnerDashboard(organizationId: string, targetDay?: string): Promise<RpcResult<DashboardSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('get_owner_dashboard', { target_org: organizationId, target_day: targetDay })
  return { data: result.data as DashboardSnapshot | null, error: result.error?.message ?? null }
}

export async function getCurrentRates(organizationId: string, branchId?: string, fromCurrency = 'USD', toCurrency = 'AFN'): Promise<RpcResult<{ buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('rate_board_entries').select('buy_rate,sell_rate,from_currency,to_currency,branch_id').eq('organization_id', organizationId).eq('from_currency', fromCurrency).eq('to_currency', toCurrency).eq('active', true).or(`branch_id.is.null,branch_id.eq.${branchId ?? '00000000-0000-0000-0000-000000000000'}`).order('branch_id', { ascending: false, nullsFirst: false }).order('effective_from', { ascending: false }).limit(1)
  return { data: result.data as { buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[] | null, error: result.error?.message ?? null }
}

export async function listRateHistory(organizationId: string): Promise<RpcResult<RateHistoryRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('rate_board_entries').select('id,from_currency,to_currency,buy_rate,sell_rate,effective_from,branch_id,rate_groups!inner(name)').eq('organization_id', organizationId).order('effective_from', { ascending: false }).limit(100)
  const rows = (result.data ?? []).map((row) => { const group = Array.isArray(row.rate_groups) ? row.rate_groups[0] : row.rate_groups; return { id: row.id, from_currency: row.from_currency, to_currency: row.to_currency, buy_rate: row.buy_rate, sell_rate: row.sell_rate, effective_from: row.effective_from, group_name: group?.name ?? 'Rate group', branch_id: row.branch_id } }) as RateHistoryRecord[]
  return { data: rows, error: result.error?.message ?? null }
}

export async function getTeamControlPlane(organizationId: string): Promise<RpcResult<TeamControlPlane>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_team_control_plane', { target_org: organizationId })
  return { data: result.data as TeamControlPlane | null, error: result.error?.message ?? null }
}

export async function createTeamInvitation(input: { organizationId: string; email: string; displayName: string; role: string; branchIds: string[]; cashboxIds: string[] }): Promise<RpcResult<CreatedTeamInvitation>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_team_invitation', {
    target_org: input.organizationId,
    invited_email: input.email.trim(),
    invited_name: input.displayName.trim(),
    invited_role: input.role,
    branch_scope: input.branchIds,
    cashbox_scope: input.cashboxIds,
    requires_mfa: false,
  })
  return { data: result.data as CreatedTeamInvitation | null, error: result.error?.message ?? null }
}

export async function acceptTeamInvitation(inviteToken: string): Promise<RpcResult<{ organization_id: string; membership_id: string; display_name: string; role_code: string }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('accept_team_invitation', { invite_token: inviteToken.trim() })
  return { data: result.data as { organization_id: string; membership_id: string; display_name: string; role_code: string } | null, error: result.error?.message ?? null }
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
  const document = await client.from('attachments').select('id,storage_path').eq('organization_id', organizationId).eq('id', documentId).maybeSingle()
  if (document.error || !document.data) return { data: null, error: document.error?.message ?? 'Document not found' }
  const signed = await client.storage.from('sarafi-private-documents').createSignedUrl(document.data.storage_path, 300)
  if (signed.error || !signed.data?.signedUrl) return { data: null, error: signed.error?.message ?? 'Document access denied' }
  const audit = await client.rpc('record_sensitive_document_access', { target_org: organizationId, target_entity: documentId, action: 'view' })
  return audit.error ? { data: null, error: audit.error.message } : { data: signed.data.signedUrl, error: null }
}
