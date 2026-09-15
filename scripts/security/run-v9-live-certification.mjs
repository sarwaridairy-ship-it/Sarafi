import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Decimal from 'decimal.js'
import { createClient } from '@supabase/supabase-js'
import { signInMfaFixtureAtAal2 } from './mfa-fixture.mjs'

const readEnv = (path) => Object.fromEntries(
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)

const env = { ...readEnv(process.env.SARAFI_SECURITY_ENV ?? '.env.security.local'), ...process.env }
for (const key of [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SARAFI_E2E_OWNER_A_EMAIL',
  'SARAFI_E2E_OWNER_A_PASSWORD',
  'SARAFI_E2E_OWNER_B_EMAIL',
  'SARAFI_E2E_OWNER_B_PASSWORD',
  'SARAFI_E2E_CASHIER_A_EMAIL',
  'SARAFI_E2E_CASHIER_A_PASSWORD',
  'SARAFI_E2E_CASHIER_B_EMAIL',
  'SARAFI_E2E_CASHIER_B_PASSWORD',
  'BUSINESS_A_ID',
  'BUSINESS_B_ID',
  'BRANCH_A1_ID',
  'BRANCH_B1_ID',
  'CASHBOX_B1_ID',
]) if (!env[key]) throw new Error(`Missing v9 certification setting: ${key}`)

const makeClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const signIn = async (email, password) => {
  const client = makeClient()
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error) throw new Error(`Fixture sign-in failed: ${result.error.message}`)
  return client
}

const results = []
const pass = (name, detail = '') => results.push({ name, result: 'PASS', detail })
const requireResult = (condition, name, detail = '') => {
  if (!condition) throw new Error(`${name}: ${detail || 'condition was false'}`)
  pass(name, detail)
}
const rpc = async (client, functionName, args, label = functionName) => {
  const result = await client.rpc(functionName, args)
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data
}

const decodeBase32 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = value.replace(/=+$/, '').toUpperCase().split('')
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('')
  return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)))
}

const totp = (secret, time = Date.now()) => {
  const counter = Math.floor(time / 1000 / 30)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

const elevateWithTemporaryTotp = async (client, friendlyName) => {
  const enrollment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  if (enrollment.error || !enrollment.data?.id || !enrollment.data.totp?.secret)
    throw new Error(`${friendlyName} MFA enrollment failed: ${enrollment.error?.message ?? 'missing factor data'}`)
  const factorId = enrollment.data.id
  let verified = false
  let lastError = null
  for (const offset of [0, -30_000, 30_000]) {
    const challenge = await client.auth.mfa.challenge({ factorId })
    if (challenge.error) throw new Error(`${friendlyName} MFA challenge failed: ${challenge.error.message}`)
    const verification = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: totp(enrollment.data.totp.secret, Date.now() + offset),
    })
    if (!verification.error) { verified = true; break }
    lastError = verification.error
  }
  if (!verified) throw new Error(`${friendlyName} MFA verification failed: ${lastError?.message ?? 'unknown error'}`)
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance.error || assurance.data?.currentLevel !== 'aal2')
    throw new Error(`${friendlyName} did not reach AAL2`)
  return factorId
}

