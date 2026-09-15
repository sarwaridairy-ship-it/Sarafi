import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(process.env.SARAFI_SECURITY_ENV ?? ".env.security.local", "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signedIn = await client.auth.signInWithPassword({ email: env.SARAFI_E2E_OWNER_A_EMAIL, password: env.SARAFI_E2E_OWNER_A_PASSWORD });
if (signedIn.error) throw signedIn.error;
const [context, partners, transfers, settings, snapshot] = await Promise.all([
  client.rpc("get_my_workspace_context"),
  client.rpc("get_hawala_partners", { target_org: env.BUSINESS_A_ID }),
  client.rpc("list_hawala_transfers_v7", { target_org: env.BUSINESS_A_ID, target_branch: env.BRANCH_A1_ID }),
  client.from("organization_settings").select("timezone,app_lock_required_roles,app_lock_max_timeout_seconds,app_lock_sensitive_reunlock_seconds,hawala_tazkira_images_required").eq("organization_id", env.BUSINESS_A_ID).maybeSingle(),
  client.rpc("get_money_valuation_snapshot", { target_org: env.BUSINESS_A_ID, target_business_date: new Date().toISOString().slice(0, 10), target_comparison_currency: "USD", target_scope: { branch_id: env.BRANCH_A1_ID } }),
]);
const own = context.data?.find((item) => item.organization_id === env.BUSINESS_A_ID);
console.log(JSON.stringify({
  role: own?.role_code,
  subscription: own?.subscription,
  capabilities: own?.capabilities,
  branches: own?.branches?.map((item) => item.name),
  partners: partners.data?.map((item) => ({ name: item.name, endpoint_type: item.endpoint_type, recipient_organization_name: item.recipient_organization_name, recipient_branch_name: item.recipient_branch_name, ready: Boolean(item.endpoint_active && item.endpoint_verified_at && item.recipient_organization_id && item.recipient_branch_id) })),
  transferCount: transfers.data?.length ?? null,
  settings: settings.data,
  valuation: snapshot.error ? { error: snapshot.error.message } : {
    source: snapshot.data?.valuation_rate_source,
    board: snapshot.data?.active_rate_board,
    complete: snapshot.data?.total_complete,
    missing: snapshot.data?.missing_currencies,
    stale: snapshot.data?.stale_currencies,
    totals: snapshot.data?.totals,
    currencies: snapshot.data?.currencies,
  },
  errors: [context.error, partners.error, transfers.error, settings.error].filter(Boolean).map((error) => error.message),
}, null, 2));
await client.auth.signOut();
