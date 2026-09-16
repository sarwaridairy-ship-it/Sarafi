import { spawn } from 'node:child_process'
import { readEnvFile } from './mfa-fixture.mjs'

const env = readEnvFile('.env.security.local')
const roles = ['owner', 'business_admin', 'manager', 'cashier', 'accountant', 'compliance_officer', 'viewer']
const fixtures = Object.fromEntries(roles.map((role) => {
  const key = role === 'compliance_officer' ? 'COMPLIANCE' : role.toUpperCase()
  return [role, { email: env[`SARAFI_E2E_${key}_A_EMAIL`], password: env[`SARAFI_E2E_${key}_A_PASSWORD`] }]
}))
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.api.config.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env, VITE_SUPABASE_URL: env.SUPABASE_URL, VITE_SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    SARAFI_E2E_EMAIL: env.SARAFI_E2E_OWNER_A_EMAIL, SARAFI_E2E_PASSWORD: env.SARAFI_E2E_OWNER_A_PASSWORD,
    SARAFI_E2E_ORGANIZATION_ID: env.BUSINESS_A_ID, SARAFI_E2E_ROLE_FIXTURES: JSON.stringify(fixtures),
    STEP15_CERTIFICATION: 'true', SARAFI_EVIDENCE_STAGE: 'local-authenticated',
  },
})
child.on('exit', (code) => { process.exitCode = code ?? 1 })
