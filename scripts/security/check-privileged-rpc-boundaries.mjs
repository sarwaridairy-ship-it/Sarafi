// Read-only probes with disposable fixture identities. Never posts money or changes access.
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { readEnvFile } from './mfa-fixture.mjs'

const env = readEnvFile(process.env.SARAFI_SECURITY_ENV ?? '.env.security.local')
if (env.SUPABASE_URL !== 'https://vbvwuqzqtcorassvotke.supabase.co' || !env.SUPABASE_ANON_KEY || !env.BUSINESS_A_ID || !env.BUSINESS_B_ID || env.BUSINESS_A_ID === env.BUSINESS_B_ID) {
  throw new Error('Expected separate SARAFI security businesses and scoped project configuration')
}
const makeClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
})
const helpers = [
  ['require_aal2', {}],
  ['require_active_device', { target_org: env.BUSINESS_A_ID, target_device: randomUUID() }],
  ['require_capability', { target_org: env.BUSINESS_A_ID, capability: 'workspace.view', optional_scope: {} }],
  ['require_sanctions_provider', { target_org: env.BUSINESS_A_ID }],
  ['user_can_use_money_account', { target_org: env.BUSINESS_A_ID, target_account: randomUUID() }],
]
const results = []
const roles = { owner: 'OWNER', business_admin: 'BUSINESS_ADMIN', manager: 'MANAGER', cashier: 'CASHIER', accountant: 'ACCOUNTANT', compliance_officer: 'COMPLIANCE', viewer: 'VIEWER' }
const probe = async (client, role, rpc, args, code, message) => {
  const response = await client.rpc(rpc, args)
  results.push({ role, rpc, passed: response.error?.code === code && response.error?.message === message && response.data === null })
}

try {
  const anonymous = makeClient()
  for (const [rpc, args] of helpers) await probe(anonymous, 'anonymous', rpc, args, '42501', `permission denied for function ${rpc}`)
  for (const [role, prefix] of Object.entries(roles)) {
    const client = makeClient()
    try {
      const login = await client.auth.signInWithPassword({ email: env[`SARAFI_E2E_${prefix}_A_EMAIL`], password: env[`SARAFI_E2E_${prefix}_A_PASSWORD`] })
      if (login.error) throw new Error('Fixture sign-in failed')
      const org = await client.from('organizations').select('display_name').eq('id', env.BUSINESS_A_ID).single()
      const context = await client.rpc('get_my_workspace_context')
      if (org.error || !/^SECURITY_TEST_/.test(org.data?.display_name ?? '') || context.error || context.data?.find((item) => item.organization_id === env.BUSINESS_A_ID)?.role_code !== role) {
        throw new Error('Unexpected fixture business or role')
      }
      for (const [rpc, args] of helpers) await probe(client, role, rpc, args, '42501', `permission denied for function ${rpc}`)
      for (const [rpc, args] of [
        ['get_platform_admin_console', {}], ['get_platform_operations', {}],
        ['get_platform_organization_users', { target_org: env.BUSINESS_B_ID }],
      ]) await probe(client, role, rpc, args, 'P0001', 'Platform administrator access required')
      await probe(client, role, 'get_billing_portal', { target_org: env.BUSINESS_B_ID }, 'P0001', 'Only the business owner can manage the plan')
    } finally {
      await client.auth.signOut({ scope: 'local' })
    }
  }
  const report = { financialWrites: 0, accessChanges: 0, checkedAt: new Date().toISOString(), results }
  mkdirSync('test-results/privileged-rpc', { recursive: true })
  writeFileSync('test-results/privileged-rpc/result.json', JSON.stringify(report, null, 2) + '\n')
  const failed = results.filter((result) => !result.passed)
  console.log(JSON.stringify({ financialWrites: 0, accessChanges: 0, passed: results.length - failed.length, total: results.length, failed }, null, 2))
  if (failed.length) process.exitCode = 1
} catch {
  // Do not print raw SDK errors/responses, which may contain private data.
  console.error('Privileged RPC verification failed closed; no release approval. Check fixture access and connectivity privately.')
  process.exitCode = 1
}
