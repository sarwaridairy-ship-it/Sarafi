import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

type RoleFixture = { email: string; password: string };

const expectedRoles = [
  "owner",
  "business_admin",
  "manager",
  "cashier",
  "accountant",
  "compliance_officer",
  "viewer",
] as const;

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const organizationId = process.env.SARAFI_E2E_ORGANIZATION_ID;
const certificationMode = process.env.STEP15_CERTIFICATION === "true";
let fixtures: Partial<Record<(typeof expectedRoles)[number], RoleFixture>> = {};
try {
  fixtures = JSON.parse(process.env.SARAFI_E2E_ROLE_FIXTURES ?? "{}") as typeof fixtures;
} catch {
  fixtures = {};
}

test.describe("authenticated seven-role contract", () => {
  for (const role of expectedRoles) {
    test(`${role} receives its server role and capability bundle`, async () => {
      const fixture = fixtures[role];
      const missing = !url || !anonKey || !organizationId || !fixture?.email || !fixture.password;
      if (certificationMode) expect(missing, `Protected release requires a complete ${role} fixture`).toBe(false);
      else test.skip(missing, `Set SARAFI_E2E_ROLE_FIXTURES.${role} to run this journey`);

      const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
      const signedIn = await client.auth.signInWithPassword(fixture!);
      expect(signedIn.error).toBeNull();

      const context = await client.rpc("get_my_workspace_context");
      expect(context.error).toBeNull();
      const membership = (context.data as Array<{ organization_id: string; role_code: string; capabilities: string[] }>).find(
        (item) => item.organization_id === organizationId,
      );
      expect(membership?.role_code).toBe(role);
      expect(membership?.capabilities).toContain("workspace.view");
      expect(membership?.capabilities).toContain("app_lock.self.manage");
      expect(membership?.capabilities).toContain("app_lock.unlock");
      expect(membership?.capabilities).toContain("app_lock.sensitive_action");
      if (role === "owner" || role === "business_admin") expect(membership?.capabilities).toContain("app_lock.policy.manage");
      else expect(membership?.capabilities).not.toContain("app_lock.policy.manage");

      if (role === "viewer" || role === "accountant" || role === "compliance_officer") {
        expect(membership?.capabilities).not.toContain("financial.post.fx");
        expect(membership?.capabilities).not.toContain("financial.reverse");
      }
      const ownBusiness = await client.from("organizations").select("id").eq("id", organizationId!);
      expect(ownBusiness.error).toBeNull();
      expect(ownBusiness.data).toHaveLength(1);
      const otherBusiness = await client.from("organizations").select("id").neq("id", organizationId!).limit(1);
      expect(otherBusiness.error).toBeNull();
      expect(otherBusiness.data).toEqual([]);
      if (!membership?.capabilities.includes("rates.manage")) {
        const denied = await client.rpc("set_exchange_rate", {
          target_org: organizationId!, target_branch: null,
          source_currency_input: "USD", target_currency_input: "AFN",
          buy_rate_input: "70", sell_rate_input: "71",
        });
        expect(denied.error?.message).toContain("CAPABILITY_REQUIRED:rates.manage");
      }
      if (!membership?.capabilities.includes("data.import")) {
        const denied = await client.rpc("commit_import", { command: {
          organization_id: organizationId!, import_key: `denied-ci-${crypto.randomUUID()}`,
          kind: "counterparties", rows: [],
        } });
        // Authorization must run before row validation or idempotency lookup.
        // Empty rows also ensure a broken permission guard cannot create data.
        expect(denied.error?.code).toBe("42501");
        expect(denied.error?.message).toBe("CAPABILITY_REQUIRED:data.import");
        expect(denied.data).toBeNull();
      }
      if (!membership?.capabilities.includes("owner.capital.post")) {
        const denied = await client.rpc("record_operation", { command: {
          organization_id: organizationId!, client_command_id: crypto.randomUUID(),
          operation: "OWNER_INVESTMENT", currency: "AFN", amount: "0.01",
        } });
        expect(denied.error?.message).toContain("CAPABILITY_REQUIRED:owner.capital.post");
      }
      await client.auth.signOut();
    });
  }
});
