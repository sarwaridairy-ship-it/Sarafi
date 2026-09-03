import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.security.local')

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const url = required('SUPABASE_URL')
const anonKey = required('SUPABASE_ANON_KEY')
const organizationId = required('BUSINESS_A_ID')
const reportCodes = [
  'daily_transactions', 'transaction_journal', 'cash_movement', 'branch_balance',
  'currency_position', 'fx_profit', 'commission', 'expenses', 'profit_loss',
  'balance_sheet', 'trial_balance', 'receivables', 'payables', 'aging',
  'counterparty_statement', 'owner_capital', 'employee_activity', 'reversals',
  'reconciliation', 'rate_history', 'security_activity', 'hawala',
]

const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
const publicStatus = await anonymous.rpc('get_public_platform_status')
if (publicStatus.error || !publicStatus.data || !Array.isArray(publicStatus.data.announcements)) {
  throw new Error(`Public platform status failed: ${publicStatus.error?.message ?? 'invalid response'}`)
}
const anonymousReport = await anonymous.rpc('get_named_financial_report', {
  target_org: organizationId,
  report_code: 'daily_transactions',
})
if (!anonymousReport.error) throw new Error('Anonymous financial report access was not denied')

const owner = createClient(url, anonKey, { auth: { persistSession: false } })
const ownerLogin = await owner.auth.signInWithPassword({
  email: required('SARAFI_E2E_OWNER_A_EMAIL'),
  password: required('SARAFI_E2E_OWNER_A_PASSWORD'),
})
if (ownerLogin.error) throw new Error(`Owner sign-in failed: ${ownerLogin.error.message}`)

const controlPlane = await owner.rpc('get_organization_control_plane', { target_org: organizationId })
if (controlPlane.error || !controlPlane.data || !Array.isArray(controlPlane.data.branches) || !Array.isArray(controlPlane.data.cashboxes)) {
  throw new Error(`Organization control plane failed: ${controlPlane.error?.message ?? 'invalid response'}`)
}
const reconciliation = await owner.rpc('get_reconciliation_workspace', { target_org: organizationId })
if (reconciliation.error || !reconciliation.data || !Array.isArray(reconciliation.data.closes)) {
  throw new Error(`Reconciliation workspace failed: ${reconciliation.error?.message ?? 'invalid response'}`)
}
const unverifiedFeatureChange = await owner.rpc('set_organization_feature_state', {
  target_org: organizationId,
  feature_input: 'advanced_analytics',
  enabled_input: true,
})
if (!unverifiedFeatureChange.error || !unverifiedFeatureChange.error.message.includes('AAL2')) {
  throw new Error('Sensitive feature change did not require AAL2')
}

for (const reportCode of reportCodes) {
  const report = await owner.rpc('get_named_financial_report', {
    target_org: organizationId,
    report_code: reportCode,
  })
  if (report.error || !Array.isArray(report.data)) {
    throw new Error(`${reportCode} report failed: ${report.error?.message ?? 'invalid response'}`)
  }
}

await owner.auth.signOut()
const cashier = createClient(url, anonKey, { auth: { persistSession: false } })
const cashierLogin = await cashier.auth.signInWithPassword({
  email: required('SARAFI_E2E_CASHIER_A_EMAIL'),
  password: required('SARAFI_E2E_CASHIER_A_PASSWORD'),
})
if (cashierLogin.error) throw new Error(`Cashier sign-in failed: ${cashierLogin.error.message}`)
const cashierControl = await cashier.rpc('get_organization_control_plane', { target_org: organizationId })
if (!cashierControl.error) throw new Error('Cashier received owner-only organization controls')

console.log(JSON.stringify({
  publicPlatformStatus: 'pass',
  anonymousFinancialReportDenied: 'pass',
  organizationControls: 'pass',
  reconciliationHistory: 'pass',
  sensitiveFeatureMfa: 'pass',
  namedReports: reportCodes.length,
  cashierOwnerControlsDenied: 'pass',
}))
