import { createClient } from '@supabase/supabase-js'
import Decimal from 'decimal.js'
import { randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const source = process.env.SARAFI_STEP16_ENV ?? '.env.security.local'
const fileEnv = readFileSync(source, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).reduce((values, line) => {
  const split = line.indexOf('=')
  values[line.slice(0, split)] = line.slice(split + 1)
  return values
}, {})
const env = { ...fileEnv, ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_CASHIER_A_EMAIL', 'SARAFI_E2E_CASHIER_A_PASSWORD', 'BUSINESS_A_ID', 'BRANCH_A1_ID', 'CASHBOX_A1_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing Step 16 fixture setting: ${key}`)

const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
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
const command = (id, soldAmount = '0.01') => ({
  organization_id: env.BUSINESS_A_ID, branch_id: env.BRANCH_A1_ID, cashbox_id: env.CASHBOX_A1_ID,
  side: 'sell_fx', sold_currency: env.SARAFI_STEP16_SOLD_CURRENCY ?? 'USD', bought_currency: env.SARAFI_STEP16_BOUGHT_CURRENCY ?? 'AFN',
  sold_amount: soldAmount, bought_amount: soldAmount, sold_base_value: soldAmount, bought_base_value: new Decimal(soldAmount).plus(1).toString(),
  base_currency: env.SARAFI_STEP16_BASE_CURRENCY ?? 'AFN', client_command_id: id,
})
const rpc = (instance, payload) => instance.rpc('record_fx_trade', { command: payload })
const getSnapshot = async (instance) => {
  const [journal, events, receipts, state, balanceAudit] = await Promise.all([
    instance.from('journal_entries').select('id, journal_lines(native_debit,native_credit,base_debit,base_credit)').eq('organization_id', env.BUSINESS_A_ID),
    instance.from('financial_events').select('id, client_command_id').eq('organization_id', env.BUSINESS_A_ID),
    instance.from('command_receipts').select('client_command_id,journal_entry_id').eq('organization_id', env.BUSINESS_A_ID),
    instance.from('fx_inventory_cost_state').select('currency_code,quantity,carrying_base_value').eq('organization_id', env.BUSINESS_A_ID),
    instance.rpc('get_journal_balance_audit', { target_org: env.BUSINESS_A_ID }),
  ])
  const errors = [journal, events, receipts, state, balanceAudit].filter((result) => result.error)
  if (errors.length) throw new Error(errors.map((result) => result.error.message).join('; '))
  const lines = journal.data.flatMap((entry) => entry.journal_lines ?? [])
  return {
    journal: journal.data,
    events: events.data,
    receipts: receipts.data,
    state: state.data,
    debit: lines.reduce((sum, line) => sum.plus(line.base_debit ?? 0), new Decimal(0)),
    credit: lines.reduce((sum, line) => sum.plus(line.base_credit ?? 0), new Decimal(0)),
    balanceAudit: balanceAudit.data,
  }
}
const cashierA = await signIn(env.SARAFI_E2E_CASHIER_A_EMAIL, env.SARAFI_E2E_CASHIER_A_PASSWORD)
const deviceA = await registerDevice(cashierA, 'CASHIER_A')
const deviceB = await registerDevice(cashierA, 'CASHIER_A_SECOND_DEVICE')
const before = await getSnapshot(cashierA)
const soldCurrency = env.SARAFI_STEP16_SOLD_CURRENCY ?? 'USD'
const availableBefore = new Decimal(
  before.state.find((row) => row.currency_code === soldCurrency)?.quantity ?? 0,
)
if (!availableBefore.isFinite() || availableBefore.lte(0))
  throw new Error(`Step 16 requires positive ${soldCurrency} inventory`)
const competingAmount = availableBefore.mul('0.75').toFixed(12)
const retryAmount = availableBefore.mul('0.001').toFixed(12)
const raceIds = [randomUUID(), randomUUID()]
const race = await Promise.all([rpc(cashierA, { ...command(raceIds[0], competingAmount), device_id: deviceA }), rpc(cashierA, { ...command(raceIds[1], competingAmount), device_id: deviceB })])
const successfulRacePosts = race.filter((result) => !result.error)
const racePassed = successfulRacePosts.length === 1
record('Concurrent sales cannot overspend available inventory', racePassed, `available=${availableBefore}; each_sale=${competingAmount}; successful_posts=${successfulRacePosts.length}; ${race.map((result) => result.error?.message ?? result.data?.id).join(' | ')}`)

const retryId = randomUUID()
const first = await rpc(cashierA, { ...command(retryId, retryAmount), device_id: deviceA })
const retry = await Promise.all([rpc(cashierA, { ...command(retryId, retryAmount), device_id: deviceA }), rpc(cashierA, { ...command(retryId, retryAmount), device_id: deviceB })])
const retryIds = [first.data?.id, ...retry.map((result) => result.data?.id)].filter(Boolean)
record('Retry after committed timeout produces one posting', new Set(retryIds).size === 1 && retry.every((result) => !result.error), retryIds.join(','))

const sameId = randomUUID()
const duplicate = await Promise.all([rpc(cashierA, { ...command(sameId, retryAmount), device_id: deviceA }), rpc(cashierA, { ...command(sameId, retryAmount), device_id: deviceA }), rpc(cashierA, { ...command(sameId, retryAmount), device_id: deviceB })])
const duplicateIds = duplicate.map((result) => result.data?.id).filter(Boolean)
record('Same idempotency key across devices has one economic effect', new Set(duplicateIds).size <= 1 && duplicate.every((result) => !result.error), duplicateIds.join(','))

const after = await getSnapshot(cashierA)
const uniqueCommandIds = new Set(after.events.map((event) => event.client_command_id)).size === after.events.length
const balanced = after.balanceAudit?.balanced === true && after.balanceAudit?.imbalanced_entry_count === 0
const state = after.state.find((row) => row.currency_code === soldCurrency)
record(
  'Journal remains balanced',
  balanced,
  `server_debit=${after.balanceAudit?.total_debit}; server_credit=${after.balanceAudit?.total_credit}; entries=${after.balanceAudit?.entry_count}; imbalanced_entries=${after.balanceAudit?.imbalanced_entry_count}`,
)
record('No duplicate receipt/event exists', uniqueCommandIds && new Set(after.receipts.map((receipt) => receipt.client_command_id)).size === after.receipts.length, `events=${after.events.length}; receipts=${after.receipts.length}`)
record('No prohibited negative inventory exists', !state || new Decimal(state.quantity).gte(0), `quantity=${state?.quantity ?? 'missing'}`)
record('Single economic effect per successful command', after.receipts.every((receipt) => after.events.some((event) => event.client_command_id === receipt.client_command_id)), `before_events=${before.events.length}; after_events=${after.events.length}`)

const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), passed: results.filter((result) => result.result === 'PASS').length, failed: results.filter((result) => result.result === 'FAIL').length, results }
mkdirSync('test-results/step16', { recursive: true })
writeFileSync('test-results/step16/concurrency-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
