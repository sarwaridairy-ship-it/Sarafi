import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const readEnvFile = (path) => Object.fromEntries(
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator), line.slice(separator + 1)]
    }),
)

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

const totp = (secret, time = Date.now()) => {
  const counter = Math.floor(time / 1000 / 30)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(buffer).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

export const signInMfaFixtureAal1 = async (expectedBusinessId, path = '.env.mfa15.local') => {
  const fixture = readEnvFile(path)
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SARAFI_E2E_MFA_OWNER_A_EMAIL', 'SARAFI_E2E_MFA_OWNER_A_PASSWORD', 'SARAFI_E2E_MFA_FACTOR_ID', 'SARAFI_E2E_MFA_TOTP_SECRET', 'BUSINESS_A_ID']
  for (const key of required) if (!fixture[key]) throw new Error(`Missing repeatable MFA fixture setting: ${key}`)
  if (fixture.BUSINESS_A_ID !== expectedBusinessId) throw new Error('The MFA owner belongs to a different security fixture; run security:provision-mfa')
  const client = createClient(fixture.SUPABASE_URL, fixture.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const signedIn = await client.auth.signInWithPassword({
    email: fixture.SARAFI_E2E_MFA_OWNER_A_EMAIL,
    password: fixture.SARAFI_E2E_MFA_OWNER_A_PASSWORD,
  })
  if (signedIn.error) throw new Error(`MFA fixture sign-in failed: ${signedIn.error.message}`)
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance.error || assurance.data?.currentLevel !== 'aal1') throw new Error(`MFA fixture did not start at AAL1: ${assurance.error?.message ?? assurance.data?.currentLevel ?? 'unknown'}`)
  return { client, fixture, beforeLevel: assurance.data.currentLevel }
}

export const elevateMfaFixture = async (client, fixture) => {
  let lastError
  for (const offset of [0, -30_000, 30_000]) {
    const challenge = await client.auth.mfa.challenge({ factorId: fixture.SARAFI_E2E_MFA_FACTOR_ID })
    if (challenge.error) throw new Error(`MFA fixture challenge failed: ${challenge.error.message}`)
    const verified = await client.auth.mfa.verify({
      factorId: fixture.SARAFI_E2E_MFA_FACTOR_ID,
      challengeId: challenge.data.id,
      code: totp(fixture.SARAFI_E2E_MFA_TOTP_SECRET, Date.now() + offset),
    })
    if (!verified.error) {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error || assurance.data?.currentLevel !== 'aal2') throw new Error(`MFA fixture did not reach AAL2: ${assurance.error?.message ?? assurance.data?.currentLevel ?? 'unknown'}`)
      return assurance.data.currentLevel
    }
    lastError = verified.error
  }
  throw new Error(`MFA fixture verification failed: ${lastError?.message ?? 'unknown error'}`)
}

export const signInMfaFixtureAtAal2 = async (expectedBusinessId, path = '.env.mfa15.local') => {
  const signedIn = await signInMfaFixtureAal1(expectedBusinessId, path)
  const afterLevel = await elevateMfaFixture(signedIn.client, signedIn.fixture)
  return { ...signedIn, afterLevel }
}
