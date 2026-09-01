import { getSupabaseClient } from './supabase'
import type { RpcResult } from './financialApi'

export type SubscriptionPlan = {
  id: string
  code: string
  name_en: string
  name_dari: string
  name_pashto: string
  description_en: string
  description_dari: string
  description_pashto: string
  price_afn: string
  billing_interval: 'monthly' | 'yearly'
  employee_limit: number
  branch_limit: number
  status: 'draft' | 'published' | 'retired'
  sort_order: number
  features: Record<string, boolean>
}

export type PaymentProvider = {
  code: string
  name_en: string
  name_dari: string
  name_pashto: string
  instructions_en: string
  instructions_dari: string
  instructions_pashto: string
  provider_mode: 'manual_review' | 'hosted_gateway'
  state: 'disabled' | 'configuration_required' | 'live'
  public_checkout_url: string | null
}

export type SubscriptionSummary = {
  id: string
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  plan_id: string
  plan_code: string
  plan_name_en: string
  plan_name_dari: string
  plan_name_pashto: string
}

export type PaymentRequest = {
  id: string
  organization_id?: string
  organization_name?: string
  plan_id: string
  plan_name?: string
  provider_code: string
  amount_afn: string
  payer_reference: string | null
  payer_note?: string | null
  status: string
  requested_at: string
  review_note?: string | null
}

export type BillingPortal = {
  subscription: SubscriptionSummary
  plans: SubscriptionPlan[]
  providers: PaymentProvider[]
  requests: PaymentRequest[]
}

export type PlatformOrganization = {
  id: string
  display_name: string
  created_at: string
  member_count: number
  plan_code: string | null
  subscription_status: string | null
  period_end: string | null
}

export type PlatformConsole = {
  organizations: PlatformOrganization[]
  plans: SubscriptionPlan[]
  providers: PaymentProvider[]
  payment_requests: PaymentRequest[]
  counts: {
    organizations: number
    active_subscriptions: number
    pending_payments: number
    suspended_users: number
  }
}

export type PlatformOrganizationUser = {
  user_id: string
  membership_id: string
  display_name: string
  email: string
  role_code: string
  membership_active: boolean
  platform_status: 'active' | 'suspended'
  platform_reason: string | null
  joined_at: string
}

export async function getBillingPortal(organizationId: string): Promise<RpcResult<BillingPortal>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_billing_portal', { target_org: organizationId })
  return { data: result.data as BillingPortal | null, error: result.error?.message ?? null }
}

export async function createSubscriptionPaymentRequest(input: {
  organizationId: string
  planId: string
  providerCode: string
  reference: string
  note?: string
}): Promise<RpcResult<{ request: PaymentRequest; checkout_url: string | null }>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('create_subscription_payment_request', {
    target_org: input.organizationId,
    target_plan: input.planId,
    target_provider: input.providerCode,
    payer_reference_input: input.reference.trim(),
    payer_note_input: input.note?.trim() || null,
  })
  return { data: result.data as { request: PaymentRequest; checkout_url: string | null } | null, error: result.error?.message ?? null }
}

export async function getPlatformAdminConsole(): Promise<RpcResult<PlatformConsole>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_platform_admin_console')
  return { data: result.data as PlatformConsole | null, error: result.error?.message ?? null }
}

export async function getPlatformOrganizationUsers(organizationId: string): Promise<RpcResult<PlatformOrganizationUser[]>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_platform_organization_users', { target_org: organizationId })
  return { data: result.data as PlatformOrganizationUser[] | null, error: result.error?.message ?? null }
}

export async function decideSubscriptionPayment(input: {
  requestId: string
  decision: 'approved' | 'rejected'
  note: string
}): Promise<RpcResult<PaymentRequest>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('decide_subscription_payment', {
    target_request: input.requestId,
    decision: input.decision,
    review_note_input: input.note.trim(),
  })
  return { data: result.data as PaymentRequest | null, error: result.error?.message ?? null }
}

export async function setPlatformUserAccess(input: {
  userId: string
  status: 'active' | 'suspended'
  reason: string
}): Promise<RpcResult<PlatformOrganizationUser>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_platform_user_access', {
    target_user: input.userId,
    target_status: input.status,
    reason_input: input.reason.trim(),
  })
  return { data: result.data as PlatformOrganizationUser | null, error: result.error?.message ?? null }
}

export async function setSubscriptionStatus(input: {
  organizationId: string
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'expired' | 'cancelled'
  reason: string
}): Promise<RpcResult<SubscriptionSummary>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_subscription_status', {
    target_org: input.organizationId,
    target_status: input.status,
    reason_input: input.reason.trim(),
  })
  return { data: result.data as SubscriptionSummary | null, error: result.error?.message ?? null }
}

export async function setPaymentProviderState(input: {
  providerCode: string
  state: 'disabled' | 'configuration_required' | 'live'
}): Promise<RpcResult<PaymentProvider>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_payment_provider_state', {
    provider_code_input: input.providerCode,
    state_input: input.state,
  })
  return { data: result.data as PaymentProvider | null, error: result.error?.message ?? null }
}
