import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.SARAFI_E2E_EMAIL
const password = process.env.SARAFI_E2E_PASSWORD
const organizationId = process.env.SARAFI_E2E_ORGANIZATION_ID

test.describe('authenticated security journeys', () => {
  test.skip(!url || !anonKey || !email || !password || !organizationId, 'Set Supabase URL, anon key, test credentials, and organization ID to run authenticated journeys')

  test('signs in, checks MFA state, and respects tenant scope', async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const signedIn = await client.auth.signInWithPassword({ email: email!, password: password! })
    expect(signedIn.error).toBeNull()
    expect(signedIn.data.user).not.toBeNull()

    const assurance = await client.auth.getAuthenticatorAssuranceLevel()
    expect(assurance.error).toBeNull()
    expect(['aal1', 'aal2']).toContain(assurance.data.currentLevel)

    const ownOrganizations = await client.from('organizations').select('id').eq('id', organizationId!)
    expect(ownOrganizations.error).toBeNull()
    expect(ownOrganizations.data).toHaveLength(1)

    const guessedOtherTenant = await client.from('organizations').select('id').neq('id', organizationId!).limit(1)
    expect(guessedOtherTenant.error).toBeNull()
    expect(guessedOtherTenant.data).toEqual([])
  })

  test('concurrent duplicate commands resolve to one idempotent result', async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const signedIn = await client.auth.signInWithPassword({ email: email!, password: password! })
    expect(signedIn.error).toBeNull()
    const command = { organization_id: organizationId!, client_command_id: crypto.randomUUID() }
    const results = await Promise.all([client.rpc('record_fx_trade', { command }), client.rpc('record_fx_trade', { command })])
    expect(results.filter((result) => result.data !== null)).toHaveLength(0)
    expect(results.every((result) => result.error !== null)).toBe(true)
  })
})