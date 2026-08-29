import type { AuthenticatorAssuranceLevels, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

export type AuthFailureDetails = { error: string | null; errorCode: string | null; status: number | null }
export type DetailedAuthResult = AuthFailureDetails & { user: User | null; sessionActive: boolean }
export type MfaState = { aal: AuthenticatorAssuranceLevels | null; verified: boolean }
export type TotpFactorSummary = { id: string; friendlyName: string; status: string }
export type TotpEnrollment = { id: string; qrCode: string; secret: string; uri: string }
export type MfaReadiness = MfaState & { factors: TotpFactorSummary[]; error: string | null }

async function withTimeout<T>(request: Promise<T>, message = 'The request timed out. Check your connection and try again.'): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error(message)
      error.name = 'TimeoutError'
      reject(error)
    }, 12000)
  })
  try { return await Promise.race([request, timeout]) } finally { if (timeoutId !== undefined) window.clearTimeout(timeoutId) }
}

function clientOrError(): { client: SupabaseClient | null; error: string | null } {
  const client = getSupabaseClient()
  return client ? { client, error: null } : { client: null, error: 'Supabase is not configured' }
}

const authFailure = (error: { message: string; code?: string; status?: number } | null): AuthFailureDetails => ({
  error: error?.message ?? null,
  errorCode: error?.code ?? null,
  status: error?.status ?? null,
})

const requestFailure = (error: unknown, fallback: string): AuthFailureDetails => ({
  error: error instanceof Error ? error.message : fallback,
  errorCode: error instanceof Error && error.name === 'TimeoutError' ? 'request_timeout' : 'network_error',
  status: null,
})

export async function signInWithPassword(email: string, password: string): Promise<DetailedAuthResult> {
  const { client, error } = clientOrError()
  if (!client) return { user: null, sessionActive: false, error, errorCode: 'supabase_not_configured', status: null }
  let result
  try { result = await withTimeout(client.auth.signInWithPassword({ email: email.trim(), password })) } catch (requestError) { return { user: null, sessionActive: false, ...requestFailure(requestError, 'Sign-in request failed') } }
  return { user: result.data.user, sessionActive: Boolean(result.data.session), ...authFailure(result.error) }
}

export async function signUpWithPassword(email: string, password: string): Promise<DetailedAuthResult> {
  const { client, error } = clientOrError()
  if (!client) return { user: null, sessionActive: false, error, errorCode: 'supabase_not_configured', status: null }
  let result
  try { result = await withTimeout(client.auth.signUp({ email: email.trim(), password })) } catch (requestError) { return { user: null, sessionActive: false, ...requestFailure(requestError, 'Sign-up request failed') } }
  return { user: result.data.user, sessionActive: Boolean(result.data.session), ...authFailure(result.error) }
}

export async function sendPasswordReset(email: string, redirectTo: string): Promise<AuthFailureDetails> {
  const { client, error } = clientOrError()
  if (!client) return { error, errorCode: 'supabase_not_configured', status: null }
  let result
  try { result = await withTimeout(client.auth.resetPasswordForEmail(email.trim(), { redirectTo })) } catch (requestError) { return requestFailure(requestError, 'Password reset request failed') }
  return authFailure(result.error)
}

export async function signOut(): Promise<string | null> {
  const { client, error } = clientOrError()
  if (!client) return error
  const result = await client.auth.signOut()
  return result.error?.message ?? null
}

export async function getMfaState(): Promise<MfaState> {
  const { client } = clientOrError()
  if (!client) return { aal: null, verified: false }
  const result = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  return { aal: result.data?.currentLevel ?? null, verified: result.data?.currentLevel === 'aal2' }
}

export async function getMfaReadiness(): Promise<MfaReadiness> {
  const { client, error } = clientOrError()
  if (!client) return { aal: null, verified: false, factors: [], error }
  const [assurance, factors] = await Promise.all([
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
    client.auth.mfa.listFactors(),
  ])
  const currentLevel = assurance.data?.currentLevel ?? null
  return {
    aal: currentLevel,
    verified: currentLevel === 'aal2',
    factors: (factors.data?.totp ?? []).filter((factor) => factor.status === 'verified').map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? 'Authenticator app', status: factor.status })),
    error: assurance.error?.message ?? factors.error?.message ?? null,
  }
}

export async function enrollTotp(friendlyName: string): Promise<{ factor: TotpEnrollment | null; error: string | null }> {
  const { client, error } = clientOrError()
  if (!client) return { factor: null, error }
  const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  if (result.error || !result.data?.totp) return { factor: null, error: result.error?.message ?? 'Authenticator setup could not be started' }
  return { factor: { id: result.data.id, qrCode: result.data.totp.qr_code, secret: result.data.totp.secret, uri: result.data.totp.uri }, error: null }
}

export async function verifyTotp(factorId: string, code: string): Promise<string | null> {
  const { client, error } = clientOrError()
  if (!client) return error
  const challenge = await client.auth.mfa.challenge({ factorId })
  if (challenge.error) return challenge.error.message
  const result = await client.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() })
  return result.error?.message ?? null
}

export function subscribeToOrganizationActivity(organizationId: string, onChange: () => void): (() => void) | null {
  const client = getSupabaseClient()
  if (!client) return null
  const channel: RealtimeChannel = client.channel(`organization:${organizationId}:activity`).on('postgres_changes', { event: '*', schema: 'public', table: 'financial_events', filter: `organization_id=eq.${organizationId}` }, onChange).subscribe()
  return () => { void client.removeChannel(channel) }
}
