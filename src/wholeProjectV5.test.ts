import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseHawalaIncomingCommand,
  parseHawalaPayoutCommand,
  parseHawalaSendCommand,
  parseHawalaSettlementCommand,
  parseDebtCreateCommand,
  parseDebtSettlementCommand,
  parseFxTradeCommand,
} from "./domain/commands";
import { hasCapability, inspectionCapabilities } from "./app/capabilities";

const migration = readFileSync(
  new URL("../supabase/migrations/20260907121336_whole_project_integrity_v5.sql", import.meta.url),
  "utf8",
);
const api = readFileSync(new URL("./lib/financialApi.ts", import.meta.url), "utf8");
const documentSigningFunction = readFileSync(
  new URL("../supabase/functions/private-document-url/index.ts", import.meta.url),
  "utf8",
);
const rateResolver = readFileSync(new URL("./features/rates/InlineRateResolver.tsx", import.meta.url), "utf8");

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  branch: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  account: "44444444-4444-4444-8444-444444444444",
  line: "55555555-5555-4555-8555-555555555555",
};

describe("whole-project v5 command validation", () => {
  it("requires a canonical partner for both Hawala creation directions", () => {
    const base = {
      organization_id: ids.organization,
      branch_id: ids.branch,
      hawala_partner_id: ids.partner,
      sender_name: "Karim Ahmadi",
      beneficiary_name: "Ahmad Rahimi",
      destination_location: "Kabul",
      currency: "afn",
      amount: "25000",
      fee: "250",
      reference_code: " incoming-1001 ",
      client_command_id: "cmd-1",
    };
    expect(parseHawalaSendCommand({ ...base, destination_money_account_id: ids.account }).reference_code).toBe("INCOMING-1001");
    expect(parseHawalaIncomingCommand({ ...base, origin_location: "Herat" }).currency).toBe("AFN");
    expect(() => parseHawalaSendCommand({ ...base, hawala_partner_id: undefined, destination_money_account_id: ids.account })).toThrow();
  });

  it("requires exact-code payout identity evidence and statement-bound settlements", () => {
    expect(parseHawalaPayoutCommand({
      organization_id: ids.organization,
      reference_code: "incoming-1001",
      money_account_id: ids.account,
      identity_confirmed: true,
      recipient_identity_reference: "Tazkira · 1234",
      client_command_id: "cmd-2",
    }).reference_code).toBe("INCOMING-1001");
    expect(() => parseHawalaPayoutCommand({
      organization_id: ids.organization,
      reference_code: "incoming-1001",
      money_account_id: ids.account,
      identity_confirmed: false,
      recipient_identity_reference: "Tazkira · 1234",
      client_command_id: "cmd-2",
    })).toThrow();
    expect(parseHawalaSettlementCommand({
      statement_line_id: ids.line,
      hawala_partner_id: ids.partner,
      money_account_id: ids.account,
      amount: "1000",
      client_command_id: "cmd-3",
    }).statement_line_id).toBe(ids.line);
  });

  it("accepts one typed inline-rate publication contract across non-FX commands", () => {
    const publishRate = {
      branch_id: ids.branch,
      source_currency: "usd",
      target_currency: "afn",
      buy_rate: "70.25",
      sell_rate: "70.35",
    };
    expect(parseHawalaSendCommand({
      organization_id: ids.organization,
      branch_id: ids.branch,
      hawala_partner_id: ids.partner,
      sender_name: "Karim Ahmadi",
      beneficiary_name: "Ahmad Rahimi",
      destination_location: "Kabul",
      destination_money_account_id: ids.account,
      currency: "USD",
      amount: "100",
      reference_code: "RATE-1001",
      client_command_id: "cmd-rate-hawala",
      publish_rate: publishRate,
    }).publish_rate?.source_currency).toBe("USD");
    expect(parseDebtCreateCommand({
      organization_id: ids.organization,
      branch_id: ids.branch,
      counterparty_id: ids.partner,
      direction: "receivable",
      currency: "USD",
      amount: "100",
      client_command_id: "cmd-rate-debt",
      publish_rate: publishRate,
    }).publish_rate?.target_currency).toBe("AFN");
    expect(parseDebtSettlementCommand({
      debt_id: ids.line,
      amount: "10",
      client_command_id: "cmd-rate-settlement",
      publish_rate: publishRate,
    }).publish_rate?.buy_rate).toBe("70.25");
  });

  it("accepts exactly two atomic rate publications for cross-currency Exchange", () => {
    const command = {
      organization_id: ids.organization,
      branch_id: ids.branch,
      cashbox_id: ids.account,
      client_command_id: "cmd-rate-exchange",
      side: "EXCHANGE_FX",
      sold_currency: "USD",
      sold_amount: "100",
      bought_currency: "EUR",
      bought_amount: "93.675",
      base_currency: "AFN",
      sold_base_value: "7035",
      bought_base_value: "7035",
      publish_rates: [
        { branch_id: ids.branch, source_currency: "USD", target_currency: "AFN", buy_rate: "70.25", sell_rate: "70.35" },
        { branch_id: ids.branch, source_currency: "EUR", target_currency: "AFN", buy_rate: "75.10", sell_rate: "75.20" },
      ],
    };
    expect(parseFxTradeCommand(command).publish_rates).toHaveLength(2);
    expect(() => parseFxTradeCommand({ ...command, publish_rates: [...command.publish_rates, command.publish_rates[0]] })).toThrow();
  });
});

