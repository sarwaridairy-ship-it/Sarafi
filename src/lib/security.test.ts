import { describe, expect, it } from 'vitest'
import { readPublicSupabaseConfig } from './supabase'
import { validateClientEnvironment } from './env'

describe('security regression boundaries', () => {
  it('does not accept service-role or secret browser configuration', () => {
    const environment = { MODE: 'production', VITE_SUPABASE_URL: 'https://demo.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-read' }
    const config = readPublicSupabaseConfig(environment as unknown as ImportMetaEnv)
    expect(config).toEqual({ url: environment.VITE_SUPABASE_URL, anonKey: environment.VITE_SUPABASE_ANON_KEY })
    expect(JSON.stringify(config)).not.toContain('service')
  })

  it('fails closed on partial production configuration', () => {
    expect(() => validateClientEnvironment({ MODE: 'production', VITE_SUPABASE_URL: 'https://demo.supabase.co' } as unknown as ImportMetaEnv)).toThrow()
  })
})
