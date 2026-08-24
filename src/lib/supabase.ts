import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type PublicSupabaseConfig = { url: string; anonKey: string }

export function readPublicSupabaseConfig(env: ImportMetaEnv = import.meta.env): PublicSupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
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
