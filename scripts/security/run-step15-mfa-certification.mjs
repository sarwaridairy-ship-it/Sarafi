import { mkdirSync, writeFileSync } from 'node:fs'
import { elevateMfaFixture, readEnvFile, signInMfaFixtureAal1 } from './mfa-fixture.mjs'

const env = { ...readEnvFile('.env.step16.local'), ...readEnvFile('.env.mfa15.local'), ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_MFA_OWNER_A_EMAIL', 'SARAFI_E2E_MFA_OWNER_A_PASSWORD', 'SARAFI_E2E_MFA_OWNER_A_MEMBERSHIP_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing MFA certification setting: ${key}`)
const results = []
const record = (name, passed, detail = '') => results.push({ name, result: passed ? 'PASS' : 'FAIL', detail })
const signedIn = await signInMfaFixtureAal1(env.BUSINESS_A_ID)
const client = signedIn.client
const cashierMembership = env.CASHIER_A_MEMBERSHIP_ID ?? (await client.from('organization_memberships').select('id').eq('organization_id', env.BUSINESS_A_ID).eq('role_code', 'cashier').eq('active', true).limit(1).maybeSingle()).data?.id
if (!cashierMembership) throw new Error('No active cashier membership found in the isolated MFA organization')
record('MFA owner starts at AAL1', signedIn.beforeLevel === 'aal1', signedIn.beforeLevel)
const factorsBefore = await client.auth.mfa.listFactors()
const availableFactors = factorsBefore.data?.all ?? factorsBefore.data?.totp ?? []
record('Repeatable TOTP factor is available', !factorsBefore.error && availableFactors.some((factor) => factor.id === signedIn.fixture.SARAFI_E2E_MFA_FACTOR_ID), factorsBefore.error?.message ?? '')
const aal1Attempt = await client.rpc('set_membership_active', { target_membership: cashierMembership, active_input: true, reason_input: 'Step 15 AAL1 denial certification' })
record('MFA_AAL1_DENIAL', Boolean(aal1Attempt.error), aal1Attempt.error?.message ?? 'privileged RPC unexpectedly allowed')
const challenge = await client.auth.mfa.challenge({ factorId: signedIn.fixture.SARAFI_E2E_MFA_FACTOR_ID })
if (challenge.error) throw new Error(`TOTP challenge failed: ${challenge.error.message}`)
const wrong = await client.auth.mfa.verify({ factorId: signedIn.fixture.SARAFI_E2E_MFA_FACTOR_ID, challengeId: challenge.data.id, code: '000000' })
record('Wrong TOTP is denied', Boolean(wrong.error), wrong.error?.message ?? 'wrong code unexpectedly accepted')
const levelAfter = await elevateMfaFixture(client, signedIn.fixture)
record('TOTP verification reaches AAL2', levelAfter === 'aal2', levelAfter)
const aal2Attempt = await client.rpc('set_membership_active', { target_membership: cashierMembership, active_input: true, reason_input: 'Step 15 AAL2 allowance certification' })
record('MFA_AAL2_ALLOWANCE', !aal2Attempt.error, aal2Attempt.error?.message ?? '')
const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), passed: results.filter((item) => item.result === 'PASS').length, failed: results.filter((item) => item.result === 'FAIL').length, results }
mkdirSync('test-results/step15', { recursive: true })
writeFileSync('test-results/step15/mfa-certification-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
