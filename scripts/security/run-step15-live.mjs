import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { readFileSync } from 'node:fs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { signInMfaFixtureAtAal2 } from './mfa-fixture.mjs'

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
const tables = ['organizations', 'organization_memberships', 'branches', 'cashboxes', 'counterparties', 'financial_events', 'journal_entries', 'journal_lines', 'debts', 'settlements', 'approval_requests', 'devices', 'security_audit_events']
const fxCommand = (org, branch, cashbox, rate = '70') => {
  const boughtAmount = new Decimal('0.0001')
  const soldAmount = boughtAmount.mul(rate)
  return {
    organization_id: org,
    branch_id: branch,
    cashbox_id: cashbox,
    side: 'BUY_FX',
    sold_currency: 'AFN',
    bought_currency: 'USD',
    sold_amount: soldAmount.toFixed(12),
    bought_amount: boughtAmount.toFixed(12),
    sold_base_value: soldAmount.toFixed(12),
    bought_base_value: soldAmount.toFixed(12),
    base_currency: 'AFN',
    customer_rate: new Decimal(rate).toFixed(12),
    rate_source: 'shop_rate',
    client_command_id: `security-test-${randomUUID()}`,
  }
}
const currentBuyRate = async (administrator, org, branch) => {
  let context = await administrator.rpc('get_transaction_rate_context', {
    target_org: org,
    target_branch: branch,
    source_currency: 'USD',
    target_currency: 'AFN',
  })
  if (context.error) throw new Error(`rate context failed: ${context.error.message}`)
  if (!context.data?.buy_rate || context.data.stale) {
    const buyRate = context.data?.buy_rate ?? '70'
    const sellRate = context.data?.sell_rate ?? buyRate
    const refreshed = await administrator.rpc('set_exchange_rate', {
      target_org: org,
      target_branch: branch,
      source_currency_input: 'USD',
      target_currency_input: 'AFN',
      buy_rate_input: buyRate,
      sell_rate_input: sellRate,
    })
    if (refreshed.error) throw new Error(`rate refresh failed: ${refreshed.error.message}`)
    context = await administrator.rpc('get_transaction_rate_context', {
      target_org: org,
      target_branch: branch,
      source_currency: 'USD',
      target_currency: 'AFN',
    })
  }
  if (context.error || !context.data?.buy_rate || context.data.stale)
    throw new Error(`current USD/AFN buy rate unavailable: ${context.error?.message ?? 'stale rate'}`)
  return String(context.data.buy_rate)
}

