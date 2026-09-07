import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envFile = process.env.SARAFI_SECURITY_ENV ?? '.env.security.local'
const expectedHost = process.env.SARAFI_EXPECTED_SUPABASE_HOST ?? 'vbvwuqzqtcorassvotke.supabase.co'

if (!existsSync(envFile)) throw new Error(`Security fixture file not found: ${envFile}`)

const parseEnv = (content) => Object.fromEntries(
  content
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)

const original = readFileSync(envFile, 'utf8')
const fileEnv = parseEnv(original)
const env = { ...fileEnv, ...process.env }
const secretKey = process.env.SUPABASE_SECRET_KEY
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BUSINESS_A_ID']
for (const key of required) if (!env[key]) throw new Error(`${key} is required to provision the Business Administrator fixture`)
if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is required in the trusted terminal')
if (new URL(env.SUPABASE_URL).hostname !== expectedHost) throw new Error(`SUPABASE_URL must target ${expectedHost}`)

const admin = createClient(env.SUPABASE_URL, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const fixtureClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const business = await admin.from('organizations').select('id').eq('id', env.BUSINESS_A_ID).maybeSingle()
if (business.error || !business.data) throw new Error(`Disposable fixture organization was not found: ${business.error?.message ?? 'missing row'}`)

const existingEmail = fileEnv.SARAFI_E2E_BUSINESS_ADMIN_A_EMAIL
const existingPassword = fileEnv.SARAFI_E2E_BUSINESS_ADMIN_A_PASSWORD
if (Boolean(existingEmail) !== Boolean(existingPassword)) throw new Error('Business Administrator fixture email and password must either both exist or both be absent')

let email = existingEmail
let password = existingPassword
let userId
let created = false

if (email && password) {
  const signedIn = await fixtureClient.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.user) throw new Error(`Existing Business Administrator fixture cannot sign in: ${signedIn.error?.message ?? 'missing user'}`)
  if (signedIn.data.user.user_metadata?.security_fixture !== true) throw new Error('Refusing to modify an account that is not marked as a disposable security fixture')
  userId = signedIn.data.user.id
  await fixtureClient.auth.signOut()
} else {
  const suffix = `${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex')}`
  email = `security-business-admin-a-${suffix}@testing.sarafi.invalid`
  password = `${randomBytes(32).toString('base64url')}!Cp4`
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { security_fixture: true, fixture_label: 'CALM_PREMIUM_BUSINESS_ADMIN_A' },
  })
  if (result.error || !result.data.user) throw new Error(`Create Business Administrator fixture: ${result.error?.message ?? 'missing user'}`)
  userId = result.data.user.id
  created = true
}

const membership = await admin
  .from('organization_memberships')
  .upsert({ organization_id: env.BUSINESS_A_ID, user_id: userId, role_code: 'business_admin', active: true, mfa_required: false }, { onConflict: 'organization_id,user_id' })
  .select('id, role_code, active')
  .single()

if (membership.error || !membership.data) {
  if (created) await admin.auth.admin.deleteUser(userId)
  throw new Error(`Create Business Administrator membership: ${membership.error?.message ?? 'missing row'}`)
}
if (membership.data.role_code !== 'business_admin' || membership.data.active !== true) throw new Error('Business Administrator membership verification failed')

const updates = {
  SARAFI_E2E_BUSINESS_ADMIN_A_EMAIL: email,
  SARAFI_E2E_BUSINESS_ADMIN_A_PASSWORD: password,
  SARAFI_E2E_BUSINESS_ADMIN_A_USER_ID: userId,
  SARAFI_E2E_BUSINESS_ADMIN_A_MEMBERSHIP_ID: membership.data.id,
}
const lines = original.trimEnd().split(/\r?\n/)
for (const [key, value] of Object.entries(updates)) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`))
  if (index >= 0) lines[index] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
}
writeFileSync(envFile, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })

console.log(JSON.stringify({
  project_host: new URL(env.SUPABASE_URL).hostname,
  business_id: env.BUSINESS_A_ID,
  user_id: userId,
  membership_id: membership.data.id,
  fixture_created: created,
  env_file: envFile,
}, null, 2))
