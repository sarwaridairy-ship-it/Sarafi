import { createClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { exactTotal, invalidPostedJournals, readCompletePages } from "../../src/domain/reconciliation.ts";

const source = process.env.SARAFI_STEP17_ENV ?? ".env.step16.local";
const fileEnv = readFileSync(source, "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .reduce((values, line) => {
    const split = line.indexOf("=");
    values[line.slice(0, split)] = line.slice(split + 1);
    return values;
  }, {});
const env = { ...fileEnv, ...process.env };
const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SARAFI_E2E_CASHIER_A_EMAIL",
  "SARAFI_E2E_CASHIER_A_PASSWORD",
  "BUSINESS_A_ID",
];
for (const key of required)
  if (!env[key]) throw new Error(`Missing Step 17 setting: ${key}`);

const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const observer = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const signedIn = await client.auth.signInWithPassword({
  email: env.SARAFI_E2E_CASHIER_A_EMAIL,
  password: env.SARAFI_E2E_CASHIER_A_PASSWORD,
});
if (signedIn.error)
  throw new Error(`sign in failed: ${signedIn.error.message}`);
const organization = env.BUSINESS_A_ID;
const rows = async (table, columns = "id") => readCompletePages(async (offset, size) => {
  return observer
    .from(table)
    .select(columns, { count: "exact" })
    .eq(table === "organizations" ? "id" : "organization_id", organization)
    .order(table === "fx_inventory_cost_state" ? "currency_code" : "id")
    .range(offset, offset + size - 1);
});
const snapshot = async () => {
  const [
    organizations,
    memberships,
    branches,
    cashboxes,
    events,
    entries,
    lines,
    debts,
    settlements,
    inventory,
    audits,
  ] = await Promise.all([
    rows("organizations"),
    rows("organization_memberships"),
    rows("branches"),
    rows("cashboxes"),
    rows("financial_events", "id,client_command_id"),
    rows("journal_entries", "id,status"),
    rows(
      "journal_lines",
      "id,journal_entry_id,native_debit::text,native_credit::text,base_debit::text,base_credit::text",
    ),
    rows("debts", "id,outstanding_amount::text"),
    rows("settlements", "id,amount::text"),
    rows(
      "fx_inventory_cost_state",
      "currency_code,quantity::text,carrying_base_value::text",
    ),
    rows("security_audit_events", "id,event_type"),
  ]);
  return {
    organization_id: organization,
    counts: {
      organizations: organizations.length,
      memberships: memberships.length,
      branches: branches.length,
      cashboxes: cashboxes.length,
      financial_events: events.length,
      journal_entries: entries.length,
      journal_lines: lines.length,
      debts: debts.length,
      settlements: settlements.length,
      inventory_positions: inventory.length,
      security_audit_events: audits.length,
    },
    totals: {
      journal_base_debit: exactTotal(lines, "base_debit"),
      journal_base_credit: exactTotal(lines, "base_credit"),
      journal_native_debit: exactTotal(lines, "native_debit"),
      journal_native_credit: exactTotal(lines, "native_credit"),
      outstanding_debt: exactTotal(debts, "outstanding_amount"),
      settlement_amount: exactTotal(settlements, "amount"),
    },
    inventory: inventory.sort((left, right) =>
      left.currency_code.localeCompare(right.currency_code),
    ),
    posted_entries: entries.filter((entry) => entry.status === "posted").length,
    invalid_posted_journals: invalidPostedJournals(entries, lines),
  };
};
const actual = await snapshot();
const expectedPath = env.SARAFI_STEP17_EXPECTED;
const expected = expectedPath
  ? JSON.parse(readFileSync(expectedPath, "utf8"))
  : null;
const expectedSnapshot = expected?.actual ?? expected;
const comparable = (value) =>
  JSON.stringify({
    counts: value.counts,
    totals: value.totals,
    inventory: value.inventory,
    posted_entries: value.posted_entries,
  });
// Double-entry balance is authoritative in the organization's base currency.
// Native amounts belong to different currencies (for example AFN and USD) and
// must never be added together or compared as if they shared one unit.
const balanced = actual.invalid_posted_journals.length === 0 && new Decimal(String(actual.totals.journal_base_debit)).eq(
  String(actual.totals.journal_base_credit),
);
const report = {
  project: new URL(env.SUPABASE_URL).hostname,
  generated_at: new Date().toISOString(),
  mode: expected ? "reconcile" : "snapshot",
  numeric_encoding: "decimal_strings_v2",
  requires_quiescent_target: true,
  restore_performed_by_this_script: false,
  balanced,
  balance_basis: "base_currency",
  native_totals: "informational_only_cross_currency",
  expected_match: expectedSnapshot
    ? comparable(actual) === comparable(expectedSnapshot)
    : null,
  actual,
  expected: expectedSnapshot ?? undefined,
};
mkdirSync("test-results/step17", { recursive: true });
writeFileSync(
  "test-results/step17/reconciliation-report.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (!balanced || (expected && !report.expected_match)) process.exitCode = 1;
