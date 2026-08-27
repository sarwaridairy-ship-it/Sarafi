import { getSupabaseClient } from './supabase'
import { parseFxTradeCommand, type FxTradeCommand } from '../domain/commands'
import { validateDocumentFile, type DocumentType } from './integrations'

export type RpcResult<T> = { data: T | null; error: string | null }
export type DashboardSnapshot = { transaction_count: number; buy_count: number; sell_count: number; exchange_count: number; volume_base: string; realized_profit: string; commission_income: string; expenses: string; net_result: string; net_position_base: string; reconciliation_differences: string; pending_approvals: number; fresh_at: string; positions: Array<{ currency: string; quantity: string; carrying_base_value: string }>; locations: Array<{ location: string; currency: string; quantity: string }>; activity: Array<{ id: string; reference: string; type: string; occurred_at: string; status: string }> }
export type DebtRecord = { id: string; counterparty_id: string; direction: 'receivable' | 'payable'; currency_code: string; original_amount: string; outstanding_amount: string; due_at: string | null; notes: string | null }
export type CounterpartyRecord = { id: string; display_name: string; counterparty_type: string; risk_status: string }
export type HawalaTransferRecord = { id: string; beneficiary_name: string; origin_location: string; destination_location: string; currency_code: string; amount: string; fee: string; reference_code: string; status: string; created_at: string }
export type JournalRecord = { id: string; status: string; memo: string | null; occurred_at: string; branch_id: string | null; source_type?: string }
export type LocationEvidenceRecord = { id: string; journal_entry_id: string; currency_code: string; native_debit: string; native_credit: string; occurred_at: string; memo: string | null; account_code: string; account_name: string }
export type CashboxBalanceRecord = { currency_code: string; expected_amount: string }
export type CounterpartyStatementRecord = { id: string; occurred_at: string; event_type: string; reference: string; status: string; memo: string | null; direction: 'receivable' | 'payable' | null; currency_code: string | null; amount: string | null }
export type RateHistoryRecord = { id: string; from_currency: string; to_currency: string; buy_rate: string; sell_rate: string; effective_from: string; group_name: string; branch_id: string | null }
export type TeamMemberRecord = { id: string; user_id: string; role_code: string; active: boolean; mfa_required: boolean }
export type DeviceRecord = { id: string; user_id: string; friendly_name: string; status: string; last_seen_at: string; revoked_at: string | null }
export type ApprovalRecord = { id: string; action_type: string; reason: string; amount_base: string | null; currency_code: string | null; status: string; requested_at: string; requested_by: string; decided_by: string | null }
export type PrivateDocumentRecord = { id: string; organization_id: string; entity_id: string; entity_type: string; storage_path: string; content_type: string; size_bytes: number; sha256: string; uploaded_by: string; created_at: string }

export async function postFxTrade(command: unknown): Promise<RpcResult<Record<string, unknown>>> {
  const parsed: FxTradeCommand = parseFxTradeCommand(command)
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_fx_trade', { command: parsed })
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

export async function recordReportExport(command: Record<string, unknown>): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('record_report_export', { command })
  return { data: result.data, error: result.error?.message ?? null }
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
  const result = await client.from('journal_entries').select('id,status,memo,occurred_at,branch_id').eq('organization_id', organizationId).order('occurred_at', { ascending: false }).limit(100)
  return { data: result.data as JournalRecord[] | null, error: result.error?.message ?? null }
}

export async function listLocationEvidence(organizationId: string): Promise<RpcResult<LocationEvidenceRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('journal_lines').select('id,journal_entry_id,currency_code,native_debit,native_credit,journal_entries!inner(occurred_at,memo,status,organization_id),ledger_accounts!inner(code,name,category)').eq('organization_id', organizationId).eq('journal_entries.organization_id', organizationId).eq('journal_entries.status', 'posted').eq('ledger_accounts.category', 'asset').order('id', { ascending: false }).limit(500)
  const rows = (result.data ?? []).map((row) => {
    const entry = Array.isArray(row.journal_entries) ? row.journal_entries[0] : row.journal_entries
    const account = Array.isArray(row.ledger_accounts) ? row.ledger_accounts[0] : row.ledger_accounts
    return { id: row.id, journal_entry_id: row.journal_entry_id, currency_code: row.currency_code, native_debit: row.native_debit, native_credit: row.native_credit, occurred_at: entry?.occurred_at ?? '', memo: entry?.memo ?? null, account_code: account?.code ?? '', account_name: account?.name ?? '' }
  }) as LocationEvidenceRecord[]
  return { data: rows, error: result.error?.message ?? null }
}

export async function listCashboxBalances(organizationId: string, cashboxId: string): Promise<RpcResult<CashboxBalanceRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('journal_lines').select('currency_code,native_debit,native_credit,ledger_accounts!inner(cashbox_id)').eq('organization_id', organizationId).eq('ledger_accounts.cashbox_id', cashboxId)
  const balances = new Map<string, number>()
  for (const row of result.data ?? []) balances.set(row.currency_code, (balances.get(row.currency_code) ?? 0) + Number(row.native_debit) - Number(row.native_credit))
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

export async function getCurrentRates(organizationId: string, branchId?: string): Promise<RpcResult<{ buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('rate_board_entries').select('buy_rate,sell_rate,from_currency,to_currency').eq('organization_id', organizationId).eq('from_currency', 'USD').eq('to_currency', 'AFN').eq('active', true).or(`branch_id.is.null,branch_id.eq.${branchId ?? '00000000-0000-0000-0000-000000000000'}`).order('effective_from', { ascending: false }).limit(1)
  return { data: result.data as { buy_rate: string; sell_rate: string; from_currency: string; to_currency: string }[] | null, error: result.error?.message ?? null }
}

export async function listRateHistory(organizationId: string): Promise<RpcResult<RateHistoryRecord[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.from('rate_board_entries').select('id,from_currency,to_currency,buy_rate,sell_rate,effective_from,branch_id,rate_groups!inner(name)').eq('organization_id', organizationId).order('effective_from', { ascending: false }).limit(100)
  const rows = (result.data ?? []).map((row) => { const group = Array.isArray(row.rate_groups) ? row.rate_groups[0] : row.rate_groups; return { id: row.id, from_currency: row.from_currency, to_currency: row.to_currency, buy_rate: row.buy_rate, sell_rate: row.sell_rate, effective_from: row.effective_from, group_name: group?.name ?? 'Rate group', branch_id: row.branch_id } }) as RateHistoryRecord[]
  return { data: rows, error: result.error?.message ?? null }
}

export async function getTeamControlPlane(organizationId: string): Promise<RpcResult<{ members: TeamMemberRecord[]; devices: DeviceRecord[]; approvals: ApprovalRecord[] }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const [members, devices, approvals] = await Promise.all([
    client.from('organization_memberships').select('id,user_id,role_code,active,mfa_required').eq('organization_id', organizationId).order('created_at'),
    client.from('devices').select('id,user_id,friendly_name,status,last_seen_at,revoked_at').eq('organization_id', organizationId).order('last_seen_at', { ascending: false }),
    client.from('approval_requests').select('id,action_type,reason,amount_base,currency_code,status,requested_at,requested_by,decided_by').eq('organization_id', organizationId).order('requested_at', { ascending: false }).limit(100),
  ])
  const error = members.error?.message ?? devices.error?.message ?? approvals.error?.message ?? null
  return { data: { members: (members.data ?? []) as TeamMemberRecord[], devices: (devices.data ?? []) as DeviceRecord[], approvals: (approvals.data ?? []) as ApprovalRecord[] }, error }
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
