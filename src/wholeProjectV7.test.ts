import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFxTradeCommand, parseHawalaPayoutCommand } from "./domain/commands";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20260911195348_whole_project_v7_authority.sql");
const rateResolver = read("./features/rates/InlineRateResolver.tsx");
const app = read("./App.tsx");
const css = read("./styles/calm-premium.css");
const appLockClient = read("./lib/appLock.ts");
const appLockServer = read("../supabase/functions/app-lock/index.ts");
const routes = read("./app/routes.ts");
const router = read("./app/router.tsx");

const payout = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  reference_code: " hw-7k2m-9841 ",
  money_account_id: "22222222-2222-4222-8222-222222222222",
  identity_confirmed: true as const,
  recipient_identity_reference: "Tazkira · 1234",
  identity_document_ids: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
  client_command_id: "v7-payout",
};

describe("whole-project v7 acceptance contracts", () => {
  it("uses a compact one-rate resolver with exact reversible quotes", () => {
    expect(rateResolver).toContain('className={`inline-rate-resolver compact-rate');
    expect(rateResolver).toContain("new Decimal(1).div(rate)");
    expect(rateResolver).toContain('rateSide?: "buy" | "sell" | "valuation"');
    expect(rateResolver).not.toContain("Rate for this transaction");
    expect(rateResolver).not.toContain("این نرخ چگونه حساب شده؟");
    expect(rateResolver).not.toContain("inline-rate-bridge");
  });

  it("keeps one-transaction rates out of the shop-rate publication list", () => {
    const command = parseFxTradeCommand({
      organization_id: payout.organization_id,
      branch_id: payout.money_account_id,
      cashbox_id: payout.identity_document_ids[0],
      client_command_id: "v7-rate-scope",
      side: "BUY_FX",
      sold_currency: "AFN",
      sold_amount: "6400",
      bought_currency: "USD",
      bought_amount: "100",
      base_currency: "AFN",
      sold_base_value: "6400",
      bought_base_value: "6400",
      transaction_rate_resolutions: [{ source_currency: "USD", target_currency: "AFN", buy_rate: "64", sell_rate: "64.1", reason: "Customer-agreed rate", publication_scope: "transaction" }],
    });
    expect(command.transaction_rate_resolutions?.[0].publication_scope).toBe("transaction");
    expect(migration).toContain("sarafi.transaction_rate_context");
    expect(migration).toContain("publication_scope_value = 'transaction'");
    expect(migration).toContain("RATE_CALCULATION_INVALID");
  });

  it("keeps money valuation server authoritative and missing rates out of totals", () => {
    expect(migration).toContain("get_money_valuation_snapshot");
    expect(migration).toContain("money_valuation_snapshots");
    expect(migration).toContain("snapshot_sha256");
    expect(migration).toContain("when p.rate_status = 'current'");
    expect(app).toContain("getMoneyValuationSnapshot");
    expect(app).toContain('net_position_base: "11000"');
    expect(app).toContain('comparison_value: "171.875"');
  });

  it("requires both private Tazkira sides for the only payout path", () => {
    expect(parseHawalaPayoutCommand(payout).reference_code).toBe("HW-7K2M-9841");
    expect(() => parseHawalaPayoutCommand({ ...payout, identity_document_ids: payout.identity_document_ids.slice(0, 1) })).toThrow();
    expect(migration).toContain("hawala_payout_documents_v7");
    expect(migration).toContain("HAWALA_IDENTITY_DOCUMENTS_REQUIRED");
    expect(migration).toContain("entity_type in ('hawala:tazkira_front', 'hawala:tazkira_back')");
  });

  it("routes Hawala only to a verified exact recipient and keeps Paid payout-only", () => {
    for (const field of ["sender_organization_id", "sender_branch_id", "sender_user_id", "recipient_type", "recipient_organization_id", "recipient_partner_id", "recipient_branch_id"]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("record_hawala_send_v7");
    expect(migration).toContain("list_hawala_transfers_v7");
    expect(migration).toContain("HAWALA_ENDPOINT_REQUIRED");
    expect(migration).toContain("Only the exact recipient may acknowledge or ready a transfer");
    expect(migration).toContain("Paid is permitted only through the payout command");
    expect(migration).toContain("h.recipient_organization_id = target_org");
    expect(migration).toContain("h.recipient_branch_id = target_branch");
  });

  it("keeps the app PIN server-side, device-bound, memory-hard, and rate-limited", () => {
    expect(appLockClient).not.toContain("localStorage");
    expect(appLockClient).not.toContain("indexedDB");
    expect(appLockServer).toContain("scryptSync");
    expect(appLockServer).toContain('device_id: body.device_id');
    expect(appLockServer).toContain("retryDelaySeconds");
    expect(appLockServer).toContain('audit("app_lock_unlocked"');
    expect(migration).toContain("g.device_id = target_device");
    expect(migration).toContain("g.purpose = required_purpose");
  });

  it("implements the v7 responsive shell modes and five-item mobile cap", () => {
    expect(css).toContain("@media (min-width:960px) and (max-width:1199px)");
    expect(css).toContain("@media (max-width:959px)");
    expect(css).toContain("@media (max-width:699px)");
    expect(app).toContain("mobileNavigation.length");
    expect(app).toContain("showNavigationDrawer");
  });

  it("makes every v7 money and Hawala path directly refreshable", () => {
    for (const path of [
      "transactions/new/money/receive/customer",
      "transactions/new/money/receive/debt",
      "transactions/new/money/receive/income",
      "transactions/new/money/pay/customer",
      "transactions/new/money/pay/debt",
      "transactions/new/money/pay/expense",
      "transactions/new/money/move/cashbox",
      "transactions/new/money/move/branch",
      "transactions/new/money/move/bank",
      "hawala/incoming/:transferId",
      "hawala/outgoing/:transferId",
      "hawala/payout/:transferId",
    ]) expect(router).toContain(path);
    expect(routes).toContain('"/transactions/new/money/receive/customer"');
    expect(routes).toContain('"/hawala/incoming"');
  });
});
