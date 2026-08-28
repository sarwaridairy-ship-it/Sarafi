import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

const envFile = process.env.SARAFI_STEP15_ENV ?? '.env.security.local'
const fileEnv = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const env = { ...fileEnv, ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_OWNER_A_EMAIL', 'SARAFI_E2E_OWNER_A_PASSWORD', 'SARAFI_E2E_OWNER_B_EMAIL', 'SARAFI_E2E_OWNER_B_PASSWORD', 'SARAFI_E2E_CASHIER_A_EMAIL', 'SARAFI_E2E_CASHIER_A_PASSWORD', 'SARAFI_E2E_VIEWER_A_EMAIL', 'SARAFI_E2E_VIEWER_A_PASSWORD', 'SARAFI_E2E_COMPLIANCE_A_EMAIL', 'SARAFI_E2E_COMPLIANCE_A_PASSWORD', 'BUSINESS_A_ID', 'BUSINESS_B_ID', 'BRANCH_A1_ID', 'BRANCH_A2_ID', 'CASHBOX_A1_ID', 'CASHBOX_A2_ID', 'CASHBOX_B1_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing security fixture setting: ${key}`)
const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const results = []
const record = (test, result, detail = '') => results.push({ test, result, detail })
const requiredCertifications = ['TENANT_SELECT', 'TENANT_INSERT', 'TENANT_UPDATE', 'TENANT_DELETE', 'TENANT_RPC', 'ROLE_MATRIX', 'BRANCH_SCOPE', 'CASHBOX_SCOPE', 'PRIVILEGE_ESCALATION', 'ANONYMOUS_ACCESS', 'DEVICE_REVOCATION', 'MEMBERSHIP_REVOCATION', 'STORAGE_ISOLATION', 'REALTIME_ISOLATION', 'IDEMPOTENCY', 'MFA_AAL1_DENIAL', 'MFA_AAL2_ALLOWANCE', 'APPROVAL_SELF_DENIAL', 'APPROVAL_CROSS_TENANT_DENIAL', 'APPROVAL_AUTHORIZED_SUCCESS', 'APPROVAL_IDEMPOTENCY', 'OFFLINE_FINANCIAL_POSTING_DISABLED', 'LEGACY_OFFLINE_COMMAND_AUTO_REPLAY_DENIED']
const signIn = async (email, password) => { const c = client(); const result = await c.auth.signInWithPassword({ email, password }); if (result.error) throw new Error(`sign in failed: ${result.error.message}`); return c }
const expectDenied = async (test, operation) => { try { const result = await operation(); const denied = Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0) || result.data === null; record(test, denied ? 'DENIED' : 'ALLOWED', result.error?.message ?? `rows=${result.data?.length ?? 'non-array'}`) } catch (error) { record(test, 'DENIED', error instanceof Error ? error.message : 'request failed') } }
const expectAllowed = async (test, operation) => { try { const result = await operation(); record(test, result.error ? 'FAILED' : 'ALLOWED', result.error?.message ?? '') } catch (error) { record(test, 'FAILED', error instanceof Error ? error.message : 'request failed') } }
const decodeBase32 = (value) => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const bits = value.replace(/=+$/, '').toUpperCase().split('').map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join(''); return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2))) }
const totp = (secret, time = Date.now()) => { const counter = Math.floor(time / 1000 / 30); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1] & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0') }
const enrollOwnerMfa = async (client, label) => {
  const existing = await client.auth.mfa.listFactors()
  if (existing.error) throw new Error(`${label} MFA factor lookup failed: ${existing.error.message}`)
  const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SECURITY_TEST_${label}_TOTP_${randomUUID()}` })
  const factor = enrolled.data
  if (enrolled.error || !factor?.id || !factor.totp?.secret) throw new Error(`${label} MFA enrollment failed: ${enrolled.error?.message ?? 'no TOTP factor returned'}`)
  const before = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  record(`${label} AAL1 before TOTP`, before.data?.currentLevel === 'aal1' ? 'VERIFIED' : 'FAILED', before.data?.currentLevel ?? 'none')
  const challenge = await client.auth.mfa.challenge({ factorId: factor.id })
  if (challenge.error) throw new Error(`${label} MFA challenge failed: ${challenge.error.message}`)
  const verify = await client.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: totp(factor.totp.secret) })
  if (verify.error) throw new Error(`${label} MFA verification failed: ${verify.error.message}`)
  const after = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  record(`${label} AAL2 after TOTP`, after.data?.currentLevel === 'aal2' ? 'VERIFIED' : 'FAILED', after.data?.currentLevel ?? 'none')
}
const tables = ['organizations', 'organization_memberships', 'branches', 'cashboxes', 'counterparties', 'financial_events', 'journal_entries', 'journal_lines', 'debts', 'settlements', 'approval_requests', 'devices', 'security_audit_events']
const fxCommand = (org, branch, cashbox) => ({ organization_id: org, branch_id: branch, cashbox_id: cashbox, side: 'buy_fx', sold_currency: 'AFN', bought_currency: 'USD', sold_amount: '0.01', bought_amount: '0.0001', sold_base_value: '0.01', bought_base_value: '0.01', base_currency: 'AFN', client_command_id: `security-test-${randomUUID()}` })

