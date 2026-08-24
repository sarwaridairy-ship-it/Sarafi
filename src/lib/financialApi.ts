import { getSupabaseClient } from './supabase'
import { parseFxTradeCommand, type FxTradeCommand } from '../domain/commands'

export type RpcResult<T> = { data: T | null; error: string | null }
export type DashboardSnapshot = { transaction_count: number; volume_base: string; realized_profit: string; expenses: string; pending_approvals: number; positions: Array<{ currency: string; quantity: string; carrying_base_value: string }>; locations: Array<{ location: string; currency: string; quantity: string }>; activity: Array<{ id: string; reference: string; type: string; occurred_at: string; status: string }> }

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

export async function getOwnerDashboard(organizationId: string): Promise<RpcResult<DashboardSnapshot>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const session = await client.auth.getSession()
  if (!session.data.session) return { data: null, error: 'Authentication required' }
  const result = await client.rpc('get_owner_dashboard', { target_org: organizationId })
  return { data: result.data as DashboardSnapshot | null, error: result.error?.message ?? null }
}
