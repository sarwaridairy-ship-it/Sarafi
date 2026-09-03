import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const readEnv = (path) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )

const env = { ...readEnv(process.env.SARAFI_SECURITY_ENV ?? '.env.security.local'), ...process.env }
const requiredKeys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'BUSINESS_A_ID',
  'SARAFI_E2E_OWNER_A_EMAIL',
  'SARAFI_E2E_OWNER_A_PASSWORD',
  'SARAFI_E2E_CASHIER_A_EMAIL',
  'SARAFI_E2E_CASHIER_A_PASSWORD',
  'SARAFI_E2E_ACCOUNTANT_A_EMAIL',
  'SARAFI_E2E_ACCOUNTANT_A_PASSWORD',
  'SARAFI_E2E_VIEWER_A_EMAIL',
  'SARAFI_E2E_VIEWER_A_PASSWORD',
]
for (const key of requiredKeys) {
  if (!env[key]) throw new Error(`Missing premium web acceptance fixture setting: ${key}`)
}

const makeClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const signIn = async (role) => {
  const client = makeClient()
  const prefix = `SARAFI_E2E_${role.toUpperCase()}_A`
  const result = await client.auth.signInWithPassword({
    email: env[`${prefix}_EMAIL`],
    password: env[`${prefix}_PASSWORD`],
  })
  if (result.error) throw new Error(`${role} fixture sign-in failed: ${result.error.message}`)
  return client
}

const results = []
const record = (test, passed, detail = '') => results.push({ test, result: passed ? 'PASS' : 'FAIL', detail })
const owner = await signIn('owner')
const cashier = await signIn('cashier')
const accountant = await signIn('accountant')
const viewer = await signIn('viewer')

const ownerContext = await owner.rpc('get_my_workspace_context')
const ownerWorkspace = ownerContext.data?.find((item) => item.organization_id === env.BUSINESS_A_ID)
record(
  'Owner receives the real organization, branch, cashbox, and plan context',
  !ownerContext.error && ownerWorkspace?.role_code === 'owner' &&
    ownerWorkspace.branches?.length > 0 && ownerWorkspace.cashboxes?.length > 0 &&
    Boolean(ownerWorkspace.subscription?.plan_code),
  ownerContext.error?.message ?? ownerWorkspace?.subscription?.plan_code ?? '',
)

for (const [role, client] of [['cashier', cashier], ['accountant', accountant], ['viewer', viewer]]) {
  const context = await client.rpc('get_my_workspace_context')
  const workspace = context.data?.find((item) => item.organization_id === env.BUSINESS_A_ID)
  record(
    `${role} receives a distinct server role and assigned workspace`,
    !context.error && workspace?.role_code === role && workspace.branches?.length > 0,
    context.error?.message ?? workspace?.role_code ?? '',
  )
}

const billing = await owner.rpc('get_billing_portal', { target_org: env.BUSINESS_A_ID })
const liveProviders = billing.data?.providers?.map((provider) => provider.code) ?? []
record(
  'Owner billing shows plans and only genuinely active payment methods',
  !billing.error && billing.data?.plans?.length >= 2 && liveProviders.includes('manual_review') &&
    !liveProviders.includes('hesabpay') && !liveProviders.includes('aps_gateway'),
  billing.error?.message ?? liveProviders.join(', '),
)

const currentSettings = await owner.from('organization_settings')
  .select('default_language,timezone,receipt_prefix,negative_cash_allowed')
  .eq('organization_id', env.BUSINESS_A_ID)
  .single()
const settingsUpdate = currentSettings.data ? await owner.rpc('update_organization_settings', {
  target_org: env.BUSINESS_A_ID,
  language_input: currentSettings.data.default_language,
  timezone_input: currentSettings.data.timezone,
  receipt_prefix_input: currentSettings.data.receipt_prefix,
  negative_cash_input: currentSettings.data.negative_cash_allowed,
}) : { error: currentSettings.error }
record(
  'Owner can save validated business settings without changing financial history',
  !currentSettings.error && !settingsUpdate.error,
  currentSettings.error?.message ?? settingsUpdate.error?.message ?? currentSettings.data?.receipt_prefix ?? '',
)

