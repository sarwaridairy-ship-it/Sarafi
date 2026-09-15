import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { parseHawalaPayoutCommand } from "./domain/commands";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("./App.tsx");
const capabilities = read("./app/capabilities.ts");
const router = read("./app/router.tsx");
const manage = read("./features/manage/ManageSarafi.tsx");
const transactions = read("./features/transactions/TransactionCenter.tsx");
const rateControl = read("./features/rates/TransactionRateControl.tsx");
const rateResolver = read("./features/rates/InlineRateResolver.tsx");
const hawala = read("./features/hawala/HawalaWorkflowParts.tsx");
const appLockServer = read("../supabase/functions/app-lock/index.ts");
const privateDocumentServer = read("../supabase/functions/private-document-url/index.ts");
const migration = read("../supabase/migrations/20260915134012_exact_instruction_v9.sql");
const valuationFix = read("../supabase/migrations/20260915151500_fix_money_valuation_rate_metadata_v9.sql");
const complianceRules = read("../supabase/migrations/20260915153000_compliance_rule_management_v9.sql");
const cashierDocuments = read("../supabase/migrations/20260915154500_hawala_payout_document_capabilities_v9.sql");
const css = read("./styles/calm-premium.css");

describe("SARAFI exact instruction v9", () => {
  it("keeps transactions in normal flow with one compact Automatic rate row", () => {
    expect(app).toContain('className="transaction-route"');
    expect(app).not.toContain('className="transaction-inline-form"');
    expect(app).not.toContain("trade-mode-switch");
    expect(app).toContain("inline-transaction-review");
    expect(rateControl).toContain('automatic: "Automatic"');
    expect(rateControl).toContain("transaction-rate-line");
    expect(rateResolver).toContain('publication_scope: "transaction"');
    expect(rateResolver).toContain("Your complete draft stays on this page");
  });

  it("uses one approved daily rate board for exact available-money valuation", () => {
    const total = new Decimal(2000).plus(new Decimal(2000).mul("1.3")).plus(new Decimal(100).mul(64));
    expect(total.toString()).toBe("11000");
    expect(total.div(64).toString()).toBe("171.875");
    expect(migration).toContain("'valuation_rate_source', 'daily_rate_board'");
    expect(migration).toContain("business_timezone");
    expect(migration).toContain("business_day_end");
    expect(migration).toContain("maximum_rate_age_minutes");
    expect(migration).not.toContain("from public.valuation_rates vr");
    expect(valuationFix).toContain("candidate.board_name, candidate.changed_by, candidate.editor_name");
  });

  it("offers the exact Hawala inbox and a one-or-two image camera-first payout", () => {
    for (const tab of ['"incoming", copy.incoming', '"outgoing", copy.outgoing', '"payout", copy.payout', '"completed", copy.completed'])
      expect(hawala).toContain(tab);
    expect(hawala).toContain("Open camera");
    expect(hawala).toContain("Choose existing photo");
    expect(hawala).toContain("Give Money and Complete Hawala");
    expect(transactions).not.toContain("Settle partner");
    const oneImage = parseHawalaPayoutCommand({
      organization_id: "11111111-1111-4111-8111-111111111111",
      reference_code: "HW-1001",
      money_account_id: "22222222-2222-4222-8222-222222222222",
      identity_confirmed: true,
      recipient_identity_reference: "Tazkira 1234",
      identity_document_ids: ["33333333-3333-4333-8333-333333333333"],
      client_command_id: "v9-payout",
    });
    expect(oneImage.identity_document_ids).toHaveLength(1);
    expect(migration).toContain("hawala_tazkira_images_required");
    expect(migration).toContain("hawala_payout_drafts");
    expect(migration).toContain("begin_hawala_payout_v9");
    expect(migration).toContain("complete_hawala_payout_v9");
    expect(migration).toContain("payout_draft_id");
    expect(migration).toContain("sync_hawala_partner_from_counterparty_v9");
    expect(app).toContain("beginHawalaPayoutDraft");
    expect(app).toContain("completeHawalaPayoutDraft");
  });

  it("splits App Lock authority and requires a fresh grant for private data", () => {
    for (const capability of ["app_lock.self.manage", "app_lock.policy.manage", "app_lock.unlock", "app_lock.sensitive_action"])
      expect(capabilities).toContain(capability);
    expect(appLockServer).toContain('capability: "app_lock.self.manage"');
    expect(appLockServer).toContain('capability: "app_lock.unlock"');
    expect(privateDocumentServer).toContain("app_unlock_grant");
    expect(migration).toContain("app_unlock_grant_is_valid");
    expect(migration).toContain("APP_UNLOCK_REQUIRED");
    expect(migration).toContain("perform public.require_aal2();");
    expect(appLockServer).toContain("policyRequired");
    expect(appLockServer).toContain('device.status !== "trusted"');
    expect(appLockServer).toContain('from "node:buffer"');
    expect(app).toContain("Use Fingerprint / Face ID");
    expect(cashierDocuments).toContain("('cashier', 'documents.upload')");
    expect(complianceRules).toContain("configure_compliance_rule_set_v9");
  });

  it("uses five stable Manage routes without session storage routing", () => {
    for (const path of ["business", "branches", "rates", "security", "team"])
      expect(manage).toContain(`path: "${path}"`);
    expect(manage).toContain("/control/${control.path}");
    expect(router).toContain('path: "app/:organizationId/control/branches"');
    expect(manage).not.toContain("sessionStorage");
  });

  it("switches to drawer navigation below desktop and avoids obsolete CSS selectors", () => {
    expect(css).toContain("@media (max-width:959px)");
    expect(css).toContain(".sidebar.drawer-open");
    for (const obsolete of [".transaction-inline-form", ".trade-mode-switch", ".compact-trade-rate", ".rate-governance"])
      expect(css).not.toContain(obsolete);
  });
});
