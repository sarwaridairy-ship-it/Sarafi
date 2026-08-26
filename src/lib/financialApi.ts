import { getSupabaseClient } from './supabase'
import { parseFxTradeCommand, type FxTradeCommand } from '../domain/commands'

export type RpcResult<T> = { data: T | null; error: string | null }
export type DashboardSnapshot = { transaction_count: number; volume_base: string; realized_profit: string; expenses: string; pending_approvals: number; positions: Array<{ currency: string; quantity: string; carrying_base_value: string }>; locations: Array<{ location: string; currency: string; quantity: string }>; activity: Array<{ id: string; reference: string; type: string; occurred_at: string; status: string }> }
export type DebtRecord = { id: string; counterparty_id: string; direction: 'receivable' | 'payable'; currency_code: string; original_amount: string; outstanding_amount: string; due_at: string | null; notes: string | null }
export type CounterpartyRecord = { id: string; display_name: string; counterparty_type: string; risk_status: string }
export type HawalaTransferRecord = { id: string; beneficiary_name: string; origin_location: string; destination_location: string; currency_code: string; amount: string; fee: string; reference_code: string; status: string; created_at: string }
export type JournalRecord = { id: string; status: string; memo: string | null; occurred_at: string; branch_id: string | null; source_type?: string }

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

export async function getOwnerDashboard(organizationId: string): Promise<RpcResult<DashboardSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('get_owner_dashboard', { target_org: organizationId })
  return { data: result.data as DashboardSnapshot | null, error: result.error?.message ?? null }
}
