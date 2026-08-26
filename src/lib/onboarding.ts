import { getSupabaseClient } from './supabase'

export type BusinessSetup = { display_name: string; language: 'en' | 'fa-AF' | 'ps-AF'; base_currency_code: string; currencies: string[]; branch_name: string; cashbox_name: string }

export async function createBusiness(setup: BusinessSetup): Promise<{ organizationId: string | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { organizationId: null, error: 'Supabase is not configured' }
  let session
  try { session = await client.auth.getSession() } catch (requestError) { return { organizationId: null, error: requestError instanceof Error ? requestError.message : 'Unable to check authentication' } }
  if (!session.data.session) return { organizationId: null, error: 'Authentication required' }
  try {
    const result = await client.rpc('create_business', { command: setup })
    return { organizationId: result.data?.id ?? null, error: result.error?.message ?? null }
  } catch (requestError) {
    return { organizationId: null, error: requestError instanceof Error ? requestError.message : 'Business creation request failed' }
  }
}
