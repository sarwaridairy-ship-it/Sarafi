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

      if (role === "viewer" || role === "accountant" || role === "compliance_officer") {
        expect(membership?.capabilities).not.toContain("financial.post.fx");
        expect(membership?.capabilities).not.toContain("financial.reverse");
      }
      await client.auth.signOut();
    });
  }
});
