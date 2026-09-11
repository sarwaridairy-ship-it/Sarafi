import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createTelemetryFetch } from './telemetry'

export type PublicSupabaseConfig = { url: string; anonKey: string }

export function isPasskeyFeatureEnabled(env: ImportMetaEnv = import.meta.env): boolean {
  return env.VITE_SUPABASE_PASSKEY_ENABLED?.trim().toLowerCase() === 'true'
}

type BrowserLocation = { origin: string; hostname: string }

export function resolveSupabaseUrl(configuredUrl: string, location?: BrowserLocation): string {
  if (!location) return configuredUrl
  const hostname = location.hostname.toLowerCase()
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  return isLocal ? configuredUrl : `${location.origin.replace(/\/$/, '')}/supabase`
}

export function readPublicSupabaseConfig(
  env: ImportMetaEnv = import.meta.env,
  location: BrowserLocation | undefined = typeof window === 'undefined' ? undefined : window.location,
): PublicSupabaseConfig | null {
  const configuredUrl = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!configuredUrl || !anonKey) return null
  return { url: resolveSupabaseUrl(configuredUrl, location), anonKey }
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  const config = readPublicSupabaseConfig()
  if (!config) return null
  client ??= createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: isPasskeyFeatureEnabled() } },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { fetch: createTelemetryFetch(config.url) },
  })
  return client
}
