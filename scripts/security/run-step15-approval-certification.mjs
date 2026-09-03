import { createClient } from '@supabase/supabase-js'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const parse = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const source = parse('.env.step16.local')
const approval = parse('.env.approval15.local')
const url = process.env.SUPABASE_URL ?? source.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY ?? source.SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY
const env = { ...source, ...approval, ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_CASHIER_A_EMAIL', 'SARAFI_E2E_CASHIER_A_PASSWORD', 'SARAFI_E2E_VIEWER_A_EMAIL', 'SARAFI_E2E_VIEWER_A_PASSWORD', 'SARAFI_E2E_OWNER_B_EMAIL', 'SARAFI_E2E_OWNER_B_PASSWORD', 'BUSINESS_A_ID', 'BRANCH_A1_ID', 'CASHBOX_A1_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing approval certification setting: ${key}`)
if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is required to create a fresh disposable approver')
const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const client = () => createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const results = []
const record = (name, passed, detail = '') => results.push({ name, result: passed ? 'PASS' : 'FAIL', detail })
const signIn = async (email, password) => { const instance = client(); const result = await instance.auth.signInWithPassword({ email, password }); if (result.error) throw new Error(`sign in failed: ${result.error.message}`); return instance }
const cashier = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const viewer = await signIn(env.SARAFI_E2E_VIEWER_A_EMAIL, env.SARAFI_E2E_VIEWER_A_PASSWORD)
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
const device = await cashier.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: `STEP15_APPROVAL_CASHIER_${randomUUID()}`, fingerprint_hash_input: `step15-approval-${randomUUID()}`, app_version_input: 'step15-approval', target_branch: env.BRANCH_A1_ID })
if (device.error || !device.data?.id) throw new Error(`cashier device registration failed: ${device.error?.message ?? 'no device returned'}`)
const command = (id) => ({ organization_id: env.BUSINESS_A_ID, branch_id: env.BRANCH_A1_ID, cashbox_id: env.CASHBOX_A1_ID, device_id: device.data.id, side: 'sell_fx', sold_currency: 'USD', bought_currency: 'AFN', sold_amount: '0.0001', bought_amount: '0.01', sold_base_value: '0.01', bought_base_value: '0.01', base_currency: 'AFN', client_command_id: id, approval_reason: 'Step 15 approval certification' })
const request = await cashier.rpc('request_fx_trade_approval', { command: command(randomUUID()) })
if (request.error || !request.data?.id) throw new Error(`approval request failed: ${request.error?.message ?? 'no request returned'}`)
const approvalId = request.data.id
const decide = (instance) => instance.rpc('decide_approval', { target_id: approvalId, decision: 'approved', decision_reason_input: 'Step 15 certification decision' })
const self = await decide(cashier)
record('APPROVAL_SELF_DENIAL', Boolean(self.error), self.error?.message ?? 'self approval unexpectedly allowed')
const viewerResult = await decide(viewer)
record('APPROVAL_VIEWER_DENIAL', Boolean(viewerResult.error), viewerResult.error?.message ?? 'viewer approval unexpectedly allowed')
const crossTenant = await decide(ownerB)
record('APPROVAL_CROSS_TENANT_DENIAL', Boolean(crossTenant.error), crossTenant.error?.message ?? 'cross tenant approval unexpectedly allowed')
const approverEmail = `security-test-approval-owner-a-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}@testing.sarafi.invalid`
const approverPassword = `${randomBytes(32).toString('base64url')}!APP15`
const created = await admin.auth.admin.createUser({ email: approverEmail, password: approverPassword, email_confirm: true, user_metadata: { security_fixture: true, fixture_label: 'SECURITY_TEST_APPROVAL_OWNER_A' } })
if (created.error) throw new Error(`fresh approver creation failed: ${created.error.message}`)
const membership = await admin.from('organization_memberships').insert({ organization_id: env.BUSINESS_A_ID, user_id: created.data.user.id, role_code: 'owner', active: true }).select('id').single()
if (membership.error) throw new Error(`fresh approver membership failed: ${membership.error.message}`)
const approver = await signIn(approverEmail, approverPassword)
const aal1 = await approver.auth.mfa.getAuthenticatorAssuranceLevel()
record('Approver AAL1 before TOTP', aal1.data?.currentLevel === 'aal1', aal1.data?.currentLevel ?? 'none')
const enrolled = await approver.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SECURITY_TEST_APPROVAL_OWNER_A_${randomUUID()}` })
if (enrolled.error || !enrolled.data?.id || !enrolled.data.totp?.secret) throw new Error(`approver TOTP enrollment failed: ${enrolled.error?.message ?? 'no factor returned'}`)
const secret = enrolled.data.totp.secret
const decodeBase32 = (value) => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const bits = value.replace(/=+$/, '').toUpperCase().split('').map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join(''); return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2))) }
const totp = (time = Date.now()) => { const counter = Math.floor(time / 1000 / 30); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1] & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0') }
const challenge = await approver.auth.mfa.challenge({ factorId: enrolled.data.id })
if (challenge.error) throw new Error(`approver TOTP challenge failed: ${challenge.error.message}`)
const verified = await approver.auth.mfa.verify({ factorId: enrolled.data.id, challengeId: challenge.data.id, code: totp() })
if (verified.error) throw new Error(`approver TOTP verification failed: ${verified.error.message}`)
const aal2 = await approver.auth.mfa.getAuthenticatorAssuranceLevel()
record('Approver reaches AAL2', aal2.data?.currentLevel === 'aal2', aal2.data?.currentLevel ?? 'none')
const authorized = await decide(approver)
record('APPROVAL_AUTHORIZED_SUCCESS', !authorized.error && authorized.data?.status === 'approved', authorized.error?.message ?? authorized.data?.status ?? '')
const repeated = await decide(approver)
record('APPROVAL_IDEMPOTENCY', Boolean(repeated.error), repeated.error?.message ?? 'repeat approval unexpectedly allowed')
const secondRequest = await cashier.rpc('request_fx_trade_approval', { command: command(randomUUID()) })
if (secondRequest.error || !secondRequest.data?.id) throw new Error(`second approval request failed: ${secondRequest.error?.message ?? 'no request returned'}`)
const concurrent = await Promise.all([approver.rpc('decide_approval', { target_id: secondRequest.data.id, decision: 'approved', decision_reason_input: 'Concurrent approval A' }), approver.rpc('decide_approval', { target_id: secondRequest.data.id, decision: 'approved', decision_reason_input: 'Concurrent approval B' })])
record('Concurrent approval has one final decision', concurrent.filter((result) => !result.error).length === 1, concurrent.map((result) => result.error?.message ?? result.data?.status).join(' | '))
const [events, entries, receipts, audits] = await Promise.all([cashier.from('financial_events').select('id').eq('organization_id', env.BUSINESS_A_ID), cashier.from('journal_entries').select('id').eq('organization_id', env.BUSINESS_A_ID), cashier.from('command_receipts').select('client_command_id').eq('organization_id', env.BUSINESS_A_ID), cashier.from('security_audit_events').select('id').eq('organization_id', env.BUSINESS_A_ID)])
const retiredMembership = await admin.from('organization_memberships').update({ active: false }).eq('id', membership.data.id)
const retiredApprover = await admin.auth.admin.updateUserById(created.data.user.id, { ban_duration: '876000h' })
record('Disposable approver is retired while its audit trail remains', !retiredMembership.error && !retiredApprover.error, retiredMembership.error?.message ?? retiredApprover.error?.message ?? '')
const report = { project: new URL(url).hostname, generated_at: new Date().toISOString(), passed: results.filter((result) => result.result === 'PASS').length, failed: results.filter((result) => result.result === 'FAIL').length, financial_state_counts: { events: events.data?.length ?? null, journal_entries: entries.data?.length ?? null, receipts: receipts.data?.length ?? null, audit_events: audits.data?.length ?? null }, results }
mkdirSync('test-results/step15', { recursive: true })
writeFileSync('test-results/step15/approval-certification-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