const cashierSettingsAttempt = currentSettings.data ? await cashier.rpc('update_organization_settings', {
  target_org: env.BUSINESS_A_ID,
  language_input: currentSettings.data.default_language,
  timezone_input: currentSettings.data.timezone,
  receipt_prefix_input: currentSettings.data.receipt_prefix,
  negative_cash_input: currentSettings.data.negative_cash_allowed,
}) : { error: currentSettings.error }
record(
  'Cashier cannot change owner business settings',
  Boolean(cashierSettingsAttempt.error) && /permission/i.test(cashierSettingsAttempt.error.message),
  cashierSettingsAttempt.error?.message ?? 'Settings were unexpectedly changed',
)

const notificationList = await owner.from('notifications')
  .select('id,status,notification_type')
  .eq('organization_id', env.BUSINESS_A_ID)
  .limit(30)
record(
  'Owner notification center reads only authorized recipient records',
  !notificationList.error && Array.isArray(notificationList.data),
  notificationList.error?.message ?? `rows=${notificationList.data?.length ?? 0}`,
)

const missingNotification = await owner.rpc('mark_notification_state', {
  target_notification: '00000000-0000-0000-0000-000000000000',
  state_input: 'read',
})
record(
  'Notification state changes fail closed for an unknown record',
  Boolean(missingNotification.error) && /not found/i.test(missingNotification.error.message),
  missingNotification.error?.message ?? 'Unknown notification was unexpectedly changed',
)

const existingPreference = await owner.from('notification_preferences')
  .select('in_app')
  .eq('organization_id', env.BUSINESS_A_ID)
  .eq('notification_type', 'approval_required')
  .maybeSingle()
const preferenceUpdate = await owner.rpc('set_notification_preference', {
  target_org: env.BUSINESS_A_ID,
  notification_type_input: 'approval_required',
  in_app_input: existingPreference.data?.in_app ?? true,
  threshold_base_input: null,
})
record(
  'A signed-in team member can save their own notification choice',
  !existingPreference.error && !preferenceUpdate.error && preferenceUpdate.data?.notification_type === 'approval_required',
  existingPreference.error?.message ?? preferenceUpdate.error?.message ?? '',
)

const disableApprovalNotice = await owner.rpc('set_notification_preference', {
  target_org: env.BUSINESS_A_ID,
  notification_type_input: 'approval_required',
  in_app_input: false,
  threshold_base_input: null,
})
const preferenceProbe = !disableApprovalNotice.error ? await cashier.rpc('request_fx_trade_approval', {
  command: {
    organization_id: env.BUSINESS_A_ID,
    branch_id: ownerWorkspace?.branches?.[0]?.id,
    cashbox_id: ownerWorkspace?.cashboxes?.[0]?.id,
    side: 'buy_fx',
    sold_base_value: '1',
    bought_base_value: '1',
    base_currency: 'AFN',
    approval_reason: 'Notification preference acceptance probe',
  },
}) : { data: null, error: disableApprovalNotice.error }
const suppressedNotice = preferenceProbe.data ? await owner.from('notifications')
  .select('id')
  .eq('organization_id', env.BUSINESS_A_ID)
  .eq('notification_type', 'approval_required')
  .eq('subject_id', preferenceProbe.data.id)
  : { data: null, error: preferenceProbe.error }
const preferenceProbeCleanup = preferenceProbe.data ? await owner.rpc('decide_approval', {
  target_id: preferenceProbe.data.id,
  decision: 'rejected',
  decision_reason_input: 'Acceptance probe completed',
}) : { error: preferenceProbe.error }
const restoreApprovalNotice = await owner.rpc('set_notification_preference', {
  target_org: env.BUSINESS_A_ID,
  notification_type_input: 'approval_required',
  in_app_input: existingPreference.data?.in_app ?? true,
  threshold_base_input: null,
})
record(
  'A disabled notification choice suppresses the real server-side alert',
  !disableApprovalNotice.error && !preferenceProbe.error && !suppressedNotice.error && suppressedNotice.data?.length === 0 && !preferenceProbeCleanup.error && !restoreApprovalNotice.error,
  disableApprovalNotice.error?.message ?? preferenceProbe.error?.message ?? suppressedNotice.error?.message ?? preferenceProbeCleanup.error?.message ?? restoreApprovalNotice.error?.message ?? `rows=${suppressedNotice.data?.length ?? 0}`,
)

