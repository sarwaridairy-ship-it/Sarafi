import { matchPath } from "react-router-dom";
import type { Capability } from "./capabilities";

export type FinancialRoute =
  | "/fx/buy"
  | "/fx/sell"
  | "/fx/exchange"
  | "/money-in/receive"
  | "/money-in/income"
  | "/money-in/owner-investment"
  | "/money-out/pay"
  | "/money-out/expense"
  | "/money-out/owner-withdrawal"
  | "/move/transfer"
  | "/move/bank-deposit"
  | "/move/bank-withdrawal"
  | "/debt/receivable"
  | "/debt/payable"
  | "/hawala/send"
  | "/hawala/incoming"
  | "/hawala/payout";

export type LegacyFinancialRoute =
  | "/money-in/customer"
  | "/money-in/debt-payment"
  | "/money-in/owner-capital"
  | "/money-out/customer"
  | "/money-out/debt-payment"
  | "/move/cashbox"
  | "/move/branch"
  | "/move/bank"
  | "/debts/settle"
  | "/hawala/settlement";

export type FinancialDestination = FinancialRoute | LegacyFinancialRoute | "/debts" | "/hawala/partners";
type RecognizedFinancialRoute = FinancialRoute | LegacyFinancialRoute;

export function workspaceRoot(organizationId: string | null): string {
  return organizationId && organizationId !== "inspection" ? `/app/${organizationId}` : "/app/inspection";
}

export function workspaceSectionPath(organizationId: string | null, section: string, cashboxId?: string | null): string {
  const root = workspaceRoot(organizationId);
  return ({
    Dashboard: `${root}/home`,
    Trade: `${root}/transactions/new`,
    "Transaction FX": `${root}/transactions/new/fx/buy`,
    "Transaction Money In": `${root}/transactions/new/money/receive/customer`,
    "Transaction Money Out": `${root}/transactions/new/money/pay/customer`,
    "Transaction Move Money": `${root}/transactions/new/money/move/cashbox`,
    "Transaction Debt": `${root}/transactions/new/debt/receivable`,
    "Transaction Hawala": `${root}/transactions/new/hawala/send`,
    "Transaction Correction": `${root}/transactions/new/correction`,
    "Transaction Opening": `${root}/transactions/new/opening-money`,
    Transactions: `${root}/transactions`,
    "Cash & Accounts": `${root}/money`,
    People: `${root}/customers`,
    Debts: `${root}/debts`,
    Hawala: `${root}/hawala`,
    "Team & Devices": `${root}/control/team`,
    Reconciliation: `${root}/reconciliation`,
    Rates: `${root}/control/rates`,
    Reports: `${root}/reports`,
    Compliance: `${root}/compliance`,
    "Compliance Reviews": `${root}/compliance`,
    "Compliance Cases": `${root}/compliance?view=cases`,
    "Cashbox Close": `${root}/cashboxes/${cashboxId ?? "current"}/close`,
    Control: `${root}/control`,
    "Business Settings": `${root}/control/business`,
    Security: `${root}/control/security`,
    Import: `${root}/control/import`,
    Billing: `${root}/control/billing`,
    Offline: `${root}/offline`,
  } as Record<string, string>)[section] ?? `${root}/home`;
}

export function financialRoute(organizationId: string | null, route: RecognizedFinancialRoute): string {
  const root = workspaceRoot(organizationId);
  const canonicalPaths: Partial<Record<RecognizedFinancialRoute, string>> = {
    "/money-in/receive": "/transactions/new/money/receive/customer",
    "/money-in/customer": "/transactions/new/money/receive/customer",
    "/money-in/debt-payment": "/transactions/new/money/receive/debt",
    "/money-in/income": "/transactions/new/money/receive/income",
    "/money-out/pay": "/transactions/new/money/pay/customer",
    "/money-out/customer": "/transactions/new/money/pay/customer",
    "/money-out/debt-payment": "/transactions/new/money/pay/debt",
    "/money-out/expense": "/transactions/new/money/pay/expense",
    "/move/transfer": "/transactions/new/money/move/cashbox",
    "/move/cashbox": "/transactions/new/money/move/cashbox",
    "/move/branch": "/transactions/new/money/move/branch",
    "/move/bank": "/transactions/new/money/move/bank",
    "/move/bank-deposit": "/transactions/new/money/move/bank?action=BANK_DEPOSIT",
    "/move/bank-withdrawal": "/transactions/new/money/move/bank?action=BANK_WITHDRAWAL",
    "/hawala/incoming": "/hawala/incoming",
  };
  if (canonicalPaths[route]) return `${root}${canonicalPaths[route]}`;
  if (route === "/hawala/payout" || route === "/debts/settle") return `${root}${route}`;
  return `${root}/transactions/new${route}`;
}

