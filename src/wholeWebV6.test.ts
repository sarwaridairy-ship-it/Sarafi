import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const app = read("./App.tsx");
const appCss = read("./App.css");
const professionalCss = read("./professional.css");
const router = read("./app/router.tsx");
const appErrorBoundary = read("./app/AppErrorBoundary.tsx");
const transactionCenter = read("./features/transactions/TransactionCenter.tsx");
const referenceScanner = read("./features/hawala/ReferenceScanner.tsx");
const auth = read("./lib/auth.ts");
const financialApi = read("./lib/financialApi.ts");
const main = read("./main.tsx");
const telemetry = read("./lib/telemetry.ts");
const serviceWorker = read("../public/sw.js");
const migration = read("../supabase/migrations/20260908104812_whole_web_v6_reporting_compliance_evidence.sql");
const hawalaMigration = read("../supabase/migrations/20260908110100_hawala_evidence_v6.sql");
const hawalaEventTypes = read("../supabase/migrations/20260908110000_hawala_event_types_v6.sql");
const hawalaRepairMigration = read("../supabase/migrations/20260908221542_repair_hawala_v6_function_lint.sql");
const ci = read("../.github/workflows/ci.yml");
const release = read("../.github/workflows/release.yml");

describe("whole-web v6 acceptance contracts", () => {
  it("uses one real route tree and mounts task content through the main outlet", () => {
    expect(router).toContain("createBrowserRouter");
    expect(router).toContain("WorkspaceLayout");
    expect(router).toContain("loadWorkspaceRoute");
    expect(router).toContain("errorElement");
    expect(router).toContain('lazy(() => import("../App"))');
    expect(app).toContain("<Outlet");
    expect(app.indexOf("<Outlet")).toBeLessThan(app.indexOf('className="transaction-inline-form"'));
    expect(app.indexOf("</main>", app.indexOf("<Outlet"))).toBeGreaterThan(app.lastIndexOf('className="transaction-inline-form"'));
    expect(app).not.toContain("sectionFromPath");
    expect(app).toContain("useParams");
    expect(app).not.toContain('pathname.match(/\\/debts\\/');
    expect(app).not.toContain('pathname.match(/\\/hawala\\/');
    expect(appCss).not.toContain("trade-modal");
    expect(professionalCss).not.toContain("trade-modal");
  });

  it("starts transaction entry with exactly six families and canonical subtype links", () => {
    expect((transactionCenter.match(/id: "(fx|money-in|money-out|move|debt|hawala)"/g) ?? [])).toHaveLength(6);
    expect(transactionCenter).not.toContain("quickActions");
    for (const route of [
      "/money-in/receive",
      "/money-in/owner-investment",
      "/money-out/pay",
      "/move/bank-deposit",
      "/move/bank-withdrawal",
      "/hawala/payout",
    ]) expect(transactionCenter).toContain(route);
  });

  it("freezes one report snapshot and logs only successful derived exports", () => {
    expect(migration).toContain("create table public.report_snapshots");
    expect(migration).toContain("report_snapshots_immutable");
    expect(migration).toContain("snapshot_sha256");
    expect(migration).toContain("REPORT_SNAPSHOT_REQUIRED");
    expect(migration).toContain("get_scoped_report_ledger_lines_v6");
    expect(migration).toContain("get_scoped_named_financial_report_v6");
    expect(migration).toContain("REPORT_SCOPE_INVALID:cashbox");
    expect(migration).toContain("public.has_capability(org_id, 'financial.report', snapshot_row.filters)");
    expect(app).toContain("createFinancialReportSnapshot");
    expect(app).toContain("Generate filtered report");
    expect(app).toContain("invalidateReport");
    expect(app).toContain('await recordSuccessfulExport("pdf")');
    expect(app.indexOf("await createPdf")).toBeLessThan(app.indexOf('await recordSuccessfulExport("pdf")'));
  });

  it("stores versioned pre-post compliance evidence with sensitive events", () => {
    expect(migration).toContain("function public.get_my_capabilities");
    for (const field of ["branch_ids", "cashbox_ids", "transaction_types", "amount_limits", "rate_override_limits", "hawala_permissions", "document_permissions", "approval_permissions", "security_permissions", "expires_at"]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(financialApi).toContain("client.rpc('get_my_capabilities'");
    expect(financialApi).toContain("capabilities: []");
    expect(migration).toContain("create table public.compliance_decisions");
    expect(migration).toContain("financial_events_pre_post_compliance");
    expect(migration).toContain("decision_engine_version");
    expect(migration).toContain("compliance_rule_version");
    expect(migration).toContain("COMPLIANCE_REVIEW_REQUIRED");
    expect(migration).toContain("new.counterparty_id");
    expect(migration).toContain("screening_provider_required");
    expect(migration).toContain("large_transaction_review_required");
    expect(migration).toContain("rules.aggregation_window_hours");
    expect(migration).toContain("required_documents_missing");
    expect(migration).toContain("required_documents_complete");
    expect(migration).toContain("sarafi-compliance-v2");
    expect(migration).toContain("ca.status = 'cleared'");
    expect(migration).toContain("ca.reviewed_by <> new.created_by");
    expect(migration).toContain("ca.evidence->>'client_command_id' = new.client_command_id");
    expect(migration).toContain("ca.evidence->>'event_type' = new.event_type::text");
    expect(migration).toContain("(ca.evidence->>'amount_base')::numeric = amount_value");
    expect(migration).not.toContain("ca.status in ('cleared', 'reported')");
  });

  it("retains browser evidence and requires seven-role fixtures for release", () => {
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(release).toContain("SARAFI_E2E_ROLE_FIXTURES");
    expect(release).toContain("authenticated-roles.spec.ts");
    expect(release).toContain("sarafi-production-attestation");
    expect(release).toContain("git verify-tag");
    expect(release).toContain("local_language_uat_evidence");
    expect(release).toContain("printer_acceptance_evidence");
    expect(release).toContain("legal_provider_signoff_evidence");
  });

  it("keeps live device state without re-registering the browser on every organization event", () => {
    for (const table of ["financial_events", "devices", "organization_memberships", "approval_requests", "worker_join_requests", "hawala_transfers", "compliance_alerts", "compliance_cases", "security_audit_events"]) {
      expect(auth).toContain(`'${table}'`);
    }
    expect(auth).toContain("onChange(table, payload as OrganizationActivityPayload)");
    expect(app).toContain('if (table === "devices")');
    expect(app).not.toMatch(/registerBrowserDevice[\s\S]{0,1400}workspaceActivityRefresh\]\);/);
    expect(app).toContain("capabilityContractTtlSeconds");
  });

  it("records redacted RPC failure telemetry with release, route, code, and correlation evidence", () => {
    expect(telemetry).toContain("record_client_telemetry");
    expect(telemetry).toContain("release_version");
    expect(telemetry).toContain("rpc_error_code");
    expect(telemetry).toContain("correlation_id");
    expect(telemetry).not.toContain("identity_number");
    expect(migration).toContain("create table public.client_telemetry_events");
    expect(migration).toContain("count(*) >= 100");
    expect(router).toContain('eventName: "route_error"');
    expect(appErrorBoundary).toContain('eventName: "render_error"');
  });

  it("presents all three post-identity workspace choices", () => {
    expect(app).toContain("I own or manage a Sarafi");
    expect(app).toContain("I work for a Sarafi");
    expect(app).toContain("Sign in to an existing workplace");
  });

  it("honors each localized install manifest on a fresh launch", () => {
    expect(main).toContain("new URLSearchParams(window.location.search).get('lang')");
    expect(app).toContain('new URLSearchParams(window.location.search).get("lang")');
  });

  it("offers installed-app updates without interrupting an active transaction", () => {
    expect(main).toContain("sarafi:update-available");
    expect(app).toContain("Finish your current task, then update safely.");
    expect(serviceWorker).toContain("SKIP_WAITING");
  });

  it("has no browser fallback to raw accounting or customer tables", () => {
    for (const table of ["financial_events", "journal_entries", "journal_lines", "ledger_accounts", "receipts", "counterparties", "debts", "settlements", "hawala_transfers"]) {
      expect(financialApi).not.toContain(`.from('${table}')`);
    }
    expect(financialApi).toContain("client.rpc('list_counterparties_v6'");
    expect(financialApi).toContain("client.rpc('get_counterparty_statement_v6'");
    expect(financialApi).toContain("client.rpc('list_hawala_transfers_v6'");
    expect(migration).toContain("revoke select on table");
  });

  it("qualifies outer RLS rows and loads transaction rowtypes independently", () => {
    expect(migration).toContain("fe.id = journal_entries.financial_event_id");
    expect(migration).toContain("je.id = journal_lines.journal_entry_id");
    expect(migration).toContain("cb.id = ledger_accounts.cashbox_id");
    expect(migration).toContain("je.id = receipts.journal_entry_id");
    expect(migration).toContain("select je.* into entry_row");
    expect(migration).toContain("select fe.* into event_row");
    expect(migration).not.toContain("select je, fe into entry_row, event_row");
  });

  it("issues outgoing Hawala references on the server and records purpose-specific events", () => {
    expect(financialApi).toContain("client.rpc('record_hawala_send_v6'");
    expect(hawalaMigration).toContain("reference_source', 'server'");
    for (const eventType of ["hawala_outgoing_funded", "hawala_incoming_recorded", "hawala_beneficiary_paid", "hawala_partner_paid", "hawala_partner_collected"]) {
      expect(hawalaEventTypes).toContain(eventType);
      expect(hawalaMigration).toContain(eventType);
    }
    expect(hawalaMigration).toContain("HAWALA_IMMUTABLE_EVIDENCE");
    expect(hawalaMigration).toContain("remaining_amount");
    expect(hawalaMigration).toContain("extensions.gen_random_bytes(10)");
    expect(hawalaRepairMigration).toContain("extensions.gen_random_bytes(10)");
    expect(hawalaRepairMigration).toContain("::public.financial_event_type");
    expect(hawalaMigration).not.toContain("case when new.direction = 'outgoing' then new.sender_id");
    expect(referenceScanner).toContain("BarcodeDetector");
    expect(referenceScanner).toContain("getUserMedia");
    expect(referenceScanner).toContain("no image is uploaded");
    expect(app).toContain("<ReferenceScanner");
  });

  it("ties every export format to visible frozen-snapshot evidence", () => {
    expect(app).toContain("reportFilterSummary");
    expect(app).toContain("snapshotHash: reportSnapshot?.snapshot_sha256");
    expect(app).toContain("cashboxName: reportCashboxName");
    expect(app).toContain("preparedBy");
  });
});
