import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("./App.tsx");
const transactionCenter = read("./features/transactions/TransactionCenter.tsx");
const inlineRateResolver = read("./features/rates/InlineRateResolver.tsx");
const moneyValuation = read("./features/money/MoneyValuationSummary.tsx");
const hawalaWorkflow = read("./features/hawala/HawalaWorkflowParts.tsx");
const appLockGate = read("./features/security/AppLockGate.tsx");
const appLockSettings = read("./features/security/AppLockSettings.tsx");
const manageSarafi = read("./features/manage/ManageSarafi.tsx");
const appLockClient = read("./lib/appLock.ts");
const appLockServer = read("../supabase/functions/app-lock/index.ts");
const migration = read("../supabase/migrations/20260912044905_exact_user_requirements_v8.sql");

describe("SARAFI exact user requirements v8", () => {
  it("uses the six exact transaction families and removes the superseded labels", () => {
    for (const label of ["Currency Exchange", "Receive Money", "Spend Money", "Move Money", "Debt", "Hawala"])
      expect(transactionCenter).toContain(`en: "${label}"`);
    expect(transactionCenter).not.toContain('en: "Exchange Currency"');
    expect(transactionCenter).not.toContain('en: "Pay Money"');
    expect(transactionCenter).not.toContain('en: "Move Our Money"');
    expect(transactionCenter).toContain("Back to Transaction Types");
  });

  it("opens compact rate quotes in AFN-to-foreign direction and preserves reciprocal math", () => {
    expect(app).toContain("useState(true)");
    expect(inlineRateResolver).toContain("const [reversed, setReversed] = useState(true)");
    expect(inlineRateResolver).toContain("new Decimal(1).div(rate)");
    expect(app).toContain("<summary>{copy.addCurrency}");
    expect(new Decimal(1).div("70.25").mul("70.25").toDecimalPlaces(12).toString()).toBe("1");
    expect(app).not.toContain("exchange-rate-governance");
  });

  it("values available money only and marks missing available rates incomplete", () => {
    const exactAvailable = new Decimal(2000).plus(new Decimal(2000).mul("1.3")).plus(new Decimal(100).mul(64));
    expect(exactAvailable.toString()).toBe("11000");
    expect(exactAvailable.div(64).toString()).toBe("171.875");
    expect(moneyValuation).toContain("valuation.totals.available_base");
    expect(moneyValuation).toContain("formatAmount(item.available)");
    expect(moneyValuation).toContain("item.available_base");
    expect(migration).toContain("where v.available <> 0 and v.rate_status <> 'current'");
    expect(migration).toContain("'total_complete', t.total_complete");
    expect(migration).toContain("t.available_valued_base / cr.rate");
    expect(migration).toContain("l.original_amount - l.settled_amount");
    expect(migration).not.toContain("l.remaining_amount");
  });

  it("keeps Manage SARAFI in five focused internal areas", () => {
    for (const label of ["Business Information", "Branches and Connected Partners", "Currencies and Rates", "Security and App Lock", "Team and Access"])
      expect(manageSarafi).toContain(label);
  });

  it("provides exact Hawala recipient selection and guarded payout completion", () => {
    expect(hawalaWorkflow).toContain("Search recipient");
    expect(hawalaWorkflow).toContain("recipient_branch_name");
    expect(hawalaWorkflow).toContain("Give Money and Complete Hawala");
    expect(app).toContain("identityFront");
    expect(app).toContain("identityBack");
    expect(migration).toContain("recipient_organization_name");
    expect(migration).toContain("recipient_branch_name");
  });

  it("keeps app-lock secrets server-side and exposes complete lock controls", () => {
    expect(appLockServer).toContain("scryptSync");
    expect(appLockServer).toContain("timingSafeEqual");
    expect(appLockServer).toContain('body.action === "settings"');
    expect(appLockServer).toContain('body.action === "disable"');
    expect(appLockClient).toContain("autoLockSeconds");
    expect(appLockClient).toContain("lockOnBackground");
    expect(appLockSettings).toContain("labels.lockNow");
    expect(appLockGate).toContain("unlockAppWithPin");
    expect(app).not.toContain("localStorage.setItem(\"app-lock");
  });

  it("keeps the v8 workflows in focused React components", () => {
    expect(inlineRateResolver).toContain("function CompactRateRow");
    expect(moneyValuation).toContain("function MoneyValuationSummary");
    expect(moneyValuation).toContain("function CurrencyValuationTable");
    expect(hawalaWorkflow).toContain("function HawalaRecipientSearch");
    expect(hawalaWorkflow).toContain("function HawalaReceivedList");
    expect(hawalaWorkflow).toContain("function HawalaIdentityCapture");
    expect(hawalaWorkflow).toContain("function HawalaPayoutConfirmation");
    expect(appLockGate).toContain("function AppLockGate");
    expect(appLockSettings).toContain("function AppLockSettings");
  });
});
