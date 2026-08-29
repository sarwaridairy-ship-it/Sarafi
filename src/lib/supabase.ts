import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PublicSupabaseConfig = { url: string; anonKey: string }

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
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } },
  })
  return client
}