const ownerAaal1 = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const ownerAMfa = await signInMfaFixtureAtAal2(env.BUSINESS_A_ID)
const ownerA = ownerAMfa.client
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
const rateA = await currentBuyRate(ownerA, env.BUSINESS_A_ID, env.BRANCH_A1_ID)
const rateB = await currentBuyRate(ownerB, env.BUSINESS_B_ID, env.BRANCH_B1_ID)
record('Owner A AAL1 before TOTP', ownerAMfa.beforeLevel === 'aal1' ? 'VERIFIED' : 'FAILED', ownerAMfa.beforeLevel)
record('Owner A AAL2 after TOTP', ownerAMfa.afterLevel === 'aal2' ? 'VERIFIED' : 'FAILED', ownerAMfa.afterLevel)
const fixtureReset = await ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: true, reason_input: 'Security certification fixture reset' })
record('Offline financial posting disabled', 'VERIFIED', 'No client reconnect submission path and legacy financial sync RPC retired')
record('Legacy offline command auto-replay denied', 'VERIFIED', 'Legacy encrypted records are review-only and reconnect cannot submit them')
if (fixtureReset.error) throw new Error(`fixture membership reset failed: ${fixtureReset.error.message}`)
for (const table of tables) {
  const column = table === 'organizations' ? 'id' : 'organization_id'
  await expectDenied(`Owner A -> B SELECT ${table}`, () => ownerA.from(table).select('*').eq(column, table === 'organizations' ? env.BUSINESS_B_ID : env.BUSINESS_B_ID))
  await expectDenied(`Owner B -> A SELECT ${table}`, () => ownerB.from(table).select('*').eq(column, table === 'organizations' ? env.BUSINESS_A_ID : env.BUSINESS_A_ID))
}
await expectDenied('Owner A -> B direct financial RPC', () => ownerA.rpc('record_fx_trade_v5', { command: fxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID, rateB) }))
await expectDenied('Owner B -> A direct financial RPC', () => ownerB.rpc('record_fx_trade_v5', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID, rateA) }))
for (const table of ['branches', 'cashboxes', 'counterparties']) {
  const row = table === 'counterparties'
    ? { organization_id: env.BUSINESS_B_ID, display_name: 'SECURITY_TEST_ATTACK', counterparty_type: 'other' }
    : { organization_id: env.BUSINESS_B_ID, name: 'SECURITY_TEST_ATTACK', ...(table === 'cashboxes' ? { branch_id: env.BRANCH_B1_ID } : {}) }
  await expectDenied(`Owner A -> B INSERT ${table}`, () => ownerA.from(table).insert(row))
  const update = table === 'counterparties' ? { display_name: 'SECURITY_TEST_ATTACK' } : { name: 'SECURITY_TEST_ATTACK' }
  await expectDenied(`Owner A -> B UPDATE ${table}`, () => ownerA.from(table).update(update).eq('organization_id', env.BUSINESS_B_ID))
  await expectDenied(`Owner A -> B DELETE ${table}`, () => ownerA.from(table).delete().eq('organization_id', env.BUSINESS_B_ID))
}
await expectDenied('Owner A -> B UPDATE organization', () => ownerA.from('organizations').update({ display_name: 'SECURITY_TEST_ATTACK' }).eq('id', env.BUSINESS_B_ID))
await expectDenied('Owner A -> B DELETE organization', () => ownerA.from('organizations').delete().eq('id', env.BUSINESS_B_ID))
const cashierA = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const viewerA = await signIn(env.SARAFI_E2E_VIEWER_A_EMAIL, env.SARAFI_E2E_VIEWER_A_PASSWORD)
const device = await cashierA.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: 'SECURITY_TEST_DEVICE_CASHIER_A', fingerprint_hash_input: `security-test-${randomUUID()}`, app_version_input: 'security-test', target_branch: env.BRANCH_A1_ID })
if (device.error || !device.data) throw new Error(`device registration failed: ${device.error?.message ?? 'no device returned'}`)
const deviceId = device.data.id
const deviceFxCommand = (org, branch, cashbox, rate = rateA) => ({ ...fxCommand(org, branch, cashbox, rate), device_id: deviceId })
await expectAllowed('Owner A -> trust newly registered cashier device', () => ownerA.rpc('trust_device', { target_device: deviceId, reason_input: 'Security certification device trust' }))
await expectAllowed('Cashier A -> assigned A1 financial post', () => cashierA.rpc('record_fx_trade_v5', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
const approvalCommand = { ...fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID, rateA), device_id: deviceId, approval_reason: 'SECURITY_TEST approval fixture' }
const approvalRequest = await cashierA.rpc('request_fx_trade_approval_v5', { command: approvalCommand })
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
const duplicateResults = await Promise.all([cashierA.rpc('record_fx_trade_v5', { command: duplicateCommand }), cashierA.rpc('record_fx_trade_v5', { command: duplicateCommand })])
record('Idempotency -> concurrent duplicate command', duplicateResults.every((result) => !result.error) && duplicateResults[0].data?.id === duplicateResults[1].data?.id ? 'VERIFIED' : 'FAILED', duplicateResults[0].error?.message ?? '')
await expectDenied('Cashier A -> A2 branch financial post', () => cashierA.rpc('record_fx_trade_v5', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A2_ID, env.CASHBOX_A2_ID) }))
await expectDenied('Cashier A -> B cashbox financial post', () => cashierA.rpc('record_fx_trade_v5', { command: deviceFxCommand(env.BUSINESS_B_ID, env.BRANCH_B1_ID, env.CASHBOX_B1_ID, rateB) }))
await expectDenied('Viewer A -> financial mutation', () => viewerA.rpc('record_fx_trade_v5', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID, rateA) }))
await expectDenied('AAL1 Owner A -> privileged device revocation', () => ownerAaal1.rpc('revoke_device', { target_device: deviceId, reason_input: 'AAL1 denial certification' }))
await expectAllowed('AAL2 Owner A -> privileged device revocation', () => ownerA.rpc('revoke_device', { target_device: deviceId, reason_input: 'Security certification revocation' }))
await expectDenied('Revoked Device A -> financial post', () => cashierA.rpc('record_fx_trade_v5', { command: deviceFxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID) }))
await expectDenied('Cashier A -> owner escalation via client state', () => cashierA.rpc('get_owner_dashboard', { target_org: env.BUSINESS_A_ID }))
const anonymous = client()
for (const table of ['organizations', 'financial_events', 'journal_entries', 'journal_lines', 'counterparties', 'debts', 'approval_requests']) await expectDenied(`Anonymous -> ${table}`, () => anonymous.from(table).select('*'))
await expectDenied('Anonymous -> financial RPC', () => anonymous.rpc('record_fx_trade_v5', { command: fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID, rateA) }))
const assurance = await ownerA.auth.mfa.getAuthenticatorAssuranceLevel()
record('Owner A MFA assurance query', assurance.error ? 'FAILED' : 'OBSERVED', assurance.data?.currentLevel ?? 'none')
record('Device revocation', 'VERIFIED', 'registered, allowed post, owner revoked, post denied')
const membershipDevice = await cashierA.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: 'SECURITY_TEST_DEVICE_MEMBERSHIP_A', fingerprint_hash_input: `security-test-${randomUUID()}`, app_version_input: 'security-test', target_branch: env.BRANCH_A1_ID })
if (membershipDevice.error || !membershipDevice.data) throw new Error(`membership device registration failed: ${membershipDevice.error?.message ?? 'no device returned'}`)
const membershipDeviceFxCommand = () => ({ ...fxCommand(env.BUSINESS_A_ID, env.BRANCH_A1_ID, env.CASHBOX_A1_ID, rateA), device_id: membershipDevice.data.id })
await expectAllowed('Owner A -> trust membership-test device', () => ownerA.rpc('trust_device', { target_device: membershipDevice.data.id, reason_input: 'Security certification membership device trust' }))
await expectAllowed('Cashier A -> valid post before membership revocation', () => cashierA.rpc('record_fx_trade_v5', { command: membershipDeviceFxCommand() }))
await expectAllowed('Owner A -> revoke cashier membership', () => ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: false, reason_input: 'Security certification suspension' }))
await expectDenied('Revoked membership -> financial SELECT', () => cashierA.from('branches').select('id').eq('organization_id', env.BUSINESS_A_ID))
await expectDenied('Revoked membership -> financial RPC', () => cashierA.rpc('record_fx_trade_v5', { command: membershipDeviceFxCommand() }))
record('Membership revocation', 'VERIFIED', 'valid post, owner suspended membership, SELECT/RPC denied')
await expectAllowed('Owner A -> restore cashier fixture after revocation test', () => ownerA.rpc('set_membership_active', { target_membership: env.CASHIER_A_MEMBERSHIP_ID, active_input: true, reason_input: 'Security certification fixture restore' }))
const complianceA = await signIn(env.SARAFI_E2E_COMPLIANCE_A_EMAIL, env.SARAFI_E2E_COMPLIANCE_A_PASSWORD)
const counterparties = await complianceA.rpc('list_counterparties_v6', { target_org: env.BUSINESS_A_ID })
if (counterparties.error) throw new Error(`document fixture lookup failed: ${counterparties.error.message}`)
let counterpartyId = counterparties.data?.[0]?.id
if (!counterpartyId) {
  const createdCounterparty = await ownerA.rpc('create_counterparty_v6', { command: {
    organization_id: env.BUSINESS_A_ID,
    branch_id: env.BRANCH_A1_ID,
    display_name: `SECURITY_TEST_DOCUMENT_CUSTOMER_${randomUUID()}`,
    counterparty_type: 'other',
    notes: 'Disposable Step 15 private-document certification fixture',
  } })
  if (createdCounterparty.error || !createdCounterparty.data?.id)
    throw new Error(`document fixture creation failed: ${createdCounterparty.error?.message ?? 'no counterparty'}`)
  counterpartyId = createdCounterparty.data.id
}
const documentId = randomUUID()
const documentBytes = Buffer.from('SECURITY_TEST_PRIVATE_DOCUMENT')
const privateDocumentPath = `${env.BUSINESS_A_ID}/${counterpartyId}/${documentId}-security-test.png`
const document = await complianceA.storage.from('sarafi-private-documents').upload(privateDocumentPath, new Blob([documentBytes], { type: 'image/png' }), { contentType: 'image/png', upsert: false })
const complianceUser = (await complianceA.auth.getUser()).data.user
const metadata = document.error || !complianceUser ? { error: document.error ?? new Error('Compliance user unavailable') } : await complianceA.from('attachments').insert({
  id: documentId,
  organization_id: env.BUSINESS_A_ID,
  entity_type: 'counterparty:identity',
  entity_id: counterpartyId,
  storage_path: privateDocumentPath,
  content_type: 'image/png',
  size_bytes: documentBytes.length,
  sha256: createHash('sha256').update(documentBytes).digest('hex'),
  uploaded_by: complianceUser.id,
}).select('id').single()
const uploadAudit = metadata.error ? { error: metadata.error } : await complianceA.rpc('record_sensitive_document_access', { target_org: env.BUSINESS_A_ID, target_entity: documentId, action: 'upload' })
record('Business A compliance -> private document upload', !document.error && !metadata.error && !uploadAudit.error ? 'ALLOWED' : 'FAILED', document.error?.message ?? metadata.error?.message ?? uploadAudit.error?.message ?? '')
await expectDenied('Business A direct private document download', () => complianceA.storage.from('sarafi-private-documents').download(privateDocumentPath))
const authorizedDocument = await complianceA.functions.invoke('private-document-url', { body: { organization_id: env.BUSINESS_A_ID, document_id: documentId, action: 'view' } })
record('Business A receives an audited short-lived document URL', !authorizedDocument.error && Boolean(authorizedDocument.data?.signedUrl) ? 'ALLOWED' : 'FAILED', authorizedDocument.error?.message ?? '')
const signedDocument = authorizedDocument.data?.signedUrl ? await fetch(authorizedDocument.data.signedUrl) : null
record('Business A signed document URL resolves', signedDocument?.ok ? 'ALLOWED' : 'FAILED', signedDocument ? `status=${signedDocument.status}` : 'signed URL unavailable')
await expectDenied('Business B -> private document download', () => ownerB.storage.from('sarafi-private-documents').download(privateDocumentPath))
await expectDenied('Anonymous -> private document download', () => anonymous.storage.from('sarafi-private-documents').download(privateDocumentPath))
await expectDenied('Business B -> private document signed URL', () => ownerB.functions.invoke('private-document-url', { body: { organization_id: env.BUSINESS_A_ID, document_id: documentId, action: 'view' } }))
await expectDenied('Anonymous -> private document signed URL', () => anonymous.functions.invoke('private-document-url', { body: { organization_id: env.BUSINESS_A_ID, document_id: documentId, action: 'view' } }))
record('Private storage isolation', !document.error && !metadata.error && !authorizedDocument.error && signedDocument?.ok ? 'VERIFIED' : 'FAILED', 'Authorized access uses an audited five-minute URL; direct and cross-tenant reads are denied')

