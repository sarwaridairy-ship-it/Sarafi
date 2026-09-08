type RpcFailureBody = {
  target_org?: unknown;
  organization_id?: unknown;
  command?: { organization_id?: unknown };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function releaseVersion(env: ImportMetaEnv = import.meta.env): string {
  return env.VITE_RELEASE_VERSION?.trim()
    || env.VITE_VERCEL_GIT_COMMIT_SHA?.trim()
    || "development";
}

function rpcNameFromUrl(url: string): string | null {
  const match = url.match(/\/rest\/v1\/rpc\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function organizationIdFromBody(body: BodyInit | null | undefined): string | null {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body) as RpcFailureBody;
    const candidate = parsed.target_org ?? parsed.organization_id ?? parsed.command?.organization_id;
    return typeof candidate === "string" && uuidPattern.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function createTelemetryFetch(
  supabaseUrl: string,
  baseFetch: typeof fetch = fetch,
  env: ImportMetaEnv = import.meta.env,
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const rpcName = rpcNameFromUrl(requestUrl);
    if (response.ok || !rpcName || rpcName === "record_client_telemetry") return response;

    const correlationId = crypto.randomUUID();
    const organizationId = organizationIdFromBody(init?.body);
    void response.clone().json().catch(() => ({})).then((payload: { code?: unknown }) => {
      const headers = new Headers(init?.headers);
      headers.set("content-type", "application/json");
      return baseFetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/record_client_telemetry`, {
        method: "POST",
        headers,
        keepalive: true,
        body: JSON.stringify({ command: {
          organization_id: organizationId,
          release_version: releaseVersion(env),
          route: typeof window === "undefined" ? "server" : window.location.pathname,
          rpc_name: rpcName,
          rpc_error_code: typeof payload.code === "string" ? payload.code : `HTTP_${response.status}`,
          correlation_id: correlationId,
          http_status: response.status,
          online: typeof navigator === "undefined" ? null : navigator.onLine,
        } }),
      });
    }).catch(() => undefined);
    return response;
  };
}
