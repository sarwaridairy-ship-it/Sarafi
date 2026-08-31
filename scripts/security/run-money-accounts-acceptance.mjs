import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const fileEnv = Object.fromEntries(
  readFileSync(process.env.SARAFI_SECURITY_ENV ?? '.env.security.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)
const env = { ...fileEnv, ...process.env }
for (const key of [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SARAFI_E2E_OWNER_A_EMAIL',
  'SARAFI_E2E_OWNER_A_PASSWORD',
  'SARAFI_E2E_MANAGER_A_EMAIL',
  'SARAFI_E2E_MANAGER_A_PASSWORD',
  'SARAFI_E2E_OWNER_B_EMAIL',
  'SARAFI_E2E_OWNER_B_PASSWORD',
  'BUSINESS_A_ID',
  'BUSINESS_B_ID',
  'BRANCH_A1_ID',
  'CASHBOX_A1_ID',
]) {
  if (!env[key]) throw new Error(`Missing security fixture setting: ${key}`)
}

const makeClient = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

const signIn = async (email, password) => {
  const client = makeClient()
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error) throw new Error(`Fixture sign-in failed: ${result.error.message}`)
  return client
}

const results = []
const pass = (test, detail = '') => results.push({ test, result: 'PASS', detail })
const fail = (test, detail) => results.push({ test, result: 'FAIL', detail })
const expectAllowed = async (test, operation) => {
  const result = await operation()
  if (result.error) fail(test, result.error.message)
  else pass(test)
  return result
}
const expectDenied = async (test, operation) => {
  const result = await operation()
  const denied = Boolean(result.error) || result.data === null || (Array.isArray(result.data) && result.data.length === 0)
  if (denied) pass(test, result.error?.message ?? 'No rows returned')
  else fail(test, 'Operation was unexpectedly allowed')
  return result
}
const expectRpcRevoked = async (test, operation) => {
  const result = await operation()
  if (result.error && /permission denied|could not find the function/i.test(result.error.message))
    pass(test, result.error.message)
  else fail(test, result.error?.message ?? 'Internal RPC was unexpectedly callable')
  return result
}

const owner = await signIn(env.SARAFI_E2E_OWNER_A_EMAIL, env.SARAFI_E2E_OWNER_A_PASSWORD)
const manager = await signIn(env.SARAFI_E2E_MANAGER_A_EMAIL, env.SARAFI_E2E_MANAGER_A_PASSWORD)
const ownerB = await signIn(env.SARAFI_E2E_OWNER_B_EMAIL, env.SARAFI_E2E_OWNER_B_PASSWORD)
const anonymous = makeClient()

await expectDenied('Anonymous cannot list money accounts', () =>
  anonymous.rpc('get_money_accounts', { target_org: env.BUSINESS_A_ID }),
)
await expectDenied('Owner cannot cross into another organization', () =>
  owner.rpc('get_money_accounts', { target_org: env.BUSINESS_B_ID }),
)
await expectDenied('Clients cannot read the money account table directly', () =>
  owner.from('money_accounts').select('*').eq('organization_id', env.BUSINESS_A_ID),
)

const businessBAccounts = await ownerB.rpc('get_money_accounts', { target_org: env.BUSINESS_B_ID })
const businessBAccount = businessBAccounts.data?.[0]
if (businessBAccount) {
  await expectRpcRevoked('Internal balance helper is not a client RPC', () =>
    owner.rpc('require_money_account_balance', {
      target_org: env.BUSINESS_B_ID,
      target_account: businessBAccount.id,
      target_currency: 'AFN',
      required_amount: 0,
    }),
  )
} else fail('Internal balance helper is not a client RPC', businessBAccounts.error?.message ?? 'Business B has no test account')

let accountList = await expectAllowed('Owner can list usable money accounts', () =>
  owner.rpc('get_money_accounts', { target_org: env.BUSINESS_A_ID }),
)
const source = accountList.data?.find((account) => account.cashbox_id === env.CASHBOX_A1_ID)
if (!source) fail('Assigned cashbox has a stable money account', 'Cashbox account was not returned')
else pass('Assigned cashbox has a stable money account', source.name)

const acceptanceName = 'SECURITY ACCEPTANCE SAFE'
let destination = accountList.data?.find(
  (account) => account.name === acceptanceName && account.branch_id === env.BRANCH_A1_ID,
)
if (!destination) {
  const created = await expectAllowed('Owner can add a real money account', () =>
    owner.rpc('create_money_account', {
      target_org: env.BUSINESS_A_ID,
      name_input: acceptanceName,
      account_type_input: 'safe',
      branch_id_input: env.BRANCH_A1_ID,
      reference_input: 'Automated production acceptance fixture',
    }),
  )
  destination = created.data
} else {
  pass('Owner can add a real money account', 'Reused the existing acceptance account')
}

await expectDenied('Manager cannot add money accounts', () =>
  manager.rpc('create_money_account', {
    target_org: env.BUSINESS_A_ID,
    name_input: `SECURITY DENIED ${randomUUID()}`,
    account_type_input: 'safe',
    branch_id_input: env.BRANCH_A1_ID,
    reference_input: '',
  }),
)
await expectDenied('Manager cannot change the organization currency list', () =>
  manager.rpc('set_organization_currency', {
    target_org: env.BUSINESS_A_ID,
    target_currency: 'CNY',
    enabled_input: true,
  }),
)

const previousCurrency = await owner
  .from('organization_currencies')
  .select('enabled')
  .eq('organization_id', env.BUSINESS_A_ID)
  .eq('currency_code', 'CNY')
  .maybeSingle()
const wasCnyEnabled = previousCurrency.data?.enabled === true
await expectAllowed('Owner can enable a world currency', () =>
  owner.rpc('set_organization_currency', {
    target_org: env.BUSINESS_A_ID,
    target_currency: 'CNY',
    enabled_input: true,
  }),
)
if (!wasCnyEnabled) {
  await expectAllowed('World-currency setting can be restored safely', () =>
    owner.rpc('set_organization_currency', {
      target_org: env.BUSINESS_A_ID,
      target_currency: 'CNY',
      enabled_input: false,
    }),
  )
}

if (source && destination) {
  const currentAfnBalance = Number(
    source.balances?.find((balance) => balance.currency === 'AFN')?.amount ?? 0,
  )
  if (currentAfnBalance < 5) {
    const openingAmount = String(10 - currentAfnBalance)
    await expectAllowed('Opening money posts into the stable cashbox account', () =>
      owner.rpc('record_opening_balance', {
        command: {
          organization_id: env.BUSINESS_A_ID,
          branch_id: env.BRANCH_A1_ID,
          cashbox_id: env.CASHBOX_A1_ID,
          currency: 'AFN',
          amount: openingAmount,
          base_value: openingAmount,
          memo: 'Security acceptance opening money',
          client_command_id: `security-money-opening-${randomUUID()}`,
        },
      }),
    )
  } else {
    pass('Opening money posts into the stable cashbox account', 'The fixture cashbox already has enough AFN')
  }

  const transferCommandId = 'security-money-transfer-v2'
  const transfer = await expectAllowed('Transfer posts from one selected account to another', () =>
    owner.rpc('record_operation', {
      command: {
        organization_id: env.BUSINESS_A_ID,
        branch_id: env.BRANCH_A1_ID,
        operation: 'TRANSFER_CASH',
        currency: 'AFN',
        amount: '2',
        base_amount: '2',
        source_money_account_id: source.id,
        destination_money_account_id: destination.id,
        memo: 'Security acceptance transfer',
        client_command_id: transferCommandId,
      },
    }),
  )

  await expectDenied('A transfer cannot use the same account twice', () =>
    owner.rpc('record_operation', {
      command: {
        organization_id: env.BUSINESS_A_ID,
        branch_id: env.BRANCH_A1_ID,
        operation: 'TRANSFER_CASH',
        currency: 'AFN',
        amount: '1',
        base_amount: '1',
        source_money_account_id: source.id,
        destination_money_account_id: source.id,
        client_command_id: `security-same-account-${randomUUID()}`,
      },
    }),
  )
  await expectDenied('Foreign operations require an AFN book value', () =>
    owner.rpc('record_operation', {
      command: {
        organization_id: env.BUSINESS_A_ID,
        branch_id: env.BRANCH_A1_ID,
        operation: 'RECORD_EXPENSE',
        currency: 'USD',
        amount: '0.01',
        source_money_account_id: source.id,
        client_command_id: `security-missing-base-${randomUUID()}`,
      },
    }),
  )

  if (transfer.data?.id) {
    const lines = await owner
      .from('journal_lines')
      .select('native_debit,native_credit,base_debit,base_credit')
      .eq('journal_entry_id', transfer.data.id)
    const nativeDebit = (lines.data ?? []).reduce((sum, line) => sum + Number(line.native_debit), 0)
    const nativeCredit = (lines.data ?? []).reduce((sum, line) => sum + Number(line.native_credit), 0)
    const baseDebit = (lines.data ?? []).reduce((sum, line) => sum + Number(line.base_debit), 0)
    const baseCredit = (lines.data ?? []).reduce((sum, line) => sum + Number(line.base_credit), 0)
    if (!lines.error && lines.data?.length === 2 && nativeDebit === nativeCredit && baseDebit === baseCredit)
      pass('Account transfer creates a balanced two-line entry')
    else fail('Account transfer creates a balanced two-line entry', lines.error?.message ?? 'Entry did not balance')
  }

  const event = await owner
    .from('financial_events')
    .select('metadata')
    .eq('organization_id', env.BUSINESS_A_ID)
    .eq('client_command_id', transferCommandId)
    .maybeSingle()
  if (
    !event.error &&
    event.data?.metadata?.source_account_name === source.name &&
    event.data?.metadata?.destination_account_name === destination.name
  )
    pass('Transaction history keeps human source and destination names')
  else fail('Transaction history keeps human source and destination names', event.error?.message ?? 'Flow metadata is incomplete')
}

accountList = await owner.rpc('get_money_accounts', { target_org: env.BUSINESS_A_ID })
if (
  !accountList.error &&
  accountList.data?.some((account) => account.id === destination?.id) &&
  accountList.data?.some((account) => account.id === source?.id)
)
  pass('Both accounts remain visible after the transfer')
else fail('Both accounts remain visible after the transfer', accountList.error?.message ?? 'Account list is incomplete')

const report = {
  generated_at: new Date().toISOString(),
  passed: results.filter((item) => item.result === 'PASS').length,
  failed: results.filter((item) => item.result === 'FAIL').length,
  results,
}
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
