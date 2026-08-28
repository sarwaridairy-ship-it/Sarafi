import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const organizationId = process.env.BUSINESS_A_ID
if (!url || !secret || !anon || !organizationId) throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_ANON_KEY, and BUSINESS_A_ID are required')
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const password = `${randomBytes(32).toString('base64url')}!MFA15`
const email = `security-test-mfa-owner-a-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}@testing.sarafi.invalid`
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: 'SECURITY_TEST_MFA_OWNER_A' } })
if (created.error) throw new Error(`create MFA user failed: ${created.error.message}`)
const membership = await admin.from('organization_memberships').insert({ organization_id: organizationId, user_id: created.data.user.id, role_code: 'owner', active: true }).select('id').single()
if (membership.error) throw new Error(`create MFA owner membership failed: ${membership.error.message}`)
const lines = ['# Disposable Step 15 MFA fixture. Never commit this file.', `SUPABASE_URL=${url}`, `SUPABASE_ANON_KEY=${anon}`, `SARAFI_E2E_MFA_OWNER_A_EMAIL=${email}`, `SARAFI_E2E_MFA_OWNER_A_PASSWORD=${password}`, `SARAFI_E2E_MFA_OWNER_A_USER_ID=${created.data.user.id}`, `SARAFI_E2E_MFA_OWNER_A_MEMBERSHIP_ID=${membership.data.id}`, `BUSINESS_A_ID=${organizationId}`]
writeFileSync('.env.mfa15.local', `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
console.log(JSON.stringify({ project: new URL(url).hostname, user_id: created.data.user.id, membership_id: membership.data.id, env_file: '.env.mfa15.local' }, null, 2))
