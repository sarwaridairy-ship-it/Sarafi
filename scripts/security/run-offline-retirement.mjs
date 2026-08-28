import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const offline = readFileSync('src/lib/offline.ts', 'utf8')
const store = readFileSync('src/lib/offlineStore.ts', 'utf8')
const serviceWorker = readFileSync('public/sw.js', 'utf8')
const migration = readFileSync('supabase/migrations/202608270012_retire_offline_financial_sync.sql', 'utf8')
const checks = [
  ['OFFLINE_FINANCIAL_POSTING_DISABLED', !offline.includes('record_fx_trade') && !offline.includes('record_operation') && !offline.includes('settleDebt') && migration.includes('drop function')],
  ['LEGACY_OFFLINE_COMMAND_AUTO_REPLAY_DENIED', store.includes("status: 'legacy_review_required'") && store.includes('This transaction was never posted')],
  ['NO_BACKGROUND_FINANCIAL_REPLAY', !serviceWorker.includes('sync_offline') && !serviceWorker.includes('backgroundSync') && !serviceWorker.includes('accept_offline')],
  ['DRAFTS_ARE_NOT_POSTED', offline.includes("status: 'draft_offline'") && offline.includes('draft_offline')],
  ['RECONNECT_HAS_NO_POST_CALLBACK', offline.includes('bindOfflineReconnect') && offline.includes('onReconnect') && !offline.includes('record_fx_trade')],
]
const report = { generated_at: new Date().toISOString(), passed: checks.filter(([, passed]) => passed).length, failed: checks.filter(([, passed]) => !passed).length, checks: checks.map(([name, passed]) => ({ name, result: passed ? 'PASS' : 'FAIL' })) }
mkdirSync('test-results/step15', { recursive: true })
writeFileSync('test-results/step15/offline-retirement-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
