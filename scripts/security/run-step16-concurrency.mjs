import { createClient } from '@supabase/supabase-js'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { signInMfaFixtureAtAal2 } from './mfa-fixture.mjs'

const source = process.env.SARAFI_STEP16_ENV ?? '.env.security.local'
const fileEnv = readFileSync(source, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).reduce((values, line) => {
  const split = line.indexOf('=')
  values[line.slice(0, split)] = line.slice(split + 1)
  return values
}, {})
const env = { ...fileEnv, ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SARAFI_E2E_CASHIER_A_EMAIL', 'SARAFI_E2E_CASHIER_A_PASSWORD', 'BUSINESS_A_ID', 'BRANCH_A1_ID', 'CASHBOX_A1_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing Step 16 fixture setting: ${key}`)

const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const observer = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const results = []
const record = (name, passed, detail) => results.push({ name, result: passed ? 'PASS' : 'FAIL', detail })
const signIn = async (email, password) => {
  const instance = client()
  const result = await instance.auth.signInWithPassword({ email, password })
  if (result.error) throw new Error(`sign in failed: ${result.error.message}`)
  return instance
}
const registerDevice = async (instance, label) => {
  const result = await instance.rpc('register_device', {
    target_org: env.BUSINESS_A_ID,
    friendly_name_input: `STEP16_${label}`,
    fingerprint_hash_input: `step16-${label}-${randomUUID()}`,
    app_version_input: 'step16',
    target_branch: env.BRANCH_A1_ID,
  })
  if (result.error || !result.data?.id) throw new Error(`${label} device registration failed: ${result.error?.message ?? 'no device returned'}`)
  return result.data.id
}
const command = (id, soldAmount = '0.01', sellRate = '70') => {
  const boughtAmount = new Decimal(soldAmount).mul(sellRate).toFixed(12)
  return {
    organization_id: env.BUSINESS_A_ID, branch_id: env.BRANCH_A1_ID, cashbox_id: env.CASHBOX_A1_ID,
    side: 'sell_fx', sold_currency: env.SARAFI_STEP16_SOLD_CURRENCY ?? 'USD', bought_currency: env.SARAFI_STEP16_BOUGHT_CURRENCY ?? 'AFN',
    sold_amount: soldAmount, bought_amount: boughtAmount, sold_base_value: boughtAmount, bought_base_value: boughtAmount,
    base_currency: env.SARAFI_STEP16_BASE_CURRENCY ?? 'AFN', customer_rate: sellRate, rate_source: 'shop_rate', client_command_id: id,
  }
}
const rpc = (instance, payload) => instance.rpc('record_fx_trade_v5', { command: payload })
const getSnapshot = async () => {
  const [journal, events, receipts, state] = await Promise.all([
    observer.from('journal_entries').select('id, journal_lines(native_debit,native_credit,base_debit,base_credit)').eq('organization_id', env.BUSINESS_A_ID),
    observer.from('financial_events').select('id, client_command_id').eq('organization_id', env.BUSINESS_A_ID),
    observer.from('command_receipts').select('client_command_id,journal_entry_id').eq('organization_id', env.BUSINESS_A_ID),
    observer.from('fx_inventory_cost_state').select('currency_code,quantity,carrying_base_value').eq('organization_id', env.BUSINESS_A_ID),
  ])
  const errors = [journal, events, receipts, state].filter((result) => result.error)
  if (errors.length) throw new Error(errors.map((result) => result.error.message).join('; '))
  const lines = journal.data.flatMap((entry) => entry.journal_lines ?? [])
  const entryBalances = journal.data.map((entry) => {
    const entryLines = entry.journal_lines ?? []
    return {
      debit: entryLines.reduce((sum, line) => sum.plus(line.base_debit ?? 0), new Decimal(0)),
      credit: entryLines.reduce((sum, line) => sum.plus(line.base_credit ?? 0), new Decimal(0)),
    }
  })
  const totalDebit = lines.reduce((sum, line) => sum.plus(line.base_debit ?? 0), new Decimal(0))
  const totalCredit = lines.reduce((sum, line) => sum.plus(line.base_credit ?? 0), new Decimal(0))
  return {
    journal: journal.data,
    events: events.data,
    receipts: receipts.data,
    state: state.data,
    debit: totalDebit,
    credit: totalCredit,
    balanceAudit: {
      balanced: totalDebit.eq(totalCredit) && entryBalances.every((entry) => entry.debit.eq(entry.credit)),
      total_debit: totalDebit.toString(),
      total_credit: totalCredit.toString(),
      entry_count: journal.data.length,
      imbalanced_entry_count: entryBalances.filter((entry) => !entry.debit.eq(entry.credit)).length,
    },
  }
}
const cashierA = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const deviceA = await registerDevice(cashierA, 'CASHIER_A')
const deviceB = await registerDevice(cashierA, 'CASHIER_A_SECOND_DEVICE')
const ownerA = (await signInMfaFixtureAtAal2(env.BUSINESS_A_ID)).client
for (const [deviceId, label] of [[deviceA, 'primary'], [deviceB, 'second']]) {
  const trusted = await ownerA.rpc('trust_device', { target_device: deviceId, reason_input: `Step 16 ${label} device trust` })
  if (trusted.error) throw new Error(`${label} device trust failed: ${trusted.error.message}`)
}
const soldCurrency = env.SARAFI_STEP16_SOLD_CURRENCY ?? 'USD'
const boughtCurrency = env.SARAFI_STEP16_BOUGHT_CURRENCY ?? 'AFN'
let rateContext = await cashierA.rpc('get_transaction_rate_context', {
  target_org: env.BUSINESS_A_ID,
  target_branch: env.BRANCH_A1_ID,
  source_currency: soldCurrency,
  target_currency: boughtCurrency,
})
if (rateContext.error || !rateContext.data?.sell_rate || rateContext.data.stale) {
  const fallbackBuyRate = rateContext.data?.buy_rate ?? '70'
  const fallbackSellRate = rateContext.data?.sell_rate ?? '70'
  const published = await ownerA.rpc('set_exchange_rate', {
    target_org: env.BUSINESS_A_ID,
    target_branch: env.BRANCH_A1_ID,
    source_currency_input: soldCurrency,
    target_currency_input: boughtCurrency,
    buy_rate_input: fallbackBuyRate,
    sell_rate_input: fallbackSellRate,
  })
  if (published.error) throw new Error(`Step 16 could not publish a current rate: ${published.error.message}`)
  rateContext = await cashierA.rpc('get_transaction_rate_context', {
    target_org: env.BUSINESS_A_ID,
    target_branch: env.BRANCH_A1_ID,
    source_currency: soldCurrency,
    target_currency: boughtCurrency,
  })
}
if (rateContext.error || !rateContext.data?.sell_rate || rateContext.data.stale)
  throw new Error(`Step 16 requires a current ${soldCurrency}/${boughtCurrency} sell rate`)
const sellRate = new Decimal(rateContext.data.sell_rate).toString()
const before = await getSnapshot()
const availableBefore = new Decimal(
  before.state.find((row) => row.currency_code === soldCurrency)?.quantity ?? 0,
)
if (!availableBefore.isFinite() || availableBefore.lte(0))
  throw new Error(`Step 16 requires positive ${soldCurrency} inventory`)
const competingAmount = availableBefore.mul('0.75').toFixed(12)
const retryAmount = availableBefore.mul('0.001').toFixed(12)
const raceIds = [randomUUID(), randomUUID()]
const race = await Promise.all([rpc(cashierA, { ...command(raceIds[0], competingAmount, sellRate), device_id: deviceA }), rpc(cashierA, { ...command(raceIds[1], competingAmount, sellRate), device_id: deviceB })])
const successfulRacePosts = race.filter((result) => !result.error)
const racePassed = successfulRacePosts.length === 1
record('Concurrent sales cannot overspend available inventory', racePassed, `available=${availableBefore}; each_sale=${competingAmount}; successful_posts=${successfulRacePosts.length}; ${race.map((result) => result.error?.message ?? result.data?.id).join(' | ')}`)

const retryId = randomUUID()
const first = await rpc(cashierA, { ...command(retryId, retryAmount, sellRate), device_id: deviceA })
const retry = await Promise.all([rpc(cashierA, { ...command(retryId, retryAmount, sellRate), device_id: deviceA }), rpc(cashierA, { ...command(retryId, retryAmount, sellRate), device_id: deviceB })])
const retryIds = [first.data?.id, ...retry.map((result) => result.data?.id)].filter(Boolean)
record('Retry after committed timeout produces one posting', new Set(retryIds).size === 1 && retry.every((result) => !result.error), retryIds.join(','))

const sameId = randomUUID()
const duplicate = await Promise.all([rpc(cashierA, { ...command(sameId, retryAmount, sellRate), device_id: deviceA }), rpc(cashierA, { ...command(sameId, retryAmount, sellRate), device_id: deviceA }), rpc(cashierA, { ...command(sameId, retryAmount, sellRate), device_id: deviceB })])
const duplicateIds = duplicate.map((result) => result.data?.id).filter(Boolean)
record('Same idempotency key across devices has one economic effect', new Set(duplicateIds).size <= 1 && duplicate.every((result) => !result.error), duplicateIds.join(','))

const after = await getSnapshot()
const uniqueCommandIds = new Set(after.events.map((event) => event.client_command_id)).size === after.events.length
const debitDelta = after.debit.minus(before.debit)
const creditDelta = after.credit.minus(before.credit)
const balanced = debitDelta.eq(creditDelta) &&
  after.balanceAudit.imbalanced_entry_count === before.balanceAudit.imbalanced_entry_count
const state = after.state.find((row) => row.currency_code === soldCurrency)
record(
  'New journal entries remain balanced without changing historical exceptions',
  balanced,
  `new_debit=${debitDelta}; new_credit=${creditDelta}; historical_imbalanced_entries=${before.balanceAudit.imbalanced_entry_count}; after_imbalanced_entries=${after.balanceAudit.imbalanced_entry_count}`,
)
record('No duplicate receipt/event exists', uniqueCommandIds && new Set(after.receipts.map((receipt) => receipt.client_command_id)).size === after.receipts.length, `events=${after.events.length}; receipts=${after.receipts.length}`)
record('No prohibited negative inventory exists', !state || new Decimal(state.quantity).gte(0), `quantity=${state?.quantity ?? 'missing'}`)
record('Single economic effect per successful command', after.receipts.every((receipt) => after.events.some((event) => event.client_command_id === receipt.client_command_id)), `before_events=${before.events.length}; after_events=${after.events.length}`)

const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), passed: results.filter((result) => result.result === 'PASS').length, failed: results.filter((result) => result.result === 'FAIL').length, results }
mkdirSync('test-results/step16', { recursive: true })
writeFileSync('test-results/step16/concurrency-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
