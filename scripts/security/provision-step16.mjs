import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const supabaseUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !secretKey || !anonKey) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, and SUPABASE_ANON_KEY are required')

const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const password = () => `${randomBytes(32).toString('base64url')}!S16`
const suffix = `${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}`
const email = (role) => `step16-${role.toLowerCase()}-${suffix}@testing.sarafi.invalid`
const requireResult = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}
const credentials = { owner: { email: email('OWNER'), password: password() }, cashierA: { email: email('CASHIER-A'), password: password() }, cashierB: { email: email('CASHIER-B'), password: password() } }
const users = {}
for (const [label, account] of Object.entries(credentials)) users[label] = requireResult(await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: `STEP16_${label}` } }), `create ${label}`).user

const owner = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
requireResult(await owner.auth.signInWithPassword(credentials.owner), 'sign in owner')
const business = requireResult(await owner.rpc('create_business', { command: { display_name: `STEP16_CONCURRENCY_${suffix}`, base_currency_code: 'AFN', branch_name: 'STEP16_BRANCH', cashbox_name: 'STEP16_CASHBOX', currencies: ['AFN', 'USD'], language: 'en' } }), 'create Step 16 business')
const branch = requireResult(await admin.from('branches').select('id').eq('organization_id', business.id).eq('name', 'STEP16_BRANCH').single(), 'find Step 16 branch')
const cashbox = requireResult(await admin.from('cashboxes').select('id').eq('organization_id', business.id).eq('name', 'STEP16_CASHBOX').single(), 'find Step 16 cashbox')
const memberships = {}
for (const [label, role] of [['cashierA', 'cashier'], ['cashierB', 'cashier']]) {
  memberships[label] = requireResult(await admin.from('organization_memberships').insert({ organization_id: business.id, user_id: users[label].id, role_code: role, active: true }).select('id').single(), `create ${label} membership`).id
  requireResult(await admin.from('organization_branch_access').insert({ membership_id: memberships[label], branch_id: branch.id }), `scope ${label} branch`)
  requireResult(await admin.from('organization_cashbox_access').insert({ membership_id: memberships[label], cashbox_id: cashbox.id }), `scope ${label} cashbox`)
}
const inventorySeed = requireResult(await owner.rpc('record_fx_trade', { command: { organization_id: business.id, branch_id: branch.id, cashbox_id: cashbox.id, side: 'buy_fx', sold_currency: 'AFN', bought_currency: 'USD', sold_amount: '10000', bought_amount: '10000', sold_base_value: '10000', bought_base_value: '10000', base_currency: 'AFN', client_command_id: `step16-seed-${randomUUID()}` } }), 'seed USD inventory')
if (!inventorySeed?.id) throw new Error('inventory seed did not return a journal entry')
const envLines = [
  '# Disposable Step 16 fixture. Never commit this file.',
  `SUPABASE_URL=${supabaseUrl}`,
  `SUPABASE_ANON_KEY=${anonKey}`,
  `SARAFI_E2E_CASHIER_A_EMAIL=${credentials.cashierA.email}`,
  `SARAFI_E2E_CASHIER_A_PASSWORD=${credentials.cashierA.password}`,
  `SARAFI_E2E_CASHIER_B_EMAIL=${credentials.cashierB.email}`,
  `SARAFI_E2E_CASHIER_B_PASSWORD=${credentials.cashierB.password}`,
  `BUSINESS_A_ID=${business.id}`,
  `BRANCH_A1_ID=${branch.id}`,
  `CASHBOX_A1_ID=${cashbox.id}`,
  'SARAFI_STEP16_SOLD_CURRENCY=USD',
  'SARAFI_STEP16_BOUGHT_CURRENCY=AFN',
  'SARAFI_STEP16_BASE_CURRENCY=AFN',
  'SARAFI_STEP16_BOUGHT_AMOUNT=0.01',
]
writeFileSync('.env.step16.local', `${envLines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
console.log(JSON.stringify({ project: new URL(supabaseUrl).hostname, organization_id: business.id, branch_id: branch.id, cashbox_id: cashbox.id, inventory_currency: 'USD', inventory_quantity: 10000, env_file: '.env.step16.local' }, null, 2))