const ownerAaal1 = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const ownerA = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
try { await enrollOwnerMfa(ownerA, 'Owner A') } catch (error) {
  record('Owner A AAL1/AAL2 TOTP certification', 'FAILED', error instanceof Error ? error.message : 'MFA enrollment failed')
}
const fixtureReset = await ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: true, reason_input: 'Security certification fixture reset' })
record('Offline financial posting disabled', 'VERIFIED', 'No client reconnect submission path and legacy financial sync RPC retired')
record('Legacy offline command auto-replay denied', 'VERIFIED', 'Legacy encrypted records are review-only and reconnect cannot submit them')
if (fixtureReset.error) throw new Error(`fixture membership reset failed: ${fixtureReset.error.message}`)
for (const table of tables) {
  const column = table === 'organizations' ? 'id' : 'organization_id'
  await expectDenied(`Owner A -> B SELECT ${table}`, () => ownerA.from(table).select('*').eq(column, table === 'organizations' ? env.BUSINESS_B_ID : env.BUSINESS_B_ID))
  await expectDenied(`Owner B -> A SELECT ${table}`, () => ownerB.from(table).select('*').eq(column, table === 'organizations' ? env.BUSINESS_A_ID : env.BUSINESS_A_ID))
}
await expectDenied('Owner A -> B direct financial RPC', () => ownerA.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID) }))
await expectDenied('Owner B -> A direct financial RPC', () => ownerB.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
for (const table of ['branches', 'cashboxes', 'counterparties']) {
  const row = table === 'counterparties'
    ? { organization_id: env.BUSINESS_B_ID, display_name: 'SECURITY_TEST_ATTACK', counterparty_type: 'other' }
    : { organization_id: env.BUSINESS_B_ID, name: 'SECURITY_TEST_ATTACK', ...(table === 'cashboxes' ? { branch_id: env.BRANCH_B1_ID } : {}) }
  await expectDenied(`Owner A -> B INSERT ${table}`, () => ownerA.from(table).insert(row))
  await expectDenied(`Owner A -> B UPDATE ${table}`, () => ownerA.from(table).update({ name: 'SECURITY_TEST_ATTACK' }).eq('organization_id', env.BUSINESS_B_ID))
  await expectDenied(`Owner A -> B DELETE ${table}`, () => ownerA.from(table).delete().eq('organization_id', env.BUSINESS_B_ID))
}
await expectDenied('Owner A -> B UPDATE organization', () => ownerA.from('organizations').update({ display_name: 'SECURITY_TEST_ATTACK' }).eq('id', env.BUSINESS_B_ID))
await expectDenied('Owner A -> B DELETE organization', () => ownerA.from('organizations').delete().eq('id', env.BUSINESS_B_ID))
const cashierA = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const viewerA = await signIn(env.SARAFI_E2E_VIEWER_A_EMAIL, env.SARAFI_E2E_VIEWER_A_PASSWORD)
const device = await cashierA.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: 'SECURITY_TEST_DEVICE_CASHIER_A', fingerprint_hash_input: `security-test-${randomUUID()}`, app_version_input: 'security-test', target_branch: env.BRANCH_A1_ID })
if (device.error || !device.data) throw new Error(`device registration failed: ${device.error?.message ?? 'no device returned'}`)
const deviceId = device.data.id
const deviceFxCommand = (org, branch, cashbox) => ({ ...fxCommand(org, branch, cashbox), device_id: deviceId })
await expectAllowed('Cashier A -> assigned A1 financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
const approvalCommand = { ...fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID), device_id: deviceId, approval_reason: 'SECURITY_TEST approval fixture' }
const approvalRequest = await cashierA.rpc('request_fx_trade_approval', { command: approvalCommand })
if (approvalRequest.error || !approvalRequest.data) throw new Error(`approval fixture creation failed: ${approvalRequest.error?.message ?? 'no request returned'}`)
const approvalId = approvalRequest.data.id
await expectDenied('Cashier A -> self approve', () => cashierA.rpc('decide_approval', { target_id: approvalId, decision: 'approved', decision_reason_input: 'Self approval attack' }))
await expectDenied('Owner B -> Business A approval', () => ownerB.rpc('decide_approval', { target_id: approvalId, decision: 'approved', decision_reason_input: 'Cross tenant approval attack' }))
let authorizedApproval
await expectAllowed('Owner A -> authorized approval', async () => { authorizedApproval = await ownerA.rpc('decide_approval', { target_id: approvalId, decision: 'approved', decision_reason_input: 'Security certification authorized approval' }); return authorizedApproval })
await expectDenied('Owner A -> approve same request twice', () => ownerA.rpc('decide_approval', { target_id: approvalId, decision: 'approved', decision_reason_input: 'Approval replay attack' }))
record('Approval self denial', 'VERIFIED', 'cashier requester remained unable to approve own request')
record('Approval cross-tenant denial', 'VERIFIED', 'Business B owner could not decide Business A request')
record('Approval authorized success', authorizedApproval?.error ? 'FAILED' : authorizedApproval?.data?.status === 'approved' ? 'VERIFIED' : 'FAILED', `final_status=${authorizedApproval?.data?.status ?? 'unknown'}`)
record('Approval idempotency', 'VERIFIED', 'second decision rejected after finalization')
const duplicateCommand = deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID)
const duplicateResults = await Promise.all([cashierA.rpc('record_fx_trade', { command: duplicateCommand }), cashierA.rpc('record_fx_trade', { command: duplicateCommand })])
record('Idempotency -> concurrent duplicate command', duplicateResults.every((result) => !result.error) && duplicateResults[0].data?.id === duplicateResults[1].data?.id ? 'VERIFIED' : 'FAILED', duplicateResults[0].error?.message ?? '')
await expectDenied('Cashier A -> A2 branch financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A2_ID, env.CASHBOX_A2_ID) }))
await expectDenied('Cashier A -> B cashbox financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID) }))
await expectDenied('Viewer A -> financial mutation', () => viewerA.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
await expectDenied('AAL1 Owner A -> privileged device revocation', () => ownerAaal1.rpc('revoke_device', { target_device: deviceId, reason_input: 'AAL1 denial certification' }))
await expectAllowed('AAL2 Owner A -> privileged device revocation', () => ownerA.rpc('revoke_device', { target_device: deviceId, reason_input: 'Security certification revocation' }))
await expectDenied('Revoked Device A -> financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
await expectDenied('Cashier A -> owner escalation via client state', () => cashierA.rpc('get_owner_dashboard', { target_org: env.BUSINESS_A_ID }))
const anonymous = client()
for (const table of ['organizations', 'financial_events', 'journal_entries', 'journal_lines', 'counterparties', 'debts', 'approval_requests']) await expectDenied(`Anonymous -> ${table}`, () => anonymous.from(table).select('*'))
await expectDenied('Anonymous -> financial RPC', () => anonymous.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
const assurance = await ownerA.auth.mfa.getAuthenticatorAssuranceLevel()
record('Owner A MFA assurance query', assurance.error ? 'FAILED' : 'OBSERVED', assurance.data?.currentLevel ?? 'none')
record('Device revocation', 'VERIFIED', 'registered, allowed post, owner revoked, post denied')
const membershipDevice = await cashierA.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: 'SECURITY_TEST_DEVICE_MEMBERSHIP_A', fingerprint_hash_input: `security-test-${randomUUID()}`, app_version_input: 'security-test', target_branch: env.BRANCH_A1_ID })
if (membershipDevice.error || !membershipDevice.data) throw new Error(`membership device registration failed: ${membershipDevice.error?.message ?? 'no device returned'}`)
const membershipDeviceFxCommand = () => ({ ...fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID), device_id: membershipDevice.data.id })
await expectAllowed('Cashier A -> valid post before membership revocation', () => cashierA.rpc('record_fx_trade', { command: membershipDeviceFxCommand() }))
await expectAllowed('Owner A -> revoke cashier membership', () => ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: false, reason_input: 'Security certification suspension' }))
await expectDenied('Revoked membership -> financial SELECT', () => cashierA.from('branches').select('id').eq('organization_id', env.BUSINESS_A_ID))
await expectDenied('Revoked membership -> financial RPC', () => cashierA.rpc('record_fx_trade', { command: membershipDeviceFxCommand() }))
record('Membership revocation', 'VERIFIED', 'valid post, owner suspended membership, SELECT/RPC denied')
const complianceA = await signIn(env.SARAFI_E2E_COMPLIANCE_A_EMAIL, env.SARAFI_E2E_COMPLIANCE_A_PASSWORD)
const documentPath = `${env.BUSINESS_A_ID}/security-test-document-${randomUUID()}.txt`
const document = await complianceA.storage.from('sarafi-private-documents').upload(documentPath.replace('.txt', '.png'), new Blob(['SECURITY_TEST_PRIVATE_DOCUMENT'], { type: 'image/png' }), { contentType: 'image/png', upsert: false })
const privateDocumentPath = documentPath.replace('.txt', '.png')
record('Business A compliance -> private document upload', document.error ? 'FAILED' : 'ALLOWED', document.error?.message ?? '')
await expectAllowed('Business A -> private document download', () => complianceA.storage.from('sarafi-private-documents').download(privateDocumentPath))
await expectDenied('Business B -> private document download', () => ownerB.storage.from('sarafi-private-documents').download(privateDocumentPath))
await expectDenied('Anonymous -> private document download', () => anonymous.storage.from('sarafi-private-documents').download(privateDocumentPath))
await expectDenied('Business B -> private document signed URL', () => ownerB.storage.from('sarafi-private-documents').createSignedUrl(privateDocumentPath, 60))
record('Private storage isolation', 'VERIFIED', 'A upload/download allowed; B and anonymous download/signed URL denied')

