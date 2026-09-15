import { createClient } from "npm:@supabase/supabase-js@2";

const baseJsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const allowedOrigins = new Set((Deno.env.get("ALLOWED_ORIGINS")
    ?? "https://sarafi-swart.vercel.app,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:5175,http://localhost:5175")
    .split(",").map((value) => value.trim()).filter(Boolean));
  const requestOrigin = request.headers.get("Origin") ?? "";
  const jsonHeaders = {
    ...baseJsonHeaders,
    "Access-Control-Allow-Origin": allowedOrigins.has(requestOrigin)
      ? requestOrigin
      : "https://sarafi-swart.vercel.app",
    "Vary": "Origin",
  };
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: jsonHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { error: "Method not allowed" }, jsonHeaders);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Authentication required" }, jsonHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(503, { error: "Document service is unavailable" }, jsonHeaders);
  }

  let payload: { organization_id?: string; document_id?: string; device_id?: string; app_unlock_grant?: string; action?: string };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Invalid request body" }, jsonHeaders);
  }
  if (!payload.organization_id || !payload.document_id || !payload.device_id || !payload.app_unlock_grant) {
    return response(400, { error: "Organization, document, trusted device, and fresh unlock are required" }, jsonHeaders);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return response(401, { error: "Authentication required" }, jsonHeaders);
  }

  const { data: access, error: accessError } = await userClient.rpc(
    "authorize_private_document_access",
    {
      target_org: payload.organization_id,
      target_document: payload.document_id,
      target_device: payload.device_id,
      raw_grant: payload.app_unlock_grant,
      requested_action: payload.action === "download" ? "download" : "view",
    },
  );
  if (accessError || !access?.storage_path) {
    return response(403, { error: "Document access denied" }, jsonHeaders);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expiresIn = Math.min(Math.max(Number(access.expires_in) || 300, 30), 300);
  const { data: signed, error: signedError } = await adminClient.storage
    .from("sarafi-private-documents")
    .createSignedUrl(access.storage_path, expiresIn);
  if (signedError || !signed?.signedUrl) {
    return response(503, { error: "Document link could not be created" }, jsonHeaders);
  }

  return response(200, {
    signedUrl: signed.signedUrl,
    expiresIn,
    auditEventId: access.audit_event_id,
  }, jsonHeaders);
});