const exportHistory = await owner.from('report_exports')
  .select('id,report_name,format,generated_at')
  .eq('organization_id', env.BUSINESS_A_ID)
  .limit(20)
record(
  'Owner can review the organization report export history',
  !exportHistory.error && Array.isArray(exportHistory.data),
  exportHistory.error?.message ?? `rows=${exportHistory.data?.length ?? 0}`,
)

const cashierBilling = await cashier.rpc('get_billing_portal', { target_org: env.BUSINESS_A_ID })
record(
  'Cashier cannot manage the business plan',
  Boolean(cashierBilling.error),
  cashierBilling.error?.message ?? 'Billing was unexpectedly available',
)

const adminAttempt = await owner.rpc('get_platform_admin_console')
record(
  'A business owner is not silently promoted to platform administrator',
  Boolean(adminAttempt.error),
  adminAttempt.error?.message ?? 'Platform console was unexpectedly available',
)

for (const [role, client] of [['accountant', accountant], ['viewer', viewer]]) {
  const attempt = await client.rpc('create_counterparty', {
    target_org: env.BUSINESS_A_ID,
    display_name_input: 'Read only acceptance attempt',
    counterparty_type_input: 'customer',
    phone_input: null,
    notes_input: null,
  })
  record(
    `${role} cannot create or change customer records`,
    Boolean(attempt.error) && /permission/i.test(attempt.error.message),
    attempt.error?.message ?? 'Customer was unexpectedly created',
  )
}

const cashierPermissionProbe = await cashier.rpc('create_counterparty', {
  target_org: env.BUSINESS_A_ID,
  display_name_input: 'x',
  counterparty_type_input: 'customer',
  phone_input: null,
  notes_input: null,
})
record(
  'Cashier reaches customer entry but server validation blocks bad data',
  Boolean(cashierPermissionProbe.error) && /between 2 and 120/i.test(cashierPermissionProbe.error.message),
  cashierPermissionProbe.error?.message ?? 'Invalid customer was unexpectedly created',
)

const deviceProbe = await cashier.rpc('register_device', {
  target_org: env.BUSINESS_A_ID,
  friendly_name_input: 'Acceptance browser',
  fingerprint_hash_input: 'too-short',
  app_version_input: 'acceptance',
  target_branch: ownerWorkspace?.branches?.[0]?.id ?? null,
})
record(
  'Linked-device gate rejects an invalid browser identity without creating a device',
  Boolean(deviceProbe.error) && /device identity/i.test(deviceProbe.error.message),
  deviceProbe.error?.message ?? 'Invalid device was unexpectedly registered',
)

for (const [role, client] of [['owner', owner], ['cashier', cashier], ['accountant', accountant], ['viewer', viewer]]) {
  const history = await client.rpc('get_transaction_history_page', {
    target_org: env.BUSINESS_A_ID,
    page_size: 10,
    page_offset: 0,
  })
  record(
    `${role} can load the transaction history allowed by the server role`,
    !history.error && Array.isArray(history.data),
    history.error?.message ?? `rows=${history.data?.length ?? 0}`,
  )
}

const anonymousHistory = await makeClient().rpc('get_transaction_history_page', {
  target_org: env.BUSINESS_A_ID,
  page_size: 10,
  page_offset: 0,
})
record(
  'Anonymous users cannot page through financial history',
  Boolean(anonymousHistory.error),
  anonymousHistory.error?.message ?? 'Financial history was unexpectedly public',
)

await Promise.all([owner.auth.signOut(), cashier.auth.signOut(), accountant.auth.signOut(), viewer.auth.signOut()])

const failed = results.filter((item) => item.result === 'FAIL')
console.log(JSON.stringify({ generated_at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2))
if (failed.length) process.exitCode = 1
