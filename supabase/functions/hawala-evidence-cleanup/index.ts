import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(503, { error: "Cleanup service is unavailable" });
  if (request.headers.get("apikey") !== serviceRoleKey) return reply(401, { error: "Service authorization required" });

  let requestedBatchSize = 100;
  try {
    const body = await request.json() as { batch_size?: number };
    requestedBatchSize = Number(body.batch_size ?? 100);
  } catch {
    return reply(400, { error: "Invalid request body" });
  }
  const batchSize = Math.max(1, Math.min(Number.isFinite(requestedBatchSize) ? requestedBatchSize : 100, 500));
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await admin.rpc("claim_expired_hawala_evidence_v10", {
    batch_size: batchSize,
  });
  if (claimError) return reply(500, { error: "Evidence cleanup claim failed" });

  const paths = [...new Set((claimed ?? []).map((item: { storage_path: string }) => item.storage_path).filter(Boolean))];
  if (!paths.length) return reply(200, { claimed: 0, deleted: 0, failed: 0 });

  const { data: removed, error: removeError } = await admin.storage.from("sarafi-private-documents").remove(paths);
  const removedPaths = new Set((removed ?? []).map((item) => item.name));
  const cleanedPaths = removeError ? [] : paths.filter((path) => removedPaths.has(path));
  const failedPaths = paths.filter((path) => !cleanedPaths.includes(path));
  const { data: finalized, error: finalizeError } = await admin.rpc("finalize_hawala_evidence_cleanup_v10", {
    cleaned_paths: cleanedPaths,
    failed_paths: failedPaths,
    failure_message: removeError?.message ?? (failedPaths.length ? "Storage did not confirm every deletion" : null),
  });
  if (finalizeError) return reply(500, { error: "Evidence cleanup finalization failed", deleted: cleanedPaths.length });

  return reply(failedPaths.length ? 207 : 200, {
    claimed: paths.length,
    deleted: cleanedPaths.length,
    failed: failedPaths.length,
    result: finalized,
  });
});
