import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const parse = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const source = parse('.env.step16.local')
const mfa = parse('.env.mfa15.local')
const approval = parse('.env.approval15.local')
const security = parse('.env.security.local')
const url = process.env.SUPABASE_URL ?? source.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY ?? source.SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SECRET_KEY
if (!url || !anon || !secret) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SECRET_KEY are required')
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const password = () => `${randomBytes(32).toString('base64url')}!S15C`
const email = (role) => `security-test-${role.toLowerCase()}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}@testing.sarafi.invalid`
const compliance = { email: email('COMPLIANCE-A'), password: password() }
const created = await admin.auth.admin.createUser({ email: compliance.email, password: compliance.password, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: 'SECURITY_TEST_CONSOLIDATED_COMPLIANCE_A' } })
if (created.error) throw new Error(`create compliance failed: ${created.error.message}`)
const membership = await admin.from('organization_memberships').insert({ organization_id: source.BUSINESS_A_ID, user_id: created.data.user.id, role_code: 'compliance_officer', active: true }).select('id').single()
if (membership.error) throw new Error(`create compliance membership failed: ${membership.error.message}`)
const lines = [
  '# Disposable consolidated Step 15 fixture. Never commit this file.',
  `SUPABASE_URL=${url}`, `SUPABASE_ANON_KEY=${anon}`,
  `SARAFI_E2E_OWNER_A_EMAIL=${mfa.SARAFI_E2E_MFA_OWNER_A_EMAIL}`, `SARAFI_E2E_OWNER_A_PASSWORD=${mfa.SARAFI_E2E_MFA_OWNER_A_PASSWORD}`,
  `SARAFI_E2E_OWNER_B_EMAIL=${security.SARAFI_E2E_OWNER_B_EMAIL}`, `SARAFI_E2E_OWNER_B_PASSWORD=${security.SARAFI_E2E_OWNER_B_PASSWORD}`,
  `SARAFI_E2E_CASHIER_A_EMAIL=${source.SARAFI_E2E_CASHIER_A_EMAIL}`, `SARAFI_E2E_CASHIER_A_PASSWORD=${source.SARAFI_E2E_CASHIER_A_PASSWORD}`,
  `SARAFI_E2E_VIEWER_A_EMAIL=${approval.SARAFI_E2E_VIEWER_A_EMAIL}`, `SARAFI_E2E_VIEWER_A_PASSWORD=${approval.SARAFI_E2E_VIEWER_A_PASSWORD}`,
  `SARAFI_E2E_COMPLIANCE_A_EMAIL=${compliance.email}`, `SARAFI_E2E_COMPLIANCE_A_PASSWORD=${compliance.password}`,
  `BUSINESS_A_ID=${source.BUSINESS_A_ID}`, `BUSINESS_B_ID=${security.BUSINESS_B_ID}`,
  `BRANCH_A1_ID=${source.BRANCH_A1_ID}`, `BRANCH_A2_ID=${source.BRANCH_A2_ID}`, `CASHBOX_A1_ID=${source.CASHBOX_A1_ID}`, `CASHBOX_A2_ID=${source.CASHBOX_A2_ID}`, `BRANCH_B1_ID=${security.BRANCH_B1_ID}`, `CASHBOX_B1_ID=${security.CASHBOX_B1_ID}`,
  `CASHIER_A_MEMBERSHIP_ID=${source.CASHIER_A_MEMBERSHIP_ID}`,
]
writeFileSync('.env.step15-consolidated.local', `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
console.log(JSON.stringify({ project: new URL(url).hostname, business_a_id: source.BUSINESS_A_ID, compliance_user_id: created.data.user.id, compliance_membership_id: membership.data.id, env_file: '.env.step15-consolidated.local' }, null, 2))
