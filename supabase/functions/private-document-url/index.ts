import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: jsonHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Authentication required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(503, { error: "Document service is unavailable" });
  }

  let payload: { organization_id?: string; document_id?: string; action?: string };
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Invalid request body" });
  }
  if (!payload.organization_id || !payload.document_id) {
    return response(400, { error: "Organization and document are required" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return response(401, { error: "Authentication required" });
  }

  const { data: access, error: accessError } = await userClient.rpc(
    "authorize_private_document_access",
    {
      target_org: payload.organization_id,
      target_document: payload.document_id,
      requested_action: payload.action === "download" ? "download" : "view",
    },
  );
  if (accessError || !access?.storage_path) {
    return response(403, { error: "Document access denied" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expiresIn = Math.min(Math.max(Number(access.expires_in) || 300, 30), 300);
  const { data: signed, error: signedError } = await adminClient.storage
    .from("sarafi-private-documents")
    .createSignedUrl(access.storage_path, expiresIn);
  if (signedError || !signed?.signedUrl) {
    return response(503, { error: "Document link could not be created" });
  }

  return response(200, {
    signedUrl: signed.signedUrl,
    expiresIn,
    auditEventId: access.audit_event_id,
  });
});