describe("whole-project v5 authorization contract", () => {
  it("uses granular role defaults for contradictory cashier/accountant operations", () => {
    const cashier = inspectionCapabilities("cashier");
    const accountant = inspectionCapabilities("accountant");
    const manager = inspectionCapabilities("manager");
    expect(hasCapability(cashier, "debt.settle.receivable")).toBe(true);
    expect(hasCapability(cashier, "debt.settle.payable")).toBe(false);
    expect(hasCapability(cashier, "hawala.payout")).toBe(true);
    expect(hasCapability(cashier, "hawala.settle")).toBe(false);
    expect(hasCapability(accountant, "hawala.settle")).toBe(false);
    expect(hasCapability(accountant, "hawala.payout")).toBe(false);
    expect(hasCapability(accountant, "debt.settle.receivable")).toBe(false);
    expect(hasCapability(accountant, "debt.settle.payable")).toBe(false);
    expect(hasCapability(manager, "rates.manage")).toBe(true);
    expect(hasCapability(manager, "documents.view")).toBe(false);
    const rateImplementation = migration.slice(
      migration.indexOf("create or replace function public.set_exchange_rate_capability_impl"),
      migration.indexOf("create or replace function public.fx_authoritative_scope_amount"),
    );
    expect(rateImplementation).toContain("'authorization', 'rates.manage'");
    expect(rateImplementation).not.toContain("Only the owner");
    const debtImplementation = migration.slice(
      migration.indexOf("create or replace function public.record_debt_capability_impl"),
      migration.indexOf("create or replace function public.record_debt(command jsonb)"),
    );
    expect(debtImplementation).not.toContain("role_code");
    expect(debtImplementation).not.toContain("Cashier cannot");
    const settlementImplementation = migration.slice(
      migration.indexOf("create or replace function public.settle_debt_capability_impl"),
      migration.indexOf("revoke all on function public.record_debt_capability_impl"),
    );
    expect(settlementImplementation).not.toContain("role_code");
    expect(settlementImplementation).not.toContain("Cashier cannot");
    const reversalImplementation = migration.slice(
      migration.indexOf("create or replace function public.request_reversal_capability_impl"),
      migration.indexOf("revoke all on function public.record_debt_capability_impl"),
    );
    expect(reversalImplementation).not.toContain("role_code");
    expect(reversalImplementation).toContain("existing_entry.reversal_of = original_id");
  });

  it("denies suspended users and retires the contradictory role trigger", () => {
    const capabilityFunction = migration.slice(
      migration.indexOf("create or replace function public.has_capability"),
      migration.indexOf("revoke all on function public.has_capability"),
    );
    expect(capabilityFunction).toContain("public.is_platform_user_active()");
    expect(capabilityFunction).toContain("requires_active_plan");
    expect(capabilityFunction).toContain("requires_trusted_device");
    expect(capabilityFunction).toContain("requires_mfa");
    expect(capabilityFunction).toContain("), false)\n  from decision;");
    expect(capabilityFunction).not.toContain(")), false)\n  from decision;");
    expect(migration).toContain("drop trigger if exists enforce_premium_financial_actor_before_insert");
  });
});