const routePatterns: Array<{ pattern: string; route: RecognizedFinancialRoute }> = [
  { pattern: "/app/:organizationId/transactions/new/fx/buy", route: "/fx/buy" },
  { pattern: "/app/:organizationId/transactions/new/fx/sell", route: "/fx/sell" },
  { pattern: "/app/:organizationId/transactions/new/fx/exchange", route: "/fx/exchange" },
  { pattern: "/app/:organizationId/transactions/new/money/receive/customer", route: "/money-in/receive" },
  { pattern: "/app/:organizationId/transactions/new/money/receive/debt", route: "/money-in/debt-payment" },
  { pattern: "/app/:organizationId/transactions/new/money/receive/income", route: "/money-in/income" },
  { pattern: "/app/:organizationId/transactions/new/money/pay/customer", route: "/money-out/pay" },
  { pattern: "/app/:organizationId/transactions/new/money/pay/debt", route: "/money-out/debt-payment" },
  { pattern: "/app/:organizationId/transactions/new/money/pay/expense", route: "/money-out/expense" },
  { pattern: "/app/:organizationId/transactions/new/money/move/cashbox", route: "/move/transfer" },
  { pattern: "/app/:organizationId/transactions/new/money/move/branch", route: "/move/branch" },
  { pattern: "/app/:organizationId/transactions/new/money/move/bank", route: "/move/bank" },
  { pattern: "/app/:organizationId/transactions/new/money-in/receive", route: "/money-in/receive" },
  { pattern: "/app/:organizationId/transactions/new/money-in/income", route: "/money-in/income" },
  { pattern: "/app/:organizationId/transactions/new/money-in/owner-investment", route: "/money-in/owner-investment" },
  { pattern: "/app/:organizationId/transactions/new/money-out/pay", route: "/money-out/pay" },
  { pattern: "/app/:organizationId/transactions/new/money-out/expense", route: "/money-out/expense" },
  { pattern: "/app/:organizationId/transactions/new/money-out/owner-withdrawal", route: "/money-out/owner-withdrawal" },
  { pattern: "/app/:organizationId/transactions/new/move/transfer", route: "/move/transfer" },
  { pattern: "/app/:organizationId/transactions/new/move/bank-deposit", route: "/move/bank-deposit" },
  { pattern: "/app/:organizationId/transactions/new/move/bank-withdrawal", route: "/move/bank-withdrawal" },
  { pattern: "/app/:organizationId/transactions/new/debt/receivable", route: "/debt/receivable" },
  { pattern: "/app/:organizationId/transactions/new/debt/payable", route: "/debt/payable" },
  { pattern: "/app/:organizationId/transactions/new/hawala/send", route: "/hawala/send" },
  { pattern: "/app/:organizationId/transactions/new/hawala/incoming", route: "/hawala/incoming" },
  { pattern: "/app/:organizationId/hawala/incoming", route: "/hawala/incoming" },
  { pattern: "/app/:organizationId/hawala/payout", route: "/hawala/payout" },
  { pattern: "/app/:organizationId/transactions/new/money-in/customer", route: "/money-in/customer" },
  { pattern: "/app/:organizationId/transactions/new/money-in/debt-payment", route: "/money-in/debt-payment" },
  { pattern: "/app/:organizationId/transactions/new/money-in/owner-capital", route: "/money-in/owner-capital" },
  { pattern: "/app/:organizationId/transactions/new/money-out/customer", route: "/money-out/customer" },
  { pattern: "/app/:organizationId/transactions/new/money-out/debt-payment", route: "/money-out/debt-payment" },
  { pattern: "/app/:organizationId/transactions/new/move/cashbox", route: "/move/cashbox" },
  { pattern: "/app/:organizationId/transactions/new/move/branch", route: "/move/branch" },
  { pattern: "/app/:organizationId/transactions/new/move/bank", route: "/move/bank" },
  { pattern: "/app/:organizationId/debts/settle", route: "/debts/settle" },
  { pattern: "/app/:organizationId/transactions/new/hawala/settlement", route: "/hawala/settlement" },
];

export function financialRouteSuffix(pathname: string): RecognizedFinancialRoute | null {
  return routePatterns.find(({ pattern }) => matchPath({ path: pattern, end: true }, pathname))?.route ?? null;
}

export function capabilityForFinancialRoute(route: RecognizedFinancialRoute): Capability {
  if (route.startsWith("/fx/")) return "financial.post.fx";
  if (route === "/debt/receivable") return "debt.create.receivable";
  if (route === "/debt/payable") return "debt.create.payable";
  if (route === "/money-in/debt-payment") return "debt.settle.receivable";
  if (route === "/money-out/debt-payment") return "debt.settle.payable";
  if (route === "/debts/settle") return "debt.view";
  if (route === "/hawala/send") return "hawala.send";
  if (route === "/hawala/incoming") return "hawala.incoming";
  if (route === "/hawala/payout") return "hawala.payout";
  if (route === "/hawala/settlement") return "hawala.settle";
  if (route === "/money-in/owner-investment" || route === "/money-in/owner-capital" || route === "/money-out/owner-withdrawal") return "owner.capital.post";
  return "financial.post.money";
}