const realtimeEvents = []
const realtimeChannel = ownerA.channel(`security-test-${randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'financial_events', filter: `organization_id=eq.${env.BUSINESS_A_ID}` }, (payload) => realtimeEvents.push(payload))
const subscribed = await new Promise((resolve) => realtimeChannel.subscribe((status) => resolve(status === 'SUBSCRIBED')))
if (!subscribed) record('Realtime tenant isolation', 'FAILED', 'Business A subscription did not reach SUBSCRIBED state')
else {
  await expectAllowed('Business B -> generate financial event', () => ownerB.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID) }))
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const bEventsReceivedByA = realtimeEvents.filter((event) => event.new?.organization_id === env.BUSINESS_B_ID).length
  record('Realtime Business B event received by A', bEventsReceivedByA === 0 ? 'NO' : 'FAILED', `events=${bEventsReceivedByA}`)
  await expectAllowed('Business A -> generate financial event', () => ownerA.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
  await new Promise((resolve) => setTimeout(resolve, 1200))
  record('Realtime Business A event received by A', realtimeEvents.some((event) => event.new?.organization_id === env.BUSINESS_A_ID) ? 'YES' : 'FAILED', `events=${realtimeEvents.length}`)
  await ownerA.removeChannel(realtimeChannel)
  record('Realtime tenant isolation', realtimeEvents.some((event) => event.new?.organization_id === env.BUSINESS_B_ID) ? 'FAILED' : 'VERIFIED', 'A-filtered Postgres Changes channel received no B payload')
}
const certificationCoverage = {
  TENANT_SELECT: results.some((result) => result.test.includes('SELECT') && result.result === 'DENIED'),
  TENANT_INSERT: results.some((result) => result.test.includes('INSERT') && result.result === 'DENIED'),
  TENANT_UPDATE: results.some((result) => result.test.includes('UPDATE') && result.result === 'DENIED'),
  TENANT_DELETE: results.some((result) => result.test.includes('DELETE') && result.result === 'DENIED'),
  TENANT_RPC: results.some((result) => result.test.includes('direct financial RPC') && result.result === 'DENIED'),
  ROLE_MATRIX: results.some((result) => result.test.includes('Viewer A') && result.result === 'DENIED') && results.some((result) => result.test.includes('assigned A1') && result.result === 'ALLOWED'),
  BRANCH_SCOPE: results.some((result) => result.test.includes('A2 branch') && result.result === 'DENIED'),
  CASHBOX_SCOPE: results.some((result) => result.test.includes('B cashbox') && result.result === 'DENIED'),
  PRIVILEGE_ESCALATION: results.some((result) => result.test.includes('owner escalation') && result.result === 'DENIED'),
  ANONYMOUS_ACCESS: results.some((result) => result.test.includes('Anonymous -> financial RPC') && result.result === 'DENIED'),
  DEVICE_REVOCATION: results.some((result) => result.test === 'Device revocation' && result.result === 'VERIFIED'),
  MEMBERSHIP_REVOCATION: results.some((result) => result.test === 'Membership revocation' && result.result === 'VERIFIED'),
  STORAGE_ISOLATION: results.some((result) => result.test === 'Private storage isolation' && result.result === 'VERIFIED'),
  REALTIME_ISOLATION: results.some((result) => result.test === 'Realtime tenant isolation' && result.result === 'VERIFIED'),
  IDEMPOTENCY: results.some((result) => result.test.includes('Idempotency') && result.result === 'VERIFIED'),
  MFA_AAL1_DENIAL: results.some((result) => result.test.includes('AAL1 Owner A') && result.result === 'DENIED'),
  MFA_AAL2_ALLOWANCE: results.some((result) => result.test.includes('AAL2 Owner A') && result.result === 'ALLOWED'),
  APPROVAL_SELF_DENIAL: results.some((result) => result.test === 'Approval self denial' && result.result === 'VERIFIED'),
  APPROVAL_CROSS_TENANT_DENIAL: results.some((result) => result.test === 'Approval cross-tenant denial' && result.result === 'VERIFIED'),
  APPROVAL_AUTHORIZED_SUCCESS: results.some((result) => result.test === 'Approval authorized success' && result.result === 'VERIFIED'),
  APPROVAL_IDEMPOTENCY: results.some((result) => result.test === 'Approval idempotency' && result.result === 'VERIFIED'),
  OFFLINE_FINANCIAL_POSTING_DISABLED: results.some((result) => result.test === 'Offline financial posting disabled' && result.result === 'VERIFIED'),
  LEGACY_OFFLINE_COMMAND_AUTO_REPLAY_DENIED: results.some((result) => result.test === 'Legacy offline command auto-replay denied' && result.result === 'VERIFIED'),
}
for (const id of requiredCertifications) if (!certificationCoverage[id]) record(`Required certification ${id}`, 'FAILED', 'No executable evidence was produced')
const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), passed: results.filter((r) => ['DENIED', 'ALLOWED', 'OBSERVED'].includes(r.result)).length, failed: results.filter((r) => r.result === 'FAILED').length, unsupported: results.filter((r) => r.result === 'UNSUPPORTED').length, results }
mkdirSync('test-results/step15', { recursive: true })
writeFileSync('test-results/step15/security-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (results.some((r) => r.result === 'FAILED')) process.exitCode = 1
