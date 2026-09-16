import { describe, expect, it } from 'vitest'
import { getSupabaseClient } from './supabase'

describe('live Supabase unauthenticated security boundary', () => {
  const runLiveProbe = import.meta.env.VITE_RUN_LIVE_TESTS === 'true'

  it.skipIf(!runLiveProbe)('does not expose organizations through the anonymous client', async () => {
    const client = getSupabaseClient()
    expect(client).not.toBeNull()
    const result = await client!.from('organizations').select('id').limit(10)
    // Restricted EXECUTE on the RLS membership helper can reject the query
    // outright. Both explicit denial and an empty RLS result protect the rows;
    // network/schema/other errors must not masquerade as a passing boundary.
    if (result.error) {
      expect(result.error.code).toBe('42501')
      expect(result.error.message).toMatch(/permission denied/)
      expect(result.data).toBeNull()
    } else {
      expect(result.data).toEqual([])
    }
  }, 30000)

  it.skipIf(!runLiveProbe)('rejects unauthenticated financial RPC invocation', async () => {
    const client = getSupabaseClient()
    expect(client).not.toBeNull()
    const result = await client!.rpc('record_fx_trade_v5', { command: { client_command_id: crypto.randomUUID() } })
    expect(result.error?.code).toBe('42501')
    expect(result.error?.message).toMatch(/permission denied for function record_fx_trade_v5/)
    expect(result.data).toBeNull()
  }, 30000)
})