const invokeAppLock = async (client, body, label) => {
  const session = await client.auth.getSession()
  if (!session.data.session) throw new Error(`${label}: authenticated session is unavailable`)
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/app-lock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.data.session.access_token}`,
      apikey: env.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  let data = {}
  try { data = await response.json() } catch { /* use the HTTP status below */ }
  if (!response.ok || data.error) throw new Error(`${label}: ${data.error ?? `HTTP ${response.status}`}`)
  return data
}

const ensureBranch = async (owner, organizationId, name) => {
  const context = await rpc(owner, 'get_my_workspace_context', {}, 'Load workspace context')
  const organization = context.find((item) => item.organization_id === organizationId)
  let branch = organization?.branches?.find((item) => item.name === name)
  if (!branch) branch = await rpc(owner, 'create_organization_branch', {
    target_org: organizationId,
    name_input: name,
    timezone_input: 'Asia/Kabul',
  }, 'Create v9 certification branch')
  return branch
}

const ensureCashbox = async (owner, organizationId, branchId, name) => {
  const control = await rpc(owner, 'get_organization_control_plane', { target_org: organizationId }, 'Load organization controls')
  let cashbox = control.cashboxes.find((item) => item.branch_id === branchId && item.name === name && item.active)
  if (!cashbox) cashbox = await rpc(owner, 'create_organization_cashbox', {
    target_org: organizationId,
    target_branch: branchId,
    name_input: name,
  }, 'Create v9 certification cashbox')
  return cashbox
}

const ensurePartner = async (owner, organizationId, branchId, name) => {
  let partners = await rpc(owner, 'get_hawala_partners', { target_org: organizationId }, 'Load Hawala partners')
  let partner = partners.find((item) => item.name === name)
  if (!partner) {
    await rpc(owner, 'create_counterparty_v6', { command: {
      organization_id: organizationId,
      branch_id: branchId,
      display_name: name,
      counterparty_type: 'hawala_partner',
      phone: null,
      notes: 'Authenticated v9 exact-recipient certification fixture',
    } }, 'Create exact Hawala partner')
    partners = await rpc(owner, 'get_hawala_partners', { target_org: organizationId }, 'Reload Hawala partners')
    partner = partners.find((item) => item.name === name)
  }
  if (!partner) throw new Error(`Auto-created Hawala partner was not returned: ${name}`)
  return partner
}

const ensureCertificationCompliancePolicy = async (owner, organizationId) => {
  const active = await owner.from('compliance_rule_sets').select('id,version').eq('organization_id', organizationId).eq('status', 'active').limit(1).maybeSingle()
  if (active.error) throw new Error(`Read active compliance rule set: ${active.error.message}`)
  if (active.data) return active.data
  return rpc(owner, 'configure_compliance_rule_set_v9', { command: {
    organization_id: organizationId,
    version: `security-test-v9-${Date.now()}`,
    source_reference: 'Authenticated v9 certification fixture; not legal guidance',
    transaction_threshold_afn: '1000000000000',
    aggregation_window_hours: '24',
    kyc_threshold_afn: '2000000000000',
    edd_threshold_afn: '3000000000000',
    retention_years: '7',
    required_documents: [],
    screening_required: false,
  } }, 'Activate explicit compliance policy for certification tenant')
}

const ownerA = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
const cashierA = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const cashierB = await signIn(env.SARAFI_E2E_CASHIER_B_EMAIL, env.SARAFI_E2E_CASHIER_B_PASSWORD)
const mfaOwnerA = (await signInMfaFixtureAtAal2(env.BUSINESS_A_ID)).client

let ownerFactorId = null
let cashierFactorId = null
let senderDeviceId = null
let cashierDeviceId = null
let appLockConfigured = false

try {
  const valuationBranch = await ensureBranch(ownerB, env.BUSINESS_B_ID, 'SECURITY_TEST_V9_VALUATION_BRANCH')
  const valuationCashbox = await ensureCashbox(ownerB, env.BUSINESS_B_ID, valuationBranch.id, 'SECURITY_TEST_V9_VALUATION_CASHBOX')
  const accounts = await rpc(ownerB, 'get_money_accounts', { target_org: env.BUSINESS_B_ID }, 'Load valuation accounts')
  const valuationAccount = accounts.find((item) => item.cashbox_id === valuationCashbox.id)
  requireResult(Boolean(valuationAccount), 'Dedicated valuation money account exists')

  for (const currency of ['USD', 'TRY']) await rpc(ownerB, 'set_organization_currency', {
    target_org: env.BUSINESS_B_ID,
    target_currency: currency,
    enabled_input: true,
  }, `Enable ${currency}`)

  let control = await rpc(ownerB, 'get_organization_control_plane', { target_org: env.BUSINESS_B_ID }, 'Reload rate controls')
  let rateGroup = control.rate_groups.find((item) => item.code === 'security-test-v9')
  if (!rateGroup) rateGroup = await rpc(ownerB, 'create_rate_group', {
    target_org: env.BUSINESS_B_ID,
    name_input: 'SECURITY_TEST_V9 DAILY BOARD',
    code_input: 'security-test-v9',
  }, 'Create v9 daily board')
  for (const [currency, rate] of [['USD', '64'], ['TRY', '1.3']]) await rpc(ownerB, 'set_rate_group_exchange_rate', {
    target_org: env.BUSINESS_B_ID,
    target_group: rateGroup.id,
    target_branch: valuationBranch.id,
    source_currency: currency,
    target_currency: 'AFN',
    buy_rate_input: rate,
    sell_rate_input: rate,
    spread_tolerance_input: '0',
  }, `Set current ${currency}/AFN daily rate`)

  for (const [currency, amount, baseValue] of [
    ['AFN', '2000', '2000'],
    ['TRY', '2000', '2600'],
    ['USD', '100', '6400'],
  ]) await rpc(ownerB, 'record_opening_balance', { command: {
    organization_id: env.BUSINESS_B_ID,
    branch_id: valuationBranch.id,
    cashbox_id: valuationCashbox.id,
    currency,
    amount,
    base_value: baseValue,
    memo: `Authenticated v9 valuation fixture ${currency}`,
    client_command_id: `v9-exact-valuation-${currency.toLowerCase()}`,
  } }, `Record ${currency} valuation fixture`)

  const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const snapshot = await rpc(ownerB, 'get_money_valuation_snapshot', {
    target_org: env.BUSINESS_B_ID,
    target_business_date: businessDate,
    target_comparison_currency: 'USD',
    target_scope: { branch_id: valuationBranch.id, cashbox_id: valuationCashbox.id },
  }, 'Load exact authenticated valuation snapshot')
  requireResult(snapshot.total_complete === true, 'My Money fixture is complete')
  requireResult(new Decimal(snapshot.totals.available_base).eq(11000), 'My Money server total is exactly 11,000 AFN', `${snapshot.totals.available_base} AFN`)
  requireResult(new Decimal(snapshot.totals.comparison_value).eq('171.875'), 'My Money server comparison is exactly 171.875 USD', `${snapshot.totals.comparison_value} USD`)
  requireResult(snapshot.valuation_rate_source === 'daily_rate_board', 'My Money uses the active daily rate board', snapshot.active_rate_board)

  const unrelatedRecipientBranch = await ensureBranch(ownerB, env.BUSINESS_B_ID, 'SECURITY_TEST_V9_UNRELATED_BRANCH')
  ownerFactorId = await elevateWithTemporaryTotp(ownerB, 'V9_OWNER_B_HAWALA_FEATURE')
  for (const [owner, organizationId] of [[mfaOwnerA, env.BUSINESS_A_ID], [ownerB, env.BUSINESS_B_ID]]) {
    await rpc(owner, 'set_organization_feature_state', {
      target_org: organizationId,
      feature_input: 'hawala',
      enabled_input: true,
    }, 'Enable Hawala for the authenticated certification fixture')
    await ensureCertificationCompliancePolicy(owner, organizationId)
  }
  const partnerA = await ensurePartner(ownerA, env.BUSINESS_A_ID, env.BRANCH_A1_ID, 'SECURITY_TEST_V9 RAHIMI EXCHANGE')
  const partnerB = await ensurePartner(ownerB, env.BUSINESS_B_ID, env.BRANCH_B1_ID, 'SECURITY_TEST_V9 KABUL CENTRAL')
  await rpc(ownerA, 'configure_hawala_partner_endpoint_v7', {
    target_org: env.BUSINESS_A_ID,
    target_partner: partnerA.id,
    endpoint_kind: 'external_partner',
    destination_org: env.BUSINESS_B_ID,
    destination_branch: env.BRANCH_B1_ID,
    destination_partner: partnerB.id,
  }, 'Configure Kabul to Herat endpoint')
  await rpc(ownerB, 'configure_hawala_partner_endpoint_v7', {
    target_org: env.BUSINESS_B_ID,
    target_partner: partnerB.id,
    endpoint_kind: 'external_partner',
    destination_org: env.BUSINESS_A_ID,
    destination_branch: env.BRANCH_A1_ID,
    destination_partner: partnerA.id,
  }, 'Configure reciprocal Herat endpoint')
  pass('Exact reciprocal Hawala endpoints are verified', 'Kabul sender → Herat recipient')

  const cashierAAccounts = await rpc(cashierA, 'get_money_accounts', { target_org: env.BUSINESS_A_ID }, 'Load Kabul money accounts')
  const senderAccount = cashierAAccounts.find((item) => item.branch_id === env.BRANCH_A1_ID && item.active !== false)
  requireResult(Boolean(senderAccount), 'Kabul sender account is available')
  const suffix = randomUUID().slice(0, 8).toUpperCase()
  const senderDevice = await rpc(cashierA, 'register_device', {
    target_org: env.BUSINESS_A_ID,
    friendly_name_input: `V9_KABUL_CASHIER_${suffix}`,
    fingerprint_hash_input: `v9-kabul-cashier-${randomUUID()}`,
    app_version_input: 'v9-live-certification',
    target_branch: env.BRANCH_A1_ID,
  }, 'Register Kabul Cashier test device')
  senderDeviceId = senderDevice.id
  await rpc(mfaOwnerA, 'trust_device', { target_device: senderDeviceId, reason_input: 'Authenticated v9 Hawala sender certification' }, 'Trust Kabul Cashier device')
  const beneficiary = `Ahmad Rahimi V9 ${suffix}`
  const transfer = await rpc(cashierA, 'record_hawala_send_v7', { command: {
    organization_id: env.BUSINESS_A_ID,
    branch_id: env.BRANCH_A1_ID,
    hawala_partner_id: partnerA.id,
    sender_name: 'Kabul Cashier Certification Sender',
    beneficiary_name: beneficiary,
    destination_location: 'Herat Main',
    currency: 'AFN',
    amount: '1',
    fee: '0',
    device_id: senderDeviceId,
    destination_money_account_id: senderAccount.id,
    memo: 'Authenticated v9 exact-recipient certification',
    client_command_id: `v9-hawala-send-${suffix.toLowerCase()}`,
  } }, 'Send authenticated Kabul to Herat Hawala')
  requireResult(transfer.recipient_organization_id === env.BUSINESS_B_ID && transfer.recipient_branch_id === env.BRANCH_B1_ID, 'Hawala binds the exact recipient organization and branch')

  const senderRows = await rpc(cashierA, 'list_hawala_transfers_v7', { target_org: env.BUSINESS_A_ID, target_branch: env.BRANCH_A1_ID }, 'List Kabul sender Hawalas')
  requireResult(senderRows.some((item) => item.id === transfer.id && item.direction === 'outgoing'), 'Kabul sender sees the transfer in Sent')
  const recipientRows = await rpc(cashierB, 'list_hawala_transfers_v7', { target_org: env.BUSINESS_B_ID, target_branch: env.BRANCH_B1_ID }, 'List Herat recipient Hawalas')
  requireResult(recipientRows.some((item) => item.id === transfer.id && item.direction === 'incoming'), 'Herat recipient sees the transfer in Received')
  const unrelatedRows = await rpc(ownerB, 'list_hawala_transfers_v7', { target_org: env.BUSINESS_B_ID, target_branch: unrelatedRecipientBranch.id }, 'List unrelated branch Hawalas')
  requireResult(!unrelatedRows.some((item) => item.id === transfer.id), 'Unrelated recipient branch cannot see the transfer')
  const crossTenantRows = await rpc(cashierA, 'list_hawala_transfers_v7', { target_org: env.BUSINESS_B_ID, target_branch: env.BRANCH_B1_ID }, 'Probe cross-tenant Hawala isolation')
  requireResult(!crossTenantRows.some((item) => item.id === transfer.id), 'Sender cannot impersonate the recipient tenant')

  const senderReadyAttempt = await cashierA.rpc('transition_hawala_status_v7', { command: {
    organization_id: env.BUSINESS_A_ID,
    transfer_id: transfer.id,
    status: 'ready',
    reason: 'Authenticated v9 sender denial check',
  } })
  requireResult(Boolean(senderReadyAttempt.error), 'Only the exact recipient can mark Hawala ready')
  await rpc(cashierB, 'transition_hawala_status_v7', { command: {
    organization_id: env.BUSINESS_B_ID,
    transfer_id: transfer.id,
    status: 'acknowledged',
    reason: 'Recipient matched the exact Hawala',
  } }, 'Recipient acknowledges Hawala')
  await rpc(cashierB, 'transition_hawala_status_v7', { command: {
    organization_id: env.BUSINESS_B_ID,
    transfer_id: transfer.id,
    status: 'ready',
    reason: 'Recipient completed identity pre-check',
  } }, 'Recipient readies Hawala')
  const readyRows = await rpc(cashierB, 'list_hawala_transfers_v7', { target_org: env.BUSINESS_B_ID, target_branch: env.BRANCH_B1_ID }, 'Reload ready Hawalas')
  requireResult(readyRows.some((item) => item.id === transfer.id && item.beneficiary_name === beneficiary), 'Beneficiary-name search source returns the exact Hawala')
  const payoutSearch = await rpc(cashierB, 'find_hawala_payout', { target_org: env.BUSINESS_B_ID, reference_code_input: transfer.reference_code }, 'Search payout by Hawala number')
  requireResult(payoutSearch?.transfer_id === transfer.id, 'Hawala-number search returns the exact Hawala', transfer.reference_code)

  const directPaid = await cashierB.rpc('transition_hawala_status_v7', { command: {
    organization_id: env.BUSINESS_B_ID,
    transfer_id: transfer.id,
    status: 'paid',
    reason: 'Authenticated v9 direct Paid denial check',
  } })
  requireResult(Boolean(directPaid.error), 'Paid cannot be set by a status transition')

  const cashierContext = await rpc(cashierB, 'get_my_workspace_context', {}, 'Load Cashier capabilities')
  const cashierMembership = cashierContext.find((item) => item.organization_id === env.BUSINESS_B_ID)
  for (const capability of ['app_lock.self.manage', 'app_lock.unlock', 'app_lock.sensitive_action'])
    requireResult(cashierMembership?.capabilities?.includes(capability), `Cashier has ${capability}`)
  requireResult(!cashierMembership?.capabilities?.includes('app_lock.policy.manage'), 'Cashier cannot manage organization App Lock policy')

  const device = await rpc(cashierB, 'register_device', {
    target_org: env.BUSINESS_B_ID,
    friendly_name_input: `V9_CASHIER_${suffix}`,
    fingerprint_hash_input: `v9-cashier-${randomUUID()}`,
    app_version_input: 'v9-live-certification',
    target_branch: env.BRANCH_B1_ID,
  }, 'Register Cashier test device')
  cashierDeviceId = device.id
  await rpc(ownerB, 'trust_device', { target_device: cashierDeviceId, reason_input: 'Authenticated v9 Cashier App Lock certification' }, 'Trust Cashier device')
  cashierFactorId = await elevateWithTemporaryTotp(cashierB, `V9_CASHIER_LOCK_${suffix}`)
  const assurance = await cashierB.auth.mfa.getAuthenticatorAssuranceLevel()
  requireResult(assurance.data?.currentLevel === 'aal2', 'Cashier reached AAL2 for personal App Lock setup')

  const testPin = '618204'
  await invokeAppLock(cashierB, {
    action: 'configure', organization_id: env.BUSINESS_B_ID, device_id: cashierDeviceId,
    pin: testPin, auto_lock_seconds: 30, lock_on_background: true,
  }, 'Cashier configures personal App Lock')
  appLockConfigured = true
  const lockStatus = await invokeAppLock(cashierB, { action: 'status', organization_id: env.BUSINESS_B_ID, device_id: cashierDeviceId }, 'Read Cashier App Lock status')
  requireResult(lockStatus.configured === true && lockStatus.autoLockSeconds === 30 && lockStatus.lockOnBackground === true, 'Cashier configures own six-digit PIN and lock policy')
  const unlock = await invokeAppLock(cashierB, { action: 'verify', organization_id: env.BUSINESS_B_ID, device_id: cashierDeviceId, pin: testPin }, 'Unlock Cashier App Lock')
  requireResult(Boolean(unlock.grant && unlock.expiresAt), 'Cashier PIN issues a fresh sensitive-action grant')

  const recipientAccounts = await rpc(ownerB, 'get_money_accounts', { target_org: env.BUSINESS_B_ID }, 'Load Herat payout accounts')
  const payoutAccount = recipientAccounts.find((item) => item.cashbox_id === env.CASHBOX_B1_ID)
  requireResult(Boolean(payoutAccount), 'Herat payout cashbox account is available')
  const payoutBalance = new Decimal(payoutAccount.balances?.find((item) => item.currency === 'AFN')?.amount ?? 0)
  if (payoutBalance.lt(2)) await rpc(ownerB, 'record_opening_balance', { command: {
    organization_id: env.BUSINESS_B_ID,
    branch_id: env.BRANCH_B1_ID,
    cashbox_id: env.CASHBOX_B1_ID,
    currency: 'AFN',
    amount: '10',
    base_value: '10',
    memo: 'Authenticated v9 payout fixture money',
    client_command_id: `v9-payout-opening-${suffix.toLowerCase()}`,
  } }, 'Fund Herat payout test cashbox')

  const payoutDraft = await rpc(cashierB, 'begin_hawala_payout_v9', { command: {
    organization_id: env.BUSINESS_B_ID,
    transfer_id: transfer.id,
    device_id: cashierDeviceId,
    client_command_id: `v9-payout-${suffix.toLowerCase()}`,
  } }, 'Begin recoverable payout draft')
  const payoutCommand = {
    organization_id: env.BUSINESS_B_ID,
    payout_draft_id: payoutDraft.id,
    transfer_id: transfer.id,
    reference_code: transfer.reference_code,
    money_account_id: payoutAccount.id,
    device_id: cashierDeviceId,
    app_unlock_grant: unlock.grant,
    identity_confirmed: true,
    recipient_identity_reference: `SECURITY_TEST_V9_${suffix}`,
    client_command_id: payoutDraft.client_command_id,
  }
  const missingEvidence = await cashierB.rpc('complete_hawala_payout_v9', { command: payoutCommand })
  requireResult(Boolean(missingEvidence.error && /IDENTITY_DOCUMENTS_REQUIRED/.test(missingEvidence.error.message)), 'Payout is blocked before Tazkira evidence')

  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const documentId = randomUUID()
  const storagePath = `${env.BUSINESS_B_ID}/${payoutDraft.id}/${documentId}.png`
  const upload = await cashierB.storage.from('sarafi-private-documents').upload(storagePath, image, { contentType: 'image/png', upsert: false })
  if (upload.error) throw new Error(`Upload one-photo Tazkira fixture: ${upload.error.message}`)
  const user = (await cashierB.auth.getUser()).data.user
  const attachment = await cashierB.from('attachments').insert({
    id: documentId,
    organization_id: env.BUSINESS_B_ID,
    entity_type: 'hawala_payout_draft:tazkira_front',
    entity_id: payoutDraft.id,
    storage_path: storagePath,
    content_type: 'image/png',
    size_bytes: image.length,
    sha256: createHash('sha256').update(image).digest('hex'),
    uploaded_by: user.id,
  }).select('id').single()
  if (attachment.error) {
    await cashierB.storage.from('sarafi-private-documents').remove([storagePath])
    throw new Error(`Record one-photo Tazkira fixture: ${attachment.error.message}`)
  }
  pass('One private Tazkira image is attached to the exact payout draft')

  const paid = await rpc(cashierB, 'complete_hawala_payout_v9', { command: payoutCommand }, 'Complete exact Hawala payout')
  requireResult(paid.id === transfer.id && paid.status === 'paid' && paid.payout_journal_entry_id && paid.payout_receipt_id, 'Only payout completes Paid with journal and receipt')
  const retry = await rpc(cashierB, 'complete_hawala_payout_v9', { command: payoutCommand }, 'Retry exact Hawala payout')
  requireResult(retry.id === paid.id && retry.payout_journal_entry_id === paid.payout_journal_entry_id, 'Payout retry is idempotent and does not pay twice')
  const notifications = await cashierB.from('notifications').select('subject_id,notification_type').eq('organization_id', env.BUSINESS_B_ID).eq('subject_id', transfer.id)
  if (notifications.error) throw new Error(`Read recipient notifications: ${notifications.error.message}`)
  requireResult(notifications.data.length > 0, 'Exact recipient received a branch-scoped Hawala notification')
} finally {
  if (appLockConfigured && cashierDeviceId) {
    await cashierB.functions.invoke('app-lock', { body: { action: 'disable', organization_id: env.BUSINESS_B_ID, device_id: cashierDeviceId } })
  }
  if (senderDeviceId) await mfaOwnerA.rpc('revoke_device', { target_device: senderDeviceId, reason_input: 'Completed authenticated v9 certification' })
  if (cashierDeviceId && ownerFactorId) await ownerB.rpc('revoke_device', { target_device: cashierDeviceId, reason_input: 'Completed authenticated v9 certification' })
  if (cashierFactorId) await cashierB.auth.mfa.unenroll({ factorId: cashierFactorId })
  if (ownerFactorId) await ownerB.auth.mfa.unenroll({ factorId: ownerFactorId })
  await Promise.allSettled([ownerA.auth.signOut(), ownerB.auth.signOut(), cashierA.auth.signOut(), cashierB.auth.signOut(), mfaOwnerA.auth.signOut()])
}

console.log(JSON.stringify({
  summary: `${results.length}/${results.length} authenticated v9 checks passed`,
  results,
}, null, 2))
