import { createHmac, randomUUID } from 'node:crypto'
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
for (const key of [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SARAFI_E2E_OWNER_B_EMAIL',
  'SARAFI_E2E_OWNER_B_PASSWORD',
  'BUSINESS_B_ID',
  'BRANCH_B1_ID',
  'CASHBOX_B1_ID',
]) {
  if (!env[key]) throw new Error(`Missing team acceptance fixture setting: ${key}`)
}

const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const signIn = await client.auth.signInWithPassword({
  email: env.SARAFI_E2E_OWNER_B_EMAIL,
  password: env.SARAFI_E2E_OWNER_B_PASSWORD,
})
if (signIn.error) throw new Error(`Fixture sign-in failed: ${signIn.error.message}`)

const decodeBase32 = (value) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = value
    .replace(/=+$/, '')
    .toUpperCase()
    .split('')
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('')
  return Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    ),
  )
}
const totp = (secret) => {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

const results = []
const record = (test, passed, detail = '') =>
  results.push({ test, result: passed ? 'PASS' : 'FAIL', detail })
const invitationArgs = (email) => ({
  target_org: env.BUSINESS_B_ID,
  invited_email: email,
  invited_name: 'Security Acceptance Employee',
  invited_role: 'cashier',
  branch_scope: [env.BRANCH_B1_ID],
  cashbox_scope: [env.CASHBOX_B1_ID],
  requires_mfa: false,
})

const aal1Attempt = await client.rpc(
  'create_team_invitation',
  invitationArgs(`security-aal1-${randomUUID()}@example.invalid`),
)
record(
  'AAL1 owner cannot create a team invitation',
  Boolean(aal1Attempt.error),
  aal1Attempt.error?.message ?? 'Invitation was unexpectedly created',
)

let factorId
let invitationId
try {
  const enrollment = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `TEAM_ACCEPTANCE_${randomUUID()}`,
  })
  if (enrollment.error || !enrollment.data?.id || !enrollment.data.totp?.secret)
    throw new Error(enrollment.error?.message ?? 'MFA enrollment did not return a secret')
  factorId = enrollment.data.id
  const challenge = await client.auth.mfa.challenge({ factorId })
  if (challenge.error) throw new Error(challenge.error.message)
  const verification = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: totp(enrollment.data.totp.secret),
  })
  if (verification.error) throw new Error(verification.error.message)
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  record(
    'Owner reaches AAL2 for team management',
    !assurance.error && assurance.data?.currentLevel === 'aal2',
    assurance.error?.message ?? assurance.data?.currentLevel ?? 'unknown',
  )

  const invitation = await client.rpc(
    'create_team_invitation',
    invitationArgs(`security-team-${randomUUID()}@example.invalid`),
  )
  invitationId = invitation.data?.id
  record(
    'AAL2 owner creates a scoped cashier invitation',
    !invitation.error && Boolean(invitationId) && invitation.data?.invite_token?.length === 64,
    invitation.error?.message ?? '',
  )

  const controlPlane = await client.rpc('get_team_control_plane', {
    target_org: env.BUSINESS_B_ID,
  })
  const visibleInvitation = controlPlane.data?.invitations?.find(
    (item) => item.id === invitationId,
  )
  record(
    'New invitation appears in the team control center',
    !controlPlane.error &&
      visibleInvitation?.role_code === 'cashier' &&
      visibleInvitation?.branches?.some((branch) => branch.id === env.BRANCH_B1_ID) &&
      visibleInvitation?.cashboxes?.some((cashbox) => cashbox.id === env.CASHBOX_B1_ID),
    controlPlane.error?.message ?? '',
  )

  if (invitationId) {
    const cancelled = await client.rpc('cancel_team_invitation', {
      target_invitation: invitationId,
      reason_input: 'Automated team acceptance cleanup',
    })
    record(
      'Owner can cancel a pending invitation',
      !cancelled.error && cancelled.data?.status === 'cancelled',
      cancelled.error?.message ?? '',
    )
  }
} catch (error) {
  record('Team invitation acceptance flow completes', false, error instanceof Error ? error.message : 'Unknown failure')
} finally {
  if (factorId) {
    const unenrolled = await client.auth.mfa.unenroll({ factorId })
    record(
      'Temporary acceptance MFA factor is removed',
      !unenrolled.error,
      unenrolled.error?.message ?? '',
    )
  }
}

const anonymous = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const anonymousAttempt = await anonymous.rpc(
  'create_team_invitation',
  invitationArgs(`security-anonymous-${randomUUID()}@example.invalid`),
)
record(
  'Anonymous users cannot create team invitations',
  Boolean(anonymousAttempt.error),
  anonymousAttempt.error?.message ?? 'Invitation was unexpectedly created',
)

const report = {
  generated_at: new Date().toISOString(),
  passed: results.filter((item) => item.result === 'PASS').length,
  failed: results.filter((item) => item.result === 'FAIL').length,
  results,
}
console.log(JSON.stringify(report, null, 2))
if (report.failed) process.exitCode = 1
