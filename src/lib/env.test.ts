import { describe, expect, it } from 'vitest'
import { validateClientEnvironment } from './env'

describe('environment validation', () => {
  it('accepts a complete public Supabase configuration', () => {
    expect(validateClientEnvironment({ MODE: 'development', VITE_SUPABASE_URL: 'https://demo.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' } as unknown as ImportMetaEnv).supabaseConfigured).toBe(true)
  })
  it('rejects a half-configured Supabase environment', () => {
    expect(() => validateClientEnvironment({ MODE: 'development', VITE_SUPABASE_URL: 'https://demo.supabase.co' } as unknown as ImportMetaEnv)).toThrow('must be supplied together')
  })
})
