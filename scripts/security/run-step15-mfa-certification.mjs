import { createClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const parse = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
const env = { ...parse('.env.step16.local'), ...parse('.env.mfa15.local'), ...process.env }
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_MFA_OWNER_A_EMAIL', 'SARAFI_E2E_MFA_OWNER_A_PASSWORD', 'SARAFI_E2E_MFA_OWNER_A_MEMBERSHIP_ID']
for (const key of required) if (!env[key]) throw new Error(`Missing MFA certification setting: ${key}`)
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
const results = []
const record = (name, passed, detail = '') => results.push({ name, result: passed ? 'PASS' : 'FAIL', detail })
const signedIn = await client.auth.signInWithPassword({ email: env.SARAFI_E2E_MFA_OWNER_A_EMAIL, password: env.SARAFI_E2E_MFA_OWNER_A_PASSWORD })
if (signedIn.error) throw new Error(`MFA owner sign-in failed: ${signedIn.error.message}`)
const cashierMembership = env.CASHIER_A_MEMBERSHIP_ID ?? (await client.from('organization_memberships').select('id').eq('organization_id', env.BUSINESS_A_ID).eq('role_code', 'cashier').eq('active', true).limit(1).maybeSingle()).data?.id
if (!cashierMembership) throw new Error('No active cashier membership found in the isolated MFA organization')
const levelBefore = await client.auth.mfa.getAuthenticatorAssuranceLevel()
record('MFA owner starts at AAL1', levelBefore.data?.currentLevel === 'aal1', levelBefore.data?.currentLevel ?? 'none')
const factorsBefore = await client.auth.mfa.listFactors()
record('MFA owner has no verified factor before enrollment', !factorsBefore.data?.totp?.some((factor) => factor.status === 'verified'), `verified=${factorsBefore.data?.totp?.filter((factor) => factor.status === 'verified').length ?? 0}`)
const aal1Attempt = await client.rpc('set_membership_active', { target_membership: cashierMembership, active_input: true, reason_input: 'Step 15 AAL1 denial certification' })
record('MFA_AAL1_DENIAL', Boolean(aal1Attempt.error), aal1Attempt.error?.message ?? 'privileged RPC unexpectedly allowed')
const enrolled = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SECURITY_TEST_MFA_OWNER_A_${randomUUID()}` })
if (enrolled.error || !enrolled.data?.id || !enrolled.data.totp?.secret) throw new Error(`TOTP enrollment failed: ${enrolled.error?.message ?? 'no factor returned'}`)
const factorId = enrolled.data.id
const secret = enrolled.data.totp.secret
const decodeBase32 = (value) => { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const bits = value.replace(/=+$/, '').toUpperCase().split('').map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join(''); return Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2))) }
const code = (time = Date.now()) => { const counter = Math.floor(time / 1000 / 30); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter)); const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest(); const offset = digest[digest.length - 1] & 15; return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0') }
const challenge = await client.auth.mfa.challenge({ factorId })
if (challenge.error) throw new Error(`TOTP challenge failed: ${challenge.error.message}`)
const wrong = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: '000000' })
record('Wrong TOTP is denied', Boolean(wrong.error), wrong.error?.message ?? 'wrong code unexpectedly accepted')
const correctChallenge = await client.auth.mfa.challenge({ factorId })
if (correctChallenge.error) throw new Error(`Second TOTP challenge failed: ${correctChallenge.error.message}`)
const verified = await client.auth.mfa.verify({ factorId, challengeId: correctChallenge.data.id, code: code() })
if (verified.error) throw new Error(`TOTP verification failed: ${verified.error.message}`)
const levelAfter = await client.auth.mfa.getAuthenticatorAssuranceLevel()
record('TOTP enrollment and verification reaches AAL2', levelAfter.data?.currentLevel === 'aal2', levelAfter.data?.currentLevel ?? 'none')
const aal2Attempt = await client.rpc('set_membership_active', { target_membership: cashierMembership, active_input: true, reason_input: 'Step 15 AAL2 allowance certification' })
record('MFA_AAL2_ALLOWANCE', !aal2Attempt.error, aal2Attempt.error?.message ?? '')
const report = { project: new URL(env.SUPABASE_URL).hostname, generated_at: new Date().toISOString(), passed: results.filter((item) => item.result === 'PASS').length, failed: results.filter((item) => item.result === 'FAIL').length, results }
mkdirSync('test-results/step15', { recursive: true })
writeFileSync('test-results/step15/mfa-certification-report.json', `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