describe("whole-project v5 accounting and privacy contract", () => {
  it("makes paid reachable only through the evidence-producing payout command", () => {
    const transition = migration.slice(
      migration.lastIndexOf("create or replace function public.transition_hawala_status"),
      migration.indexOf("create or replace function public.get_hawala_partner_statement"),
    );
    expect(transition).toContain("Paid is permitted only through the payout command");
    expect(transition).not.toContain("next_status in ('funded', 'sent', 'ready', 'paid'");
    const payout = migration.slice(
      migration.lastIndexOf("create or replace function public.pay_hawala_beneficiary"),
      migration.lastIndexOf("create or replace function public.transition_hawala_status"),
    );
    expect(payout).toContain("recipient_identity_reference");
    expect(payout).toContain("payout_journal_entry_id = entry_id");
    expect(payout).toContain("payout_receipt_id = receipt_id_value");
    expect(payout).toContain("upper(trim(h.reference_code)) = normalized_reference");
  });

  it("binds settlement to canonical statement identity and supports both directions", () => {
    expect(migration).toContain("HAWALA_PARTNER_MISMATCH");
    expect(migration).toContain("direction text not null check (direction in ('payable', 'receivable'))");
    expect(migration).toContain("(case when line_row.direction = 'payable' then 'pay_money' else 'receive_money' end)::public.financial_event_type");
    expect(migration).toContain("net_receivable");
  });

  it("audits document authorization before URL signing and removes broad member storage reads", () => {
    expect(migration).toContain("drop policy if exists attachments_member_read");
    expect(migration).toContain("drop policy if exists private_documents_read");
    expect(migration).toContain("drop policy if exists private_documents_capability_read");
    expect(migration).not.toContain("create policy private_documents_capability_read");
    expect(migration).toContain("create or replace function public.authorize_private_document_access");
    expect(api).toContain("client.functions.invoke('private-document-url'");
    expect(api).not.toContain(".createSignedUrl(");
    expect(documentSigningFunction.indexOf("authorize_private_document_access")).toBeLessThan(documentSigningFunction.indexOf("createSignedUrl"));
  });

  it("validates both exchange legs and publishes rates atomically with posting", () => {
    expect(migration).toContain("side_value not in ('buy_fx', 'sell_fx', 'exchange_fx')");
    expect(migration).toContain("rate_validated_legs");
    expect(migration).toContain("create or replace function public.record_fx_trade_v5");
    expect(migration).toContain("create or replace function public.fx_authoritative_scope_amount");
    expect(migration).toContain("jsonb_array_elements(publish_list)");
    expect(migration).toContain("rate_context_id");
    const atomic = migration.slice(
      migration.indexOf("create or replace function public.record_fx_trade_v5"),
      migration.indexOf("create or replace function public.request_fx_trade_approval_v5"),
    );
    expect(atomic.indexOf("public.set_exchange_rate")).toBeLessThan(atomic.indexOf("result := public.record_fx_trade("));
    expect(api).toContain("client.rpc('record_fx_trade_v5'");
    expect(api).toContain("client.rpc('resume_approved_fx_trade'");
    expect(api).toContain("client.rpc('get_my_resumable_approval_draft'");
    expect(migration).toContain("requester_resume_required");
  });

  it("quarantines ambiguous Hawala references and consumes approved payout drafts once", () => {
    expect(migration).toContain("DUPLICATE_READY_REFERENCE");
    expect(migration).toContain("HAWALA_REFERENCE_AMBIGUOUS");
    expect(migration).toContain("hawala_ready_incoming_reference_unique");
    expect(migration).toContain("create or replace function public.resume_approved_hawala_payout");
    expect(migration).toContain("set consumed_at = now(), consumed_by = actor_id");
    expect(api).toContain("client.rpc('resume_approved_hawala_payout'");
  });

  it("exposes owner-managed FX age and tolerance controls", () => {
    expect(migration).toContain("rate_max_age_minutes");
    expect(migration).toContain("rate_tolerance_bps");
    expect(api).toContain("rate_max_age_minutes,rate_tolerance_bps");
  });

  it("serves a minimized role dashboard instead of calling the owner RPC from the client", () => {
    expect(migration).toContain("create or replace function public.get_role_dashboard");
    expect(migration).toContain("create or replace function public.get_scoped_financial_dashboard");
    expect(migration).toContain("own_activity_only");
    expect(migration).toContain("cashier_profit_hidden_value");
    expect(migration).toContain("role_value in ('business_admin', 'manager', 'viewer')");
    expect(migration).toContain("revoke all on function public.get_owner_dashboard(uuid, date) from public, anon, authenticated");
    expect(api).toContain("client.rpc('get_role_dashboard'");
  });

  it("resolves every non-FX rate in place and loads deep links by exact id", () => {
    expect(migration).toContain("create or replace function public.prepare_inline_rate");
    expect(migration).toContain("command := public.prepare_inline_rate(command, 'money_operation')");
    expect(migration).toContain("command := public.prepare_inline_rate(command, 'opening_balance')");
    expect(migration).toContain("'debt_create'");
    expect(migration).toContain("'debt_settle'");
    expect(migration).toContain("'hawala_send'");
    expect(migration).toContain("'hawala_incoming'");
    expect(migration).toContain("'hawala_settle'");
    expect(rateResolver).toContain("getTransactionRateContext");
    expect(rateResolver).toContain("Your draft stays on this page");
    expect(migration).toContain("create or replace function public.get_transaction_detail");
    expect(migration).toContain("create or replace function public.get_debt_detail_v5");
    expect(migration).toContain("create or replace function public.get_counterparty_detail_v5");
    expect(api).toContain("client.rpc('get_transaction_detail'");
    expect(api).toContain("client.rpc('get_debt_detail_v5'");
    expect(api).toContain("client.rpc('get_counterparty_detail_v6'");
  });
});
