import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
const pinPattern = /^\d{6}$/;
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const decodeJwt = (token: string): Record<string, unknown> => {
  try { return JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"))); }
  catch { return {}; }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Authentication required" });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(503, { error: "App lock service is unavailable" });

  const token = authorization.slice(7);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "Authentication required" });

  let body: { action?: string; organization_id?: string; device_id?: string; pin?: string };
  try { body = await request.json(); } catch { return reply(400, { error: "Invalid request body" }); }
  if (!body.organization_id) return reply(400, { error: "Organization is required" });
  if (!body.device_id) return reply(400, { error: "Registered device is required" });
  const { data: allowed } = await userClient.rpc("has_capability", { target_org: body.organization_id, capability: "workspace.view", optional_scope: {} });
  if (!allowed) return reply(403, { error: "Workspace access denied" });

  const userId = userData.user.id;
  const { data: device } = await admin.from("devices").select("id,status").eq("id", body.device_id).eq("organization_id", body.organization_id).eq("user_id", userId).maybeSingle();
  if (!device || device.status === "revoked") return reply(403, { error: "Registered active device is required" });
  const audit = async (eventType: string, metadata: Record<string, unknown> = {}) => {
    await admin.from("security_audit_events").insert({ organization_id: body.organization_id, actor_user_id: userId, target_device_id: body.device_id, event_type: eventType, metadata });
  };
  if (body.action === "status") {
    const { data } = await admin.from("app_lock_credentials").select("locked_until").eq("organization_id", body.organization_id).eq("user_id", userId).eq("device_id", body.device_id).maybeSingle();
    return reply(200, { configured: Boolean(data), lockedUntil: data?.locked_until ?? null, passkeyEnabled: true });
  }

  if (body.action === "configure") {
    if (!pinPattern.test(body.pin ?? "")) return reply(400, { error: "PIN must contain exactly six digits" });
    if (decodeJwt(token).aal !== "aal2") return reply(403, { error: "Two-step verification is required before changing the app PIN" });
    const salt = randomBytes(16);
    const hash = scryptSync(body.pin!, salt, 32, scryptOptions);
    const { error } = await admin.from("app_lock_credentials").upsert({
      organization_id: body.organization_id, user_id: userId, device_id: body.device_id, pin_salt: salt.toString("hex"), pin_hash: hash.toString("hex"),
      kdf: "scrypt", kdf_parameters: { N: scryptOptions.N, r: scryptOptions.r, p: scryptOptions.p, keyLength: 32 }, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
    });
    if (error) return reply(503, { error: "PIN could not be saved" });
    await audit("app_lock_pin_configured", { kdf: "scrypt", parameters: { N: scryptOptions.N, r: scryptOptions.r, p: scryptOptions.p } });
    return reply(200, { configured: true });
  }

  const issueGrant = async (method: "scrypt_pin" | "passkey") => {
    const raw = randomBytes(32).toString("base64url");
    const sha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
    const grantSha256 = Array.from(sha, (value) => value.toString(16).padStart(2, "0")).join("");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error } = await admin.from("app_unlock_grants").insert({ organization_id: body.organization_id, user_id: userId, device_id: body.device_id, grant_sha256: grantSha256, authentication_method: method, purpose: "sensitive_actions", scope: {}, expires_at: expiresAt });
    if (error) return reply(503, { error: "Unlock grant could not be issued" });
    await audit("app_lock_unlocked", { authentication_method: method, purpose: "sensitive_actions", expires_at: expiresAt });
    return reply(200, { grant: raw, expiresAt });
  };

  if (body.action === "grant-passkey") {
    const amr = decodeJwt(token).amr;
    const methods = Array.isArray(amr) ? amr.map((item) => typeof item === "string" ? item : (item as { method?: string }).method) : [];
    if (!methods.includes("passkey") && !methods.includes("webauthn")) return reply(403, { error: "A fresh passkey verification is required" });
    return await issueGrant("passkey");
  }

  if (body.action !== "verify" || !pinPattern.test(body.pin ?? "")) return reply(400, { error: "Enter the six-digit PIN" });
  const { data: credential, error: credentialError } = await admin.from("app_lock_credentials").select("pin_salt,pin_hash,kdf_parameters,failed_attempts,locked_until").eq("organization_id", body.organization_id).eq("user_id", userId).eq("device_id", body.device_id).maybeSingle();
  if (credentialError || !credential) return reply(404, { error: "No app PIN is configured" });
  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) return reply(429, { error: "Too many attempts. Try again later", lockedUntil: credential.locked_until });
  const parameters = credential.kdf_parameters as { N?: number; r?: number; p?: number; keyLength?: number };
  const candidate = scryptSync(body.pin!, Buffer.from(credential.pin_salt, "hex"), parameters.keyLength ?? 32, { N: parameters.N ?? 32768, r: parameters.r ?? 8, p: parameters.p ?? 1, maxmem: 128 * 1024 * 1024 });
  const stored = Buffer.from(credential.pin_hash, "hex");
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
    const attempts = Number(credential.failed_attempts ?? 0) + 1;
    const retryDelaySeconds = attempts >= 5 ? 15 * 60 : Math.min(60, 2 ** attempts);
    const lockedUntil = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
    await admin.from("app_lock_credentials").update({ failed_attempts: attempts, locked_until: lockedUntil, updated_at: new Date().toISOString() }).eq("organization_id", body.organization_id).eq("user_id", userId).eq("device_id", body.device_id);
    await audit(attempts >= 5 ? "app_lock_pin_locked" : "app_lock_pin_failed", { attempts, retry_after_seconds: retryDelaySeconds });
    return reply(attempts >= 5 ? 429 : 401, { error: attempts >= 5 ? "Too many attempts. Try again later" : "PIN is not correct", lockedUntil });
  }
  await admin.from("app_lock_credentials").update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("organization_id", body.organization_id).eq("user_id", userId).eq("device_id", body.device_id);
  return await issueGrant("scrypt_pin");
});
