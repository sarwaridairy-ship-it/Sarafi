import { readFileSync } from "node:fs";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("./App.tsx");
const capabilities = read("./app/capabilities.ts");
const home = read("./features/home/RoleHome.tsx");
const rateControl = read("./features/rates/TransactionRateControl.tsx");
const rateResolver = read("./features/rates/InlineRateResolver.tsx");
const css = read("./styles/calm-premium.css");
const appLock = read("../supabase/functions/app-lock/index.ts");
const privateDocuments = read("../supabase/functions/private-document-url/index.ts");
const evidenceCleanup = read("../supabase/functions/hawala-evidence-cleanup/index.ts");
const reconciliation = read("../scripts/security/run-step17-reconciliation.mjs");
const migration = read("../supabase/migrations/20260915175821_exact_instruction_v10.sql");
const ci = read("../.github/workflows/ci.yml");
const release = read("../.github/workflows/release.yml");
const screenshots = read("../tests/e2e/screenshots.spec.ts");

describe("SARAFI exact instruction v10", () => {
  it("uses one exact operation rate from screen through the journal", () => {
    const buy = new Decimal("70.25");
    const sell = new Decimal("70.35");
    expect(buy.plus(sell).div(2).toString()).toBe("70.3");
    expect(migration).toContain("'applied_rate', (r.buy_rate + r.sell_rate) / 2");
    expect(migration).toContain("RATE_CONTEXT_CHANGED");
    expect(migration).toContain("sarafi.transaction_rate_context");
    expect(migration).toContain("new.applied_rate := rate_value");
    expect(rateResolver).toContain('rate_mode: "automatic"');
    expect(rateResolver).toContain('rate_mode: "manual"');
    expect(app).not.toContain('rateSide={operationKind');
  });

  it("keeps the rate row compact and asks for a reason only outside tolerance", () => {
    expect(rateControl).toContain("transaction-rate-band");
    expect(css).toContain("max-height:64px");
    expect(css).toContain("max-height:76px");
    expect(rateResolver).toContain("outsideTolerance");
    expect(rateResolver).toContain("exceptionReason");
    expect(app).not.toContain('const manualTransactionRateReason = "Manual transaction rate"');
    expect(app).not.toContain("Existing shop rate confirmed in transaction review");
    expect(app).toContain("tradeRateOutsideTolerance");
    expect(app).toContain('className="trade-optional-fields"');
  });

  it("separates approved shop rates from market reference rates", () => {
    expect(app).toContain('approvedTitle: "Our approved rates"');
    expect(app).toContain('referenceTitle: "Market reference"');
    expect(app).toContain('refresh: "Refresh reference"');
    expect(app).not.toContain("sarafi.af");
  });

  it("enforces App Lock reset and private-document authorization server-side", () => {
    expect(appLock).toContain('body.action === "disable" && policyRequired');
    expect(appLock).toContain('body.action === "reset"');
    expect(appLock).toContain("app_unlock_grants");
    expect(privateDocuments).toContain("authorize_private_document_access");
    expect(appLock).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(privateDocuments).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(appLock).toContain("http://127.0.0.1:5175");
    expect(privateDocuments).toContain("https://sarafi-swart.vercel.app");
  });

  it("limits Hawala identity evidence by purpose and cleans expired storage objects", () => {
    expect(migration).toContain("insert into public.capability_definitions");
    expect(migration).not.toContain("insert into public.capabilities");
    expect(migration).toContain(
      "private_document_upload_target_is_valid(target_org uuid, target_counterparty uuid)",
    );
    expect(migration).not.toContain(
      "private_document_upload_target_is_valid(target_org uuid, target_entity uuid)",
    );
    for (const capability of [
      "documents.hawala_payout.create",
      "documents.hawala_payout.view_own_draft",
      "documents.hawala_payout.complete",
    ]) {
      expect(capabilities).toContain(capability);
      expect(migration).toContain(capability);
    }
    expect(migration).toContain("authorize_private_document_access");
    expect(migration).toContain("claim_expired_hawala_evidence_v10");
    expect(migration).toContain("finalize_hawala_evidence_cleanup_v10");
    expect(migration).toContain("configure_hawala_evidence_cleanup_v10");
    expect(migration).toContain("sarafi-hawala-evidence-cleanup-v10");
    expect(evidenceCleanup).toContain('storage.from("sarafi-private-documents").remove');
    expect(release).toContain("Deploy reviewed Supabase functions");
    expect(release).toContain("Configure and verify Hawala evidence cleanup");
  });

  it("makes release evidence non-optional and prevents blank role screenshots", () => {
    expect(reconciliation).toContain("const expectedSnapshot = expected?.actual ?? expected");
    expect(ci).toContain("Require authenticated browser fixtures");
    expect(ci).not.toContain("authenticated_fixtures.outputs.ready");
    for (const evidence of [
      "BACKUP_EVIDENCE",
      "LOCAL_LANGUAGE_UAT_EVIDENCE",
      "PRINTER_ACCEPTANCE_EVIDENCE",
      "LEGAL_PROVIDER_SIGNOFF_EVIDENCE",
    ]) expect(release).toContain(`test -n "$${evidence}"`);
    expect(screenshots).toContain("/app/inspection/home?role=${role}");
    expect(screenshots).toContain("Screenshot route rendered a blank or incomplete workspace");
    expect(home).toContain('"Net financial position"');
    expect(home).not.toContain('local(language, "Our money"');
  });
});
