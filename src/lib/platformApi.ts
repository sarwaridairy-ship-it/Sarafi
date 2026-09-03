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
  audit_events: Array<{ id: string; event_type: string; target_organization_id: string | null; organization_name: string | null; target_user_id: string | null; created_at: string }>
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

export type PlatformOperations = {
  health: { database: string; checked_at: string; private_storage: boolean; unbalanced_posted_entries: number; expired_pending_approvals: number; pending_support_requests: number }
  versions: Array<{ id: string; platform: 'web' | 'android' | 'ios'; minimum_version: string; recommended_version: string; force_update: boolean; release_notes_en: string; release_notes_dari: string; release_notes_pashto: string; active: boolean; updated_at: string }>
  announcements: Array<{ id: string; announcement_type: string; message_en: string; message_dari: string; message_pashto: string; active: boolean; starts_at: string | null; ends_at: string | null; updated_at: string }>
  support_requests: Array<{ id: string; organization_id: string; organization_name: string; requested_scope: string[]; reason: string; requested_hours: number; status: string; requested_at: string; decided_at: string | null; grant_id: string | null; expires_at: string | null; revoked_at: string | null }>
  organization_features: Array<{ organization_id: string; feature_code: string; enabled: boolean; updated_at: string }>
}

export type PublicPlatformStatus = {
  web_version: null | { minimum_version: string; recommended_version: string; force_update: boolean; release_notes_en: string; release_notes_dari: string; release_notes_pashto: string; updated_at: string }
  announcements: Array<{ id: string; type: string; message_en: string; message_dari: string; message_pashto: string }>
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

export async function getPlatformOperations(): Promise<RpcResult<PlatformOperations>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_platform_operations')
  return { data: result.data as PlatformOperations | null, error: result.error?.message ?? null }
}

export async function getPublicPlatformStatus(): Promise<RpcResult<PublicPlatformStatus>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_public_platform_status')
  return { data: result.data as PublicPlatformStatus | null, error: result.error?.message ?? null }
}

export async function setPlatformAppVersion(input: { platform: 'web' | 'android' | 'ios'; minimumVersion: string; recommendedVersion: string; forceUpdate: boolean; releaseNotesEn: string; releaseNotesDari: string; releaseNotesPashto: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_platform_app_version', { command: {
    platform: input.platform,
    minimum_version: input.minimumVersion,
    recommended_version: input.recommendedVersion,
    force_update: input.forceUpdate,
    release_notes_en: input.releaseNotesEn,
    release_notes_dari: input.releaseNotesDari,
    release_notes_pashto: input.releaseNotesPashto,
  } })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setPlatformAnnouncement(input: { type: 'maintenance' | 'security' | 'service'; messageEn: string; messageDari: string; messagePashto: string; active: boolean; startsAt?: string; endsAt?: string }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_platform_announcement', { command: {
    announcement_type: input.type,
    message_en: input.messageEn,
    message_dari: input.messageDari,
    message_pashto: input.messagePashto,
    active: input.active,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
  } })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function setPlatformOrganizationFeature(organizationId: string, feature: string, enabled: boolean): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('set_organization_feature_state', { target_org: organizationId, feature_input: feature, enabled_input: enabled })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function requestSupportAccess(input: { organizationId: string; scope: string[]; reason: string; hours: number }): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('request_support_access', { target_org: input.organizationId, scope_input: input.scope, reason_input: input.reason, hours_input: input.hours })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function revokePlatformSupportAccess(requestId: string, reason: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('revoke_support_access', { target_request: requestId, reason_input: reason })
  return { data: result.data, error: result.error?.message ?? null }
}

export async function getSupportDiagnostics(organizationId: string): Promise<RpcResult<Record<string, unknown>>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: 'Supabase is not configured' }
  const result = await client.rpc('get_support_diagnostics', { target_org: organizationId })
  return { data: result.data as Record<string, unknown> | null, error: result.error?.message ?? null }
}
