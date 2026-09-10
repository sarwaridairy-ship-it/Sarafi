import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasCapability, inspectionCapabilities, navigationSections } from "./app/capabilities";
import { capabilityForFinancialRoute, financialRoute, financialRouteSuffix } from "./app/routes";

describe("calm premium capability contract", () => {
  it("keeps Business Administrator operational while owner powers remain unavailable", () => {
    const capabilities = inspectionCapabilities("business_admin");
    expect(hasCapability(capabilities, "financial.post.fx")).toBe(true);
    expect(hasCapability(capabilities, "financial.post.money")).toBe(true);
    expect(hasCapability(capabilities, "financial.post.opening")).toBe(true);
    expect(hasCapability(capabilities, "financial.post.debt")).toBe(true);
    expect(hasCapability(capabilities, "hawala.send")).toBe(true);
    expect(hasCapability(capabilities, "organization.manage")).toBe(true);
    expect(hasCapability(capabilities, "team.capabilities.manage")).toBe(true);
    expect(hasCapability(capabilities, "billing.manage")).toBe(false);
    expect(hasCapability(capabilities, "ownership.transfer")).toBe(false);
    expect(hasCapability(capabilities, "owner.delete")).toBe(false);
    expect(hasCapability(capabilities, "owner.capital.post")).toBe(false);
  });

  it("denies Accountant financial mutation defaults at the client boundary", () => {
    const capabilities = inspectionCapabilities("accountant");
    for (const capability of [
      "financial.post.fx",
      "financial.post.money",
      "financial.post.debt",
      "financial.post.hawala",
      "financial.post.opening",
      "financial.reverse",
    ] as const) expect(hasCapability(capabilities, capability)).toBe(false);
    expect(hasCapability(capabilities, "debt.settle.receivable")).toBe(false);
    expect(hasCapability(capabilities, "debt.settle.payable")).toBe(false);
    expect(hasCapability(capabilities, "hawala.settle")).toBe(false);
    expect(hasCapability(capabilities, "financial.report")).toBe(true);
    expect(hasCapability(capabilities, "reconciliation.submit")).toBe(true);
  });

  it("maps every exact transaction route to its server capability", () => {
    expect(capabilityForFinancialRoute("/fx/buy")).toBe("financial.post.fx");
    expect(capabilityForFinancialRoute("/money-in/owner-investment")).toBe("owner.capital.post");
    expect(capabilityForFinancialRoute("/hawala/payout")).toBe("hawala.payout");
    expect(capabilityForFinancialRoute("/move/bank-withdrawal")).toBe("financial.post.money");
    expect(financialRoute("inspection", "/money-in/receive")).toBe("/app/inspection/transactions/new/money-in/receive");
    expect(financialRouteSuffix("/app/inspection/hawala/payout")).toBe("/hawala/payout");
  });

  it("keeps a rate-managing branch manager in the focused operational navigation", () => {
    expect(navigationSections(inspectionCapabilities("manager"))).toEqual([
      "Dashboard",
      "Trade",
      "Rates",
      "Cash & Accounts",
      "Transactions",
      "Team & Devices",
    ]);
  });

  it("uses role-focused capability-derived destinations", () => {
    expect(navigationSections(inspectionCapabilities("owner"))).toEqual(["Dashboard", "Trade", "Rates", "Cash & Accounts", "Transactions", "Control"]);
    expect(navigationSections(inspectionCapabilities("business_admin"))).toEqual(["Dashboard", "Trade", "Rates", "People", "Transactions", "Control"]);
    expect(navigationSections(inspectionCapabilities("cashier"))).toEqual(["Dashboard", "Trade", "People", "Transactions", "Cashbox Close"]);
    expect(navigationSections(inspectionCapabilities("accountant"))).toEqual(["Dashboard", "Transactions", "Reports", "Debts", "Reconciliation"]);
    expect(navigationSections(inspectionCapabilities("compliance_officer"))).toEqual(["Dashboard", "Hawala", "Compliance Reviews", "Compliance Cases", "Search"]);
    expect(navigationSections(inspectionCapabilities("viewer"))).toEqual(["Dashboard", "Cash & Accounts", "Transactions", "Reports", "Search"]);
  });
});

describe("calm premium migration contract", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260906190754_calm_premium_capabilities.sql", import.meta.url),
    "utf8",
  );

  it("uses one capability source without PostgreSQL function-source patching", () => {
    expect(migration).toContain("create or replace function public.has_capability");
    expect(migration).toContain("create or replace function public.require_capability");
    expect(migration).toContain("), false)\n  from decision;");
    expect(migration).not.toContain(")), false)\n  from decision;");
    expect(migration).not.toContain("pg_get_functiondef");
    expect(migration).not.toMatch(/replace\s*\(\s*function_definition/i);
  });

  it("guards every financial command at the public RPC boundary", () => {
    for (const command of [
      "record_fx_trade",
      "record_operation",
      "record_opening_balance",
      "record_debt",
      "settle_debt",
      "record_hawala_send",
      "record_hawala_incoming",
      "pay_hawala_beneficiary",
      "settle_hawala_partner",
      "record_cashbox_close",
      "request_reversal",
    ]) {
      expect(migration).toContain(`alter function public.${command}`);
      expect(migration).toContain(`create function public.${command}`);
    }
    expect(migration).toContain("financial_events_require_capability");
    expect(migration).toContain("max_transaction_amount_base");
    expect(migration).toContain("CAPABILITY_REQUIRED:");
  });

  it("keeps independent join requests outside membership until review", () => {
    const requestFunction = migration.slice(
      migration.indexOf("create or replace function public.request_business_access"),
      migration.indexOf("create or replace function public.get_worker_join_requests"),
    );
    expect(requestFunction).toContain("insert into public.worker_join_requests");
    expect(requestFunction).not.toContain("insert into public.organization_memberships");
    expect(migration).toContain("create or replace function public.review_worker_join_request");
    expect(migration).toContain("team_invitation_apply_capabilities");
  });
});

describe("calm premium live fixture contract", () => {
  const fullProvisioner = readFileSync(
    new URL("../scripts/security/provision-step15.mjs", import.meta.url),
    "utf8",
  );
  const businessAdminProvisioner = readFileSync(
    new URL("../scripts/security/provision-premium-business-admin.mjs", import.meta.url),
    "utf8",
  );

  it("includes Business Administrator in every fresh security fixture", () => {
    expect(fullProvisioner).toContain("['BUSINESS_ADMIN_A', 'business_admin']");
    expect(fullProvisioner).toContain("['BUSINESS_ADMIN_A', 'business_admin', businessA.id]");
  });

  it("keeps targeted provisioning disposable, tenant-bound, and server-only", () => {
    expect(businessAdminProvisioner).toContain("const secretKey = process.env.SUPABASE_SECRET_KEY");
    expect(businessAdminProvisioner).toContain("security_fixture !== true");
    expect(businessAdminProvisioner).toContain(".eq('id', env.BUSINESS_A_ID)");
    expect(businessAdminProvisioner).toContain("role_code: 'business_admin'");
    expect(businessAdminProvisioner).not.toContain("SUPABASE_SECRET_KEY=");
  });
});
