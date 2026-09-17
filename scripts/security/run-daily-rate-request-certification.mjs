import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { readEnvFile, signInMfaFixtureAtAal2 } from './mfa-fixture.mjs'

const env = { ...readEnvFile('.env.security.local'), ...process.env }
const results = []
const clients = []
let owner
let testDeviceId
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail })
  if (!passed) throw new Error(`${name}: ${detail}`)
}
const signIn = async (role) => {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  clients.push(client)
  const auth = await client.auth.signInWithPassword({ email: env[`SARAFI_E2E_${role}_EMAIL`], password: env[`SARAFI_E2E_${role}_PASSWORD`] })
  if (auth.error) throw new Error(`Fixture sign-in: ${auth.error.message}`)
  return client
}
try {
  const cashier = await signIn('CASHIER_A')
  const viewer = await signIn('VIEWER_A')
  const outsider = await signIn('OWNER_B')
  owner = (await signInMfaFixtureAtAal2(env.BUSINESS_A_ID)).client
  clients.push(owner)
  const business = await owner.from('organizations').select('display_name').eq('id', env.BUSINESS_A_ID).single()
  check('Only disposable security business is changed', !business.error && /^SECURITY_TEST_/.test(business.data?.display_name ?? ''))
  const scope = { target_org: env.BUSINESS_A_ID, target_branch: env.BRANCH_A1_ID, source_currency: 'USD', target_currency: 'AFN' }
  const before = await cashier.rpc('get_transaction_rate_context', scope)
  check('Rate context available', !before.error, before.error?.message)
  const buy = before.data.buy_rate ?? '70.25'
  const sell = before.data.sell_rate ?? '70.35'
  const command = { organization_id: env.BUSINESS_A_ID, branch_id: env.BRANCH_A1_ID, source_currency: 'USD', target_currency: 'AFN', context_id: before.data.context_id }
  const requested = await Promise.all([cashier.rpc('request_operation_rate_approval_v10', { command }), cashier.rpc('request_operation_rate_approval_v10', { command })])
  check('Concurrent rate requests deduplicate', requested.every((r) => !r.error) && requested[0].data?.id === requested[1].data?.id, requested.map((r) => r.error?.message ?? r.data?.id).join(' | '))
  const id = requested[0].data.id
  const inbox = await owner.rpc('get_team_control_plane', { target_org: env.BUSINESS_A_ID })
  const review = inbox.data?.approvals?.find((item) => item.id === id)
  check('Manager sees the exact branch before publishing', !inbox.error && review?.branch_id === env.BRANCH_A1_ID && Boolean(review.branch_name) && review.is_current_requester === false, inbox.error?.message)
  const resolve = (client, buyRate = buy, sellRate = sell) => client.rpc('resolve_operation_rate_request_v11', { target_request: id, buy_rate_input: buyRate, sell_rate_input: sellRate, decision_reason_input: 'Disposable launch certification daily rate refresh' })
  for (const [name, client] of [['Requester cannot approve own rate', cashier], ['Viewer cannot approve', viewer], ['Other tenant cannot approve', outsider]]) {
    const denied = await resolve(client)
    check(name, Boolean(denied.error), denied.error?.message)
  }
  const leaked = await outsider.rpc('get_my_operation_rate_request_v11', { target_request: id })
  check('Other tenant cannot read request status', Boolean(leaked.error))
  const emptyDecision = await owner.rpc('decide_approval', { target_id: id, decision: 'approved', decision_reason_input: 'Must publish a real daily rate' })
  check('Generic approval cannot leave an unresolved rate', Boolean(emptyDecision.error?.message.includes('DAILY_RATE_UPDATE_REQUIRED')), emptyDecision.error?.message)
  const nan = await resolve(owner, 'NaN', sell)
  check('Non-finite rate is rejected', Boolean(nan.error?.message.includes('RATE_INVALID')), nan.error?.message)
  const inverted = await resolve(owner, '100', '1')
  check('Inverted buy/sell spread is rejected', Boolean(inverted.error?.message.includes('RATE_INVALID')), inverted.error?.message)
  const approved = await resolve(owner)
  check('MFA-authorized manager publishes and approves atomically', !approved.error && approved.data?.status === 'approved', approved.error?.message)
  const repeat = await resolve(owner)
  check('A resolved request cannot be reused', Boolean(repeat.error?.message.includes('APPROVAL_NOT_PENDING')), repeat.error?.message)
  const after = await cashier.rpc('get_transaction_rate_context', scope)
  check('Cashier receives fresh exact decimal rate', !after.error && !after.data.stale && typeof after.data.applied_rate === 'string' && new Decimal(after.data.applied_rate).eq(new Decimal(buy).plus(sell).div(2)), after.error?.message ?? after.data?.applied_rate)
  const status = await cashier.rpc('get_my_operation_rate_request_v11', { target_request: id })
  check('Cashier can observe successful resolution', !status.error && status.data?.status === 'approved')
  const accounts = await cashier.rpc('get_money_accounts', { target_org: env.BUSINESS_A_ID })
  const account = accounts.data?.find((item) => item.branch_id === env.BRANCH_A1_ID && item.active && item.account_type === 'cashbox')
  check('Cashier has assigned cashbox', !accounts.error && Boolean(account), accounts.error?.message)
  const device = await cashier.rpc('register_device', { target_org: env.BUSINESS_A_ID, friendly_name_input: 'LAUNCH_RATE_CERTIFICATION', fingerprint_hash_input: `launch-rate-${randomUUID()}`, app_version_input: 'launch-rate-certification', target_branch: env.BRANCH_A1_ID })
  check('Disposable test device registered', !device.error && Boolean(device.data?.id), device.error?.message)
  testDeviceId = device.data.id
  const trusted = await owner.rpc('trust_device', { target_device: device.data.id, reason_input: 'Disposable launch certification' })
  check('MFA owner trusts test device', !trusted.error, trusted.error?.message)
  const operation = {
    organization_id: env.BUSINESS_A_ID, branch_id: env.BRANCH_A1_ID, device_id: device.data.id,
    operation: 'RECEIVE_MONEY', currency: 'USD', amount: '0.01', destination_money_account_id: account.id,
    client_command_id: `launch-rate-${randomUUID()}`, memo: 'Disposable launch certification',
    publish_rate: { branch_id: env.BRANCH_A1_ID, source_currency: 'USD', target_currency: 'AFN', rate: after.data.applied_rate,
      buy_rate: after.data.buy_rate, sell_rate: after.data.sell_rate, context_id: after.data.context_id, rate_mode: 'automatic', rate_side: 'valuation', quote_direction: 'AFN_FIRST' },
  }
  const tampered = await cashier.rpc('record_operation', { command: { ...operation, publish_rate: { ...operation.publish_rate, rate: '0.001' } } })
  check('Modified automatic rate cannot post', Boolean(tampered.error?.message.includes('RATE_CONTEXT_CHANGED')), tampered.error?.message)
  const posted = await Promise.all([cashier.rpc('record_operation', { command: operation }), cashier.rpc('record_operation', { command: operation })])
  check('Cashier posts once after resolution', posted.every((r) => !r.error) && Boolean(posted[0].data?.id) && posted[0].data.id === posted[1].data?.id, posted.map((r) => r.error?.message ?? r.data?.id).join(' | '))
  const detail = await owner.rpc('get_transaction_detail', { target_org: env.BUSINESS_A_ID, target_entry: posted[0].data.id })
  check('Posted transaction is readable through authorized API', !detail.error, detail.error?.message)
  check('Posted receipt retains entered amount and currency', detail.data.status === 'posted' && new Decimal(detail.data.amount).eq('0.01') && detail.data.currency_code === 'USD', posted[0].data.id)
} catch (error) {
  if (!results.some((item) => !item.passed)) results.push({ name: 'Certification completed', passed: false, detail: error.message })
  process.exitCode = 1
} finally {
  if (owner && testDeviceId) {
    const retired = await owner.rpc('revoke_device', { target_device: testDeviceId, reason_input: 'Disposable launch certification completed' })
    results.push({ name: 'Test device retired', passed: !retired.error, detail: retired.error?.message ?? '' })
    if (retired.error) process.exitCode = 1
  }
  await Promise.allSettled(clients.map((client) => client.auth.signOut()))
  const report = { generated_at: new Date().toISOString(), passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length, results }
  mkdirSync('test-results/launch-readiness', { recursive: true })
  writeFileSync('test-results/launch-readiness/daily-rate-request.json', `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
}
