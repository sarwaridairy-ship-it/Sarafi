import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const source = process.env.SARAFI_STEP17_ENV ?? '.env.step16.local'
const fileEnv = readFileSync(source, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).reduce((values, line) => {
  const split = line.indexOf('=')
  values[line.slice(0, split)] = line.slice(split + 1)
  return values
}, {})
const env = { ...fileEnv, ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_CASHIER_A_EMAIL', 'SARAFI_E2E_CASHIER_A_PASSWORD', 'BUSINESS_A_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing Step 17 setting: ${key}`)

const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const signedIn = await client.auth.signInWithPassword({ email: env.SARAFI_E2E_CASHIER_A_EMAIL, password: env.SARAFI_E2E_CASHIER_A_PASSWORD })
if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`)
const organization = env.BUSINESS_A_ID
const rows = async (table, columns = '*') => {
  const result = await client.from(table).select(columns).eq(table === 'organizations' ? 'id' : 'organization_id', organization)
  if (result.error) throw new Error(`${table}: ${result.error.message}`)
  return result.data
}
const snapshot = async () => {
  const [organizations, memberships, branches, cashboxes, events, entries, lines, debts, settlements, inventory, audits] = await Promise.all([
    rows('organizations'), rows('organization_memberships'), rows('branches'), rows('cashboxes'), rows('financial_events', 'id,client_command_id'), rows('journal_entries', 'id,status'), rows('journal_lines', 'id,native_debit,native_credit,base_debit,base_credit'), rows('debts', 'id,outstanding_amount'), rows('settlements', 'id,amount'), rows('fx_inventory_cost_state', 'currency_code,quantity,carrying_base_value'), rows('security_audit_events', 'id,event_type'),
  ])
  return {
    organization_id: organization,
    counts: { organizations: organizations.length, memberships: memberships.length, branches: branches.length, cashboxes: cashboxes.length, financial_events: events.length, journal_entries: entries.length, journal_lines: lines.length, debts: debts.length, settlements: settlements.length, inventory_positions: inventory.length, security_audit_events: audits.length },
    totals: {
      journal_base_debit: lines.reduce((sum, row) => sum + Number(row.base_debit ?? 0), 0),
      journal_base_credit: lines.reduce((sum, row) => sum + Number(row.base_credit ?? 0), 0),
      journal_native_debit: lines.reduce((sum, row) => sum + Number(row.native_debit ?? 0), 0),
      journal_native_credit: lines.reduce((sum, row) => sum + Number(row.native_credit ?? 0), 0),
      outstanding_debt: debts.reduce((sum, row) => sum + Number(row.outstanding_amount ?? 0), 0),
      settlement_amount: settlements.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    },
    inventory: inventory.sort((left, right) => left.currency_code.localeCompare(right.currency_code)),
    posted_entries: entries.filter((entry) => entry.status === 'posted').length,
  }
}
const actual = await snapshot()
const expectedPath = env.SARAFI_STEP17_EXPECTED
const expected = expectedPath ? JSON.parse(readFileSync(expectedPath, 'utf8')) : null
const comparable = (value) => JSON.stringify({ counts: value.counts, totals: value.totals, inventory: value.inventory, posted_entries: value.posted_entries })
const balanced = actual.totals.journal_base_debit === actual.totals.journal_base_credit && actual.totals.journal_native_debit === actual.totals.journal_native_credit
const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), mode: expected ? 'reconcile' : 'snapshot', balanced, expected_match: expected ? comparable(actual) === comparable(expected) : null, actual, expected: expected ?? undefined }
mkdirSync('test-results/step17', { recursive: true })
writeFileSync('test-results/step17/reconciliation-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (!balanced || (expected && !report.expected_match)) process.exitCode = 1
