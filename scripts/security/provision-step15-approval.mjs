import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const parse = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const source = parse('.env.step16.local')
const mfa = parse('.env.mfa15.local')
const url = process.env.SUPABASE_URL ?? source.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY ?? source.SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const organizationId = source.BUSINESS_A_ID
if (!url || !anon || !secret || !organizationId) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, and .env.step16.local BUSINESS_A_ID are required')
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const password = `${randomBytes(32).toString('base64url')}!APP15`
const email = `security-test-viewer-a-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}@testing.sarafi.invalid`
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: 'SECURITY_TEST_APPROVAL_VIEWER_A' } })
if (created.error) throw new Error(`create viewer failed: ${created.error.message}`)
const membership = await admin.from('organization_memberships').insert({ organization_id: organizationId, user_id: created.data.user.id, role_code: 'viewer', active: true }).select('id').single()
if (membership.error) throw new Error(`create viewer membership failed: ${membership.error.message}`)
const security = parse('.env.security.local')
const lines = ['# Disposable Step 15 approval fixture. Never commit this file.', ...Object.entries(source).filter(([key]) => key !== 'SARAFI_STEP16_BOUGHT_AMOUNT').map(([key, value]) => `${key}=${value}`), `SARAFI_E2E_MFA_OWNER_A_EMAIL=${mfa.SARAFI_E2E_MFA_OWNER_A_EMAIL}`, `SARAFI_E2E_MFA_OWNER_A_PASSWORD=${mfa.SARAFI_E2E_MFA_OWNER_A_PASSWORD}`, `SARAFI_E2E_MFA_OWNER_A_MEMBERSHIP_ID=${mfa.SARAFI_E2E_MFA_OWNER_A_MEMBERSHIP_ID}`, `SARAFI_E2E_VIEWER_A_EMAIL=${email}`, `SARAFI_E2E_VIEWER_A_PASSWORD=${password}`, `SARAFI_E2E_VIEWER_A_MEMBERSHIP_ID=${membership.data.id}`, `SARAFI_E2E_OWNER_B_EMAIL=${security.SARAFI_E2E_OWNER_B_EMAIL}`, `SARAFI_E2E_OWNER_B_PASSWORD=${security.SARAFI_E2E_OWNER_B_PASSWORD}`]
writeFileSync('.env.approval15.local', `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
console.log(JSON.stringify({ project: new URL(url).hostname, organization_id: organizationId, viewer_user_id: created.data.user.id, viewer_membership_id: membership.data.id, env_file: '.env.approval15.local' }, null, 2))
