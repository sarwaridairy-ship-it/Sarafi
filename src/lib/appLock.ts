import { getSupabaseClient, isPasskeyFeatureEnabled } from './supabase'

export type AppLockStatus = { configured: boolean; lockedUntil: string | null; passkeyEnabled: boolean; autoLockSeconds: 30 | 60 | 300 | 900; lockOnBackground: boolean }
type UnlockResponse = { grant?: string; expiresAt?: string; configured?: boolean; lockedUntil?: string | null; passkeyEnabled?: boolean; autoLockSeconds?: number; lockOnBackground?: boolean; error?: string }

let activeGrant: { value: string; expiresAt: number; organizationId: string; deviceId: string } | null = null

export function getActiveAppUnlockGrant(organizationId?: string, deviceId?: string): string | undefined {
  if (!activeGrant || activeGrant.expiresAt <= Date.now()) { activeGrant = null; return undefined }
  if (organizationId && activeGrant.organizationId !== organizationId) return undefined
  if (deviceId && activeGrant.deviceId !== deviceId) return undefined
  return activeGrant.value
}

export function clearActiveAppUnlockGrant() { activeGrant = null }

async function invoke(body: Record<string, unknown>): Promise<{ data: UnlockResponse | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.functions.invoke('app-lock', { body })
  const data = result.data as UnlockResponse | null
  return { data, error: result.error?.message ?? data?.error ?? null }
}

export async function getAppLockStatus(organizationId: string, deviceId: string): Promise<{ data: AppLockStatus | null; error: string | null }> {
  const result = await invoke({ action: 'status', organization_id: organizationId, device_id: deviceId })
  return { data: result.data ? { configured: Boolean(result.data.configured), lockedUntil: result.data.lockedUntil ?? null, passkeyEnabled: isPasskeyFeatureEnabled(), autoLockSeconds: [30, 60, 300, 900].includes(result.data.autoLockSeconds ?? 900) ? result.data.autoLockSeconds as AppLockStatus['autoLockSeconds'] : 900, lockOnBackground: result.data.lockOnBackground ?? true } : null, error: result.error }
}

export async function configureAppLockPin(organizationId: string, deviceId: string, pin: string, settings?: Pick<AppLockStatus, 'autoLockSeconds' | 'lockOnBackground'>): Promise<string | null> {
  const result = await invoke({ action: 'configure', organization_id: organizationId, device_id: deviceId, pin, auto_lock_seconds: settings?.autoLockSeconds, lock_on_background: settings?.lockOnBackground })
  return result.error
}

export async function updateAppLockSettings(organizationId: string, deviceId: string, settings: Pick<AppLockStatus, 'autoLockSeconds' | 'lockOnBackground'>): Promise<string | null> {
  const result = await invoke({ action: 'settings', organization_id: organizationId, device_id: deviceId, auto_lock_seconds: settings.autoLockSeconds, lock_on_background: settings.lockOnBackground })
  return result.error
}

export async function disableAppLock(organizationId: string, deviceId: string): Promise<string | null> {
  const result = await invoke({ action: 'disable', organization_id: organizationId, device_id: deviceId })
  if (!result.error) clearActiveAppUnlockGrant()
  return result.error
}

export async function unlockAppWithPin(organizationId: string, deviceId: string, pin: string): Promise<string | null> {
  const result = await invoke({ action: 'verify', organization_id: organizationId, device_id: deviceId, pin })
  if (result.data?.grant && result.data.expiresAt) activeGrant = { value: result.data.grant, expiresAt: new Date(result.data.expiresAt).getTime(), organizationId, deviceId }
  return result.error
}

export async function registerAppPasskey(): Promise<string | null> {
  if (!isPasskeyFeatureEnabled()) return 'Passkeys are not enabled for this deployment'
  const client = getSupabaseClient()
  if (!client) return 'Supabase is not configured'
  const result = await client.auth.registerPasskey()
  return result.error?.message ?? null
}

export async function unlockAppWithPasskey(organizationId: string, deviceId: string): Promise<string | null> {
  if (!isPasskeyFeatureEnabled()) return 'Passkeys are not enabled for this deployment'
  const client = getSupabaseClient()
  if (!client) return 'Supabase is not configured'
  const authResult = await client.auth.signInWithPasskey()
  if (authResult.error) return authResult.error.message
  const result = await invoke({ action: 'grant-passkey', organization_id: organizationId, device_id: deviceId })
  if (result.data?.grant && result.data.expiresAt) activeGrant = { value: result.data.grant, expiresAt: new Date(result.data.expiresAt).getTime(), organizationId, deviceId }
  return result.error
}
