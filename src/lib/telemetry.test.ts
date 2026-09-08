import { describe, expect, it, vi } from "vitest";
import { createTelemetryFetch, releaseVersion } from "./telemetry";

describe("redacted RPC telemetry", () => {
  it("selects a stable release identifier", () => {
    expect(releaseVersion({ VITE_RELEASE_VERSION: "v6.0.0" } as unknown as ImportMetaEnv)).toBe("v6.0.0");
    expect(releaseVersion({ VITE_VERCEL_GIT_COMMIT_SHA: "abc123" } as unknown as ImportMetaEnv)).toBe("abc123");
  });

  it("records only safe failure context and never copies the RPC payload", async () => {
    const baseFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "42501", message: "private detail" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ recorded: true }), { status: 200 }));
    const observed = createTelemetryFetch("https://example.supabase.co", baseFetch, { VITE_RELEASE_VERSION: "v6" } as unknown as ImportMetaEnv);
    const sensitivePayload = JSON.stringify({ target_org: "11111111-1111-4111-8111-111111111111", command: { identity_number: "SECRET" } });

    await observed("https://example.supabase.co/rest/v1/rpc/pay_hawala_beneficiary", { method: "POST", body: sensitivePayload });
    await vi.waitFor(() => expect(baseFetch).toHaveBeenCalledTimes(2));

    const telemetryInit = baseFetch.mock.calls[1][1];
    const telemetryBody = JSON.parse(String(telemetryInit?.body)).command;
    expect(telemetryBody).toMatchObject({
      organization_id: "11111111-1111-4111-8111-111111111111",
      release_version: "v6",
      rpc_name: "pay_hawala_beneficiary",
      rpc_error_code: "42501",
      http_status: 403,
    });
    expect(String(telemetryInit?.body)).not.toContain("SECRET");
    expect(String(telemetryInit?.body)).not.toContain("private detail");
  });
});
