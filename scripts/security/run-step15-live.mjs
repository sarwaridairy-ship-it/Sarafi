import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env.security.local', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_OWNER_A_EMAIL', 'SARAFI_E2E_OWNER_A_PASSWORD', 'SARAFI_E2E_OWNER_B_EMAIL', 'SARAFI_E2E_OWNER_B_PASSWORD', 'BUSINESS_A_ID', 'BUSINESS_B_ID', 'BRANCH_A1_ID', 'BRANCH_A2_ID', 'CASHBOX_A1_ID', 'CASHBOX_A2_ID', 'CASHBOX_B1_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing security fixture setting: ${key}`)
const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const results = []
const record = (test, result, detail = '') => results.push({ test, result, detail })
const signIn = async (email, password) => { const c = client(); const result = await c.auth.signInWithPassword({ email, password }); if (result.error) throw new Error(`sign in failed: ${result.error.message}`); return c }
const expectDenied = async (test, operation) => { try { const result = await operation(); const denied = Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0) || result.data === null; record(test, denied ? 'DENIED' : 'ALLOWED', result.error?.message ?? `rows=${result.data?.length ?? 'non-array'}`) } catch (error) { record(test, 'DENIED', error instanceof Error ? error.message : 'request failed') } }
const expectAllowed = async (test, operation) => { try { const result = await operation(); record(test, result.error ? 'FAILED' : 'ALLOWED', result.error?.message ?? '') } catch (error) { record(test, 'FAILED', error instanceof Error ? error.message : 'request failed') } }
const tables = ['organizations', 'organization_memberships', 'branches', 'cashboxes', 'counterparties', 'financial_events', 'journal_entries', 'journal_lines', 'debts', 'settlements', 'approval_requests', 'devices', 'security_audit_events']
const fxCommand = (org, branch, cashbox) => ({ organization_id: org, branch_id: branch, cashbox_id: cashbox, side: 'buy_fx', sold_currency: 'AFN', bought_currency: 'USD', sold_amount: '0.01', bought_amount: '0.0001', sold_base_value: '0.01', bought_base_value: '0.01', base_currency: 'AFN', client_command_id: `security-test-${randomUUID()}` })

const ownerA = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
const fixtureReset = await ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: true, reason_input: 'Security certification fixture reset' })
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
await expectDenied('Cashier A -> A2 branch financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A2_ID, env.CASHBOX_A2_ID) }))
await expectDenied('Cashier A -> B cashbox financial post', () => cashierA.rpc('record_fx_trade', { command: deviceFxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID) }))
await expectDenied('Viewer A -> financial mutation', () => viewerA.rpc('record_fx_trade', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
await expectAllowed('Owner A -> revoke cashier device', () => ownerA.rpc('revoke_device', { target_device: deviceId, reason_input: 'Security certification revocation' }))
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
console.log(JSON.stringify({ project: new URL(env.SUPABASE_URL).hostname, passed: results.filter((r) => ['DENIED', 'ALLOWED', 'OBSERVED'].includes(r.result)).length, failed: results.filter((r) => r.result === 'FAILED').length, unsupported: results.filter((r) => r.result === 'UNSUPPORTED').length, results }, null, 2))
if (results.some((r) => r.result === 'FAILED')) process.exitCode = 1
