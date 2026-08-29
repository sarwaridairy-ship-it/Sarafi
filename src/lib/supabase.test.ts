import { describe, expect, it } from 'vitest'
import { readPublicSupabaseConfig, resolveSupabaseUrl } from './supabase'

describe('browser Supabase configuration', () => {
  it('accepts only the public URL and anon key', () => {
    expect(readPublicSupabaseConfig({ VITE_SUPABASE_URL: 'https://demo.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-key' } as unknown as ImportMetaEnv)).toEqual({ url: 'https://demo.supabase.co', anonKey: 'public-key' })
  })

  it('fails closed when public configuration is incomplete', () => {
    expect(readPublicSupabaseConfig({ VITE_SUPABASE_URL: 'https://demo.supabase.co' } as unknown as ImportMetaEnv)).toBeNull()
  })

  it('uses the same-site production gateway on a hosted website', () => {
    expect(resolveSupabaseUrl('https://demo.supabase.co', { origin: 'https://sarafi.example', hostname: 'sarafi.example' })).toBe('https://sarafi.example/supabase')
  })

  it('keeps direct Supabase access for local development', () => {
    expect(resolveSupabaseUrl('https://demo.supabase.co', { origin: 'http://localhost:5173', hostname: 'localhost' })).toBe('https://demo.supabase.co')
  })
})
