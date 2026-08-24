import { describe, expect, it } from 'vitest'
import { readPublicSupabaseConfig } from './supabase'

describe('browser Supabase configuration', () => {
  it('accepts only the public URL and anon key', () => {
    expect(readPublicSupabaseConfig({ VITE_SUPABASE_URL: 'https://demo.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key' } as unknown as ImportMetaEnv)).toEqual({ url: 'https://demo.supabase.co', anonKey: 'public-key' })
  })

  it('fails closed when public configuration is incomplete', () => {
    expect(readPublicSupabaseConfig({ VITE_SUPABASE_URL: 'https://demo.supabase.co' } as unknown as ImportMetaEnv)).toBeNull()
  })
})
