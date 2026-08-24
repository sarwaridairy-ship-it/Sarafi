export type AppEnvironment = 'local' | 'test' | 'staging' | 'production'

export function validateClientEnvironment(env: ImportMetaEnv = import.meta.env): { environment: AppEnvironment; supabaseConfigured: boolean } {
  const mode = env.MODE === 'production' ? 'production' : env.MODE === 'test' ? 'test' : 'local'
  const hasUrl = Boolean(env.VITE_SUPABASE_URL?.trim())
  const hasAnonKey = Boolean(env.VITE_SUPABASE_ANON_KEY?.trim())
  if ((hasUrl && !hasAnonKey) || (!hasUrl && hasAnonKey)) throw new Error('Supabase URL and anon key must be supplied together')
  return { environment: mode, supabaseConfigured: hasUrl && hasAnonKey }
}
