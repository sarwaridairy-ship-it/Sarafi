// Read-only regression: never seed, post, or rewrite financial data.
import { createClient } from '@supabase/supabase-js'
import { readEnvFile } from './mfa-fixture.mjs'

const env = { ...readEnvFile(process.env.SARAFI_SECURITY_ENV ?? '.env.security.local'), ...process.env }
for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BUSINESS_A_ID', 'BUSINESS_B_ID', 'BRANCH_B1_ID',
  'SARAFI_E2E_OWNER_A_EMAIL', 'SARAFI_E2E_OWNER_A_PASSWORD', 'SARAFI_E2E_OWNER_B_EMAIL', 'SARAFI_E2E_OWNER_B_PASSWORD']) {
  if (!env[key]) throw new Error(`Missing fixture setting: ${key}`)
}
if (env.BUSINESS_A_ID === env.BUSINESS_B_ID) throw new Error('Two separate security businesses are required')
const makeClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const anonymous = makeClient()
const clients = []
const results = []
const record = (test, passed) => results.push({ test, result: passed ? 'PASS' : 'FAIL' })
const denied = (result) => Boolean(result.error && /permission denied|could not find the function|CAPABILITY_REQUIRED/.test(result.error.message))

try {
  for (const label of ['A', 'B']) {
    const client = makeClient()
    clients.push(client)
    const login = await client.auth.signInWithPassword({
      email: env[`SARAFI_E2E_OWNER_${label}_EMAIL`], password: env[`SARAFI_E2E_OWNER_${label}_PASSWORD`],
    })
    if (login.error) throw new Error(`Fixture ${label} sign-in failed`)
    const organization = await client.from('organizations').select('display_name').eq('id', env[`BUSINESS_${label}_ID`]).single()
    if (organization.error || !/^SECURITY_TEST_/.test(organization.data?.display_name ?? '')) {
      throw new Error(`Fixture ${label} is not a disposable security business`)
    }
  }
  const [ownerA, ownerB] = clients
  const control = await ownerB.rpc('get_organization_control_plane', { target_org: env.BUSINESS_B_ID })
  const rate = control.data?.rate_groups?.flatMap((group) => group.rates.map((item) => ({ ...item, rate_group_id: group.id })))
    .find((item) => item.active && (!item.branch_id || item.branch_id === env.BRANCH_B1_ID) && Date.parse(item.effective_from) <= Date.now())
  if (control.error || !rate) throw new Error('Fixture B needs an existing active test rate; no data was created')
  const args = {
    target_org: env.BUSINESS_B_ID, target_branch: rate.branch_id ?? env.BRANCH_B1_ID,
    source_currency: rate.from_currency, target_currency: rate.to_currency,
  }
  const legacyArgs = { ...args, target_group: rate.rate_group_id }
  const direct = await ownerA.from('rate_board_entries').select('id').eq('organization_id', env.BUSINESS_B_ID)
  record('Direct cross-tenant rate table read is denied or empty', denied(direct) || (!direct.error && direct.data?.length === 0))
  record('Legacy helper denies another business owner', denied(await ownerA.rpc('current_rate', legacyArgs)))
  record('Legacy helper is not a client RPC even for its owner', denied(await ownerB.rpc('current_rate', legacyArgs)))
  record('Legacy helper denies anonymous calls', denied(await anonymous.rpc('current_rate', legacyArgs)))
  const current = await ownerB.rpc('get_current_rates_v6', args)
  record('Supported rate API still returns the authorized branch rate', !current.error && current.data?.length === 1)
  record('Supported rate API denies another business owner', denied(await ownerA.rpc('get_current_rates_v6', args)))
  console.log(JSON.stringify({ financialWrites: 0, results }, null, 2))
  if (results.some((result) => result.result !== 'PASS')) process.exitCode = 1
} finally {
  await Promise.all(clients.map((client) => client.auth.signOut({ scope: 'local' })))
}
