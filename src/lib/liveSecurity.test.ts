import { describe, expect, it } from 'vitest'
import { getSupabaseClient } from './supabase'

describe('live Supabase unauthenticated security boundary', () => {
  it('does not expose organizations through the anonymous client', async () => {
    const client = getSupabaseClient()
    expect(client).not.toBeNull()
    const result = await client!.from('organizations').select('id').limit(10)
    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  }, 15000)

  it('rejects unauthenticated financial RPC invocation', async () => {
    const client = getSupabaseClient()
    expect(client).not.toBeNull()
    const result = await client!.rpc('record_fx_trade', { command: { client_command_id: crypto.randomUUID() } })
    expect(result.error).not.toBeNull()
    expect(result.data).toBeNull()
  }, 15000)
})
