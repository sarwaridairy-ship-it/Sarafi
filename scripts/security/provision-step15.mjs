import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const supabaseUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const expectedHost = 'vbvwuqzqtcorassvotke.supabase.co'

if (!supabaseUrl || new URL(supabaseUrl).hostname !== expectedHost) throw new Error(`SUPABASE_URL must target ${expectedHost}`)
if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is required in the trusted terminal')
if (!anonKey) throw new Error('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required')

const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const password = () => `${randomBytes(32).toString('base64url')}!S15`
const suffix = `${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}`
const localFile = '.env.security.local'
const users = [
  ['OWNER_A', 'owner'], ['MANAGER_A', 'manager'], ['ACCOUNTANT_A', 'accountant'], ['CASHIER_A', 'cashier'], ['VIEWER_A', 'viewer'], ['COMPLIANCE_A', 'compliance'],
  ['OWNER_B', 'owner'], ['CASHIER_B', 'cashier'],
]
const credentials = {}
const ids = {}

function requireResult(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

async function createOwnerBusiness(label, owner) {
  const ownerClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
  const signIn = await ownerClient.auth.signInWithPassword({ email: owner.email, password: owner.password })
  requireResult(signIn, `sign in ${label}`)
  const business = await ownerClient.rpc('create_business', { command: { display_name: `SECURITY_TEST_BUSINESS_${label}`, base_currency_code: 'AFN', branch_name: `SECURITY_TEST_BRANCH_${label}1`, cashbox_name: `SECURITY_TEST_CASHBOX_${label}1`, currencies: ['AFN', 'USD', 'EUR'], language: 'en' } })
  requireResult(business, `create business ${label}`)
  await ownerClient.auth.signOut()
  return business.data
}

async function insertRow(table, row, label) {
  const result = await admin.from(table).insert(row).select().single()
  return requireResult(result, label)
}

async function provision() {
  for (const [label, role] of users) {
    const generatedPassword = password()
    const email = `security-${role}-${label.endsWith('_A') ? 'a' : 'b'}-${suffix}@testing.sarafi.invalid`
    const result = await admin.auth.admin.createUser({ email, password: generatedPassword, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: `SECURITY_TEST_${label}` } })
    const user = requireResult(result, `create user ${label}`)
    credentials[label] = { email, password: generatedPassword }
    ids[`${label}_USER_ID`] = user.user.id
  }

  const businessA = await createOwnerBusiness('A', credentials.OWNER_A)
  const businessB = await createOwnerBusiness('B', credentials.OWNER_B)
  ids.BUSINESS_A_ID = businessA.id
  ids.BUSINESS_B_ID = businessB.id

  const memberships = [
    ['MANAGER_A', 'manager', businessA.id], ['ACCOUNTANT_A', 'accountant', businessA.id], ['CASHIER_A', 'cashier', businessA.id], ['VIEWER_A', 'viewer', businessA.id], ['COMPLIANCE_A', 'compliance_officer', businessA.id], ['CASHIER_B', 'cashier', businessB.id],
  ]
  for (const [label, role, organizationId] of memberships) {
    const membership = await insertRow('organization_memberships', { organization_id: organizationId, user_id: ids[`${label}_USER_ID`], role_code: role, active: true }, `membership ${label}`)
    ids[`${label}_MEMBERSHIP_ID`] = membership.id
  }

  const branchA2 = await insertRow('branches', { organization_id: businessA.id, name: 'SECURITY_TEST_BRANCH_A2', timezone: 'Asia/Kabul', active: true }, 'branch A2')
  const cashboxA2 = await insertRow('cashboxes', { organization_id: businessA.id, branch_id: branchA2.id, name: 'SECURITY_TEST_CASHBOX_A2', active: true }, 'cashbox A2')
  const branchB1 = (await admin.from('branches').select('id').eq('organization_id', businessB.id).eq('name', 'SECURITY_TEST_BRANCH_B1').single()).data
  const cashboxB1 = (await admin.from('cashboxes').select('id').eq('organization_id', businessB.id).eq('name', 'SECURITY_TEST_CASHBOX_B1').single()).data
  const branchA1 = (await admin.from('branches').select('id').eq('organization_id', businessA.id).eq('name', 'SECURITY_TEST_BRANCH_A1').single()).data
  const cashboxA1 = (await admin.from('cashboxes').select('id').eq('organization_id', businessA.id).eq('name', 'SECURITY_TEST_CASHBOX_A1').single()).data
  if (!branchA1 || !cashboxA1 || !branchB1 || !cashboxB1) throw new Error('onboarding did not create expected branch/cashbox fixtures')
  Object.assign(ids, { BRANCH_A1_ID: branchA1.id, BRANCH_A2_ID: branchA2.id, CASHBOX_A1_ID: cashboxA1.id, CASHBOX_A2_ID: cashboxA2.id, BRANCH_B1_ID: branchB1.id, CASHBOX_B1_ID: cashboxB1.id })
  await insertRow('organization_branch_access', { membership_id: ids.CASHIER_A_MEMBERSHIP_ID, branch_id: branchA1.id }, 'cashier A branch scope')
  await insertRow('organization_cashbox_access', { membership_id: ids.CASHIER_A_MEMBERSHIP_ID, cashbox_id: cashboxA1.id }, 'cashier A cashbox scope')

  const envLines = ['# Local disposable Step 15 fixture credentials. Never commit this file.', `SUPABASE_URL=${supabaseUrl}`, `SUPABASE_ANON_KEY=${anonKey}`]
  for (const label of Object.keys(credentials)) { envLines.push(`SARAFI_E2E_${label}_EMAIL=${credentials[label].email}`, `SARAFI_E2E_${label}_PASSWORD=${credentials[label].password}`) }
  for (const [key, value] of Object.entries(ids)) envLines.push(`${key}=${value}`)
  writeFileSync(localFile, `${envLines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(JSON.stringify({ project_host: new URL(supabaseUrl).hostname, users: Object.fromEntries(Object.keys(credentials).map((label) => [label, { email: credentials[label].email, user_id: ids[`${label}_USER_ID`] }])), organizations: { BUSINESS_A_ID: ids.BUSINESS_A_ID, BUSINESS_B_ID: ids.BUSINESS_B_ID }, scopes: { BRANCH_A1_ID: ids.BRANCH_A1_ID, BRANCH_A2_ID: ids.BRANCH_A2_ID, CASHBOX_A1_ID: ids.CASHBOX_A1_ID, CASHBOX_A2_ID: ids.CASHBOX_A2_ID, BRANCH_B1_ID: ids.BRANCH_B1_ID, CASHBOX_B1_ID: ids.CASHBOX_B1_ID } }, null, 2))
}

await provision()
