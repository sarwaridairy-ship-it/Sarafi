import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import Decimal from 'decimal.js'

const url = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.SARAFI_E2E_EMAIL
const password = process.env.SARAFI_E2E_PASSWORD
const organizationId = process.env.SARAFI_E2E_ORGANIZATION_ID
const certificationMode = process.env.STEP15_CERTIFICATION === 'true'
const missingConfiguration = !url || !anonKey || !email || !password || !organizationId

test.describe('authenticated security journeys', () => {
  test.beforeEach(async () => {
    if (certificationMode) expect(missingConfiguration, 'Step 15 certification requires complete live identity configuration').toBe(false)
    else test.skip(missingConfiguration, 'Set Supabase URL, anon key, test credentials, and organization ID to run authenticated journeys')
  })

  test('signs in, checks MFA state, and respects tenant scope', async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const signedIn = await client.auth.signInWithPassword({ email: email!, password: password! })
    expect(signedIn.error).toBeNull()
    expect(signedIn.data.user).not.toBeNull()

    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
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
    const organization = await client.from('organizations').select('display_name').eq('id', organizationId!).single()
    expect(organization.error).toBeNull()
    expect(organization.data?.display_name, 'Writes are limited to the disposable security business').toMatch(/^SECURITY_TEST_/)
    const accounts = await client.rpc('get_money_accounts', { target_org: organizationId! })
    expect(accounts.error).toBeNull()
    const account = (accounts.data as Array<{ id: string; active: boolean; branch_id: string; account_type: string }>).find((item) => item.active && item.branch_id && item.account_type === 'cashbox')
    expect(account).toBeDefined()
    const devices = await client.from('devices').select('id').eq('organization_id', organizationId!).eq('user_id', signedIn.data.user!.id).eq('status', 'trusted').limit(1)
    expect(devices.error).toBeNull()
    expect(devices.data).toHaveLength(1)
    const command = {
      organization_id: organizationId!, branch_id: account!.branch_id,
      destination_money_account_id: account!.id, device_id: devices.data![0].id,
      operation: 'OWNER_INVESTMENT', currency: 'AFN', amount: '0.01',
      client_command_id: `ci-idempotency-${crypto.randomUUID()}`, memo: 'Disposable CI idempotency check',
    }
    const results = await Promise.all([client.rpc('record_operation', { command }), client.rpc('record_operation', { command })])
    for (const result of results) expect(result.error, result.error?.message).toBeNull()
    expect(results[0].data?.id).toBeTruthy()
    expect(results[0].data.id).toBe(results[1].data.id)
    const detail = await client.rpc('get_transaction_detail', { target_org: organizationId!, target_entry: results[0].data.id })
    expect(detail.error).toBeNull()
    expect(detail.data?.id).toBe(results[0].data.id)
    expect(detail.data?.status).toBe('posted')
    expect(new Decimal(detail.data.amount).eq('0.01')).toBe(true)
    expect(detail.data.currency_code).toBe('AFN')
    const receipt = await client.rpc('get_receipt_for_journal_v6', { target_org: organizationId!, target_entry: results[0].data.id })
    expect(receipt.error).toBeNull()
    expect(receipt.data?.journal_entry_id).toBe(results[0].data.id)
    await client.auth.signOut()
  })
})
