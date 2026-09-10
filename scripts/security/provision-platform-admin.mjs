import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: secretKey,
  SARAFI_ADMIN_EMAIL: email,
  SARAFI_ADMIN_PASSWORD: password,
  SARAFI_ADMIN_DISPLAY_NAME: displayName = 'SARAFI Administrator',
  SARAFI_EXPECTED_SUPABASE_HOST: expectedHost,
} = process.env

for (const [key, value] of Object.entries({
  SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: secretKey,
  SARAFI_ADMIN_EMAIL: email,
  SARAFI_ADMIN_PASSWORD: password,
  SARAFI_EXPECTED_SUPABASE_HOST: expectedHost,
})) {
  if (!value) throw new Error(`${key} is required in the trusted terminal`)
}

if (new URL(url).hostname !== expectedHost) {
  throw new Error(`Refusing to provision an administrator outside ${expectedHost}`)
}
if (!email.includes('@') || password.length < 10 || displayName.trim().length < 2) {
  throw new Error('Administrator email, password, or display name is invalid')
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

let existingUser = null
for (let page = 1; page <= 20 && !existingUser; page += 1) {
  const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (listed.error) throw new Error(`List users: ${listed.error.message}`)
  existingUser = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
  if (listed.data.users.length < 1000) break
}

let user = existingUser
let created = false
if (user) {
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    app_metadata: { ...user.app_metadata, platform_admin: true },
    user_metadata: { ...user.user_metadata, display_name: displayName.trim() },
  })
  if (updated.error || !updated.data.user) throw new Error(`Update administrator: ${updated.error?.message ?? 'missing user'}`)
  user = updated.data.user
} else {
  const createdUser = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { platform_admin: true },
    user_metadata: { display_name: displayName.trim() },
  })
  if (createdUser.error || !createdUser.data.user) throw new Error(`Create administrator: ${createdUser.error?.message ?? 'missing user'}`)
  user = createdUser.data.user
  created = true
}

const platformAdmin = await admin
  .from('platform_admins')
  .upsert({
    user_id: user.id,
    display_name: displayName.trim(),
    admin_role: 'super_admin',
    active: true,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  .select('user_id, admin_role, active')
  .single()

if (platformAdmin.error || !platformAdmin.data) {
  throw new Error(`Create platform administrator record: ${platformAdmin.error?.message ?? 'missing row'}`)
}
if (platformAdmin.data.admin_role !== 'super_admin' || platformAdmin.data.active !== true) {
  throw new Error('Platform administrator verification failed')
}

const access = await admin
  .from('platform_user_access')
  .upsert({
    user_id: user.id,
    status: 'active',
    reason: null,
    changed_by: user.id,
    changed_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  .select('status')
  .single()

if (access.error || access.data?.status !== 'active') {
  throw new Error(`Activate administrator: ${access.error?.message ?? 'verification failed'}`)
}

console.log(JSON.stringify({
  project_host: new URL(url).hostname,
  user_id: user.id,
  administrator_role: platformAdmin.data.admin_role,
  active: platformAdmin.data.active,
  account_created: created,
}, null, 2))