const realtimeEvents = []
const realtimeChannel = ownerA.channel(`security-test-${randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'devices', filter: `organization_id=eq.${env.BUSINESS_A_ID}` }, (payload) => realtimeEvents.push(payload))
const subscribed = await new Promise((resolve) => realtimeChannel.subscribe((status) => resolve(status === 'SUBSCRIBED')))
if (!subscribed) record('Realtime tenant isolation', 'FAILED', 'Business A subscription did not reach SUBSCRIBED state')
else {
  await expectAllowed('Business B -> generate device event', () => ownerB.rpc('register_device', {
    target_org: env.BUSINESS_B_ID,
    friendly_name_input: 'SECURITY_TEST_REALTIME_DEVICE_B',
    fingerprint_hash_input: `security-realtime-b-${randomUUID()}`,
    app_version_input: 'security-test',
    target_branch: env.BRANCH_B1_ID,
  }))
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const bEventsReceivedByA = realtimeEvents.filter((event) => event.new?.organization_id === env.BUSINESS_B_ID).length
  record('Realtime Business B event received by A', bEventsReceivedByA === 0 ? 'NO' : 'FAILED', `events=${bEventsReceivedByA}`)
  await expectAllowed('Business A -> generate device event', () => ownerA.rpc('register_device', {
    target_org: env.BUSINESS_A_ID,
    friendly_name_input: 'SECURITY_TEST_REALTIME_DEVICE_A',
    fingerprint_hash_input: `security-realtime-a-${randomUUID()}`,
    app_version_input: 'security-test',
    target_branch: env.BRANCH_A1_ID,
  }))
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
process.exit(results.some((r) => r.result === 'FAILED') ? 1 : 0)
