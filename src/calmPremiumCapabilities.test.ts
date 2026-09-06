import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasCapability, inspectionCapabilities } from "./app/capabilities";
import { capabilityForFinancialRoute, financialRoute, financialRouteSuffix } from "./app/routes";

describe("calm premium capability contract", () => {
  it("keeps Business Administrator operational while owner powers remain unavailable", () => {
    const capabilities = inspectionCapabilities("business_admin");
    expect(hasCapability(capabilities, "financial.post.fx")).toBe(true);
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
    expect(hasCapability(capabilities, "financial.report")).toBe(true);
    expect(hasCapability(capabilities, "reconciliation.submit")).toBe(true);
  });

  it("maps every exact transaction route to its server capability", () => {
    expect(capabilityForFinancialRoute("/fx/buy")).toBe("financial.post.fx");
    expect(capabilityForFinancialRoute("/money-in/debt-payment")).toBe("financial.post.debt");
    expect(capabilityForFinancialRoute("/money-in/owner-capital")).toBe("owner.capital.post");
    expect(capabilityForFinancialRoute("/hawala/payout")).toBe("financial.post.hawala");
    expect(capabilityForFinancialRoute("/move/branch")).toBe("financial.post.money");
    expect(financialRoute("inspection", "/debts/settle")).toBe("/app/inspection/debts/settle");
    expect(financialRouteSuffix("/app/inspection/debts/settle")).toBe("/debts/settle");
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
