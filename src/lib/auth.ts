import type { AuthenticatorAssuranceLevels, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

export type AuthResult = { user: User | null; error: string | null }
export type MfaState = { aal: AuthenticatorAssuranceLevels | null; verified: boolean }

async function withTimeout<T>(request: Promise<T>, message = 'The request timed out. Check your connection and try again.'): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(message)), 12000) })
  try { return await Promise.race([request, timeout]) } finally { if (timeoutId !== undefined) window.clearTimeout(timeoutId) }
}

function clientOrError(): { client: SupabaseClient | null; error: string | null } {
  const client = getSupabaseClient()
  return client ? { client, error: null } : { client: null, error: 'Supabase is not configured' }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const { client, error } = clientOrError()
  if (!client) return { user: null, error }
  let result
  try { result = await withTimeout(client.auth.signInWithPassword({ email: email.trim(), password })) } catch (requestError) { return { user: null, error: requestError instanceof Error ? requestError.message : 'Sign-in request failed' } }
  return { user: result.data.user, error: result.error?.message ?? null }
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  const { client, error } = clientOrError()
  if (!client) return { user: null, error }
  let result
  try { result = await withTimeout(client.auth.signUp({ email: email.trim(), password })) } catch (requestError) { return { user: null, error: requestError instanceof Error ? requestError.message : 'Sign-up request failed' } }
  return { user: result.data.user, error: result.error?.message ?? null }
}

export async function sendPasswordReset(email: string, redirectTo: string): Promise<string | null> {
  const { client, error } = clientOrError()
  if (!client) return error
  let result
  try { result = await withTimeout(client.auth.resetPasswordForEmail(email.trim(), { redirectTo })) } catch (requestError) { return requestError instanceof Error ? requestError.message : 'Password reset request failed' }
  return result.error?.message ?? null
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

export async function enrollTotp(friendlyName: string) {
  const { client, error } = clientOrError()
  if (!client) return { factor: null, error }
  const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  return { factor: result.data, error: result.error?.message ?? null }
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
