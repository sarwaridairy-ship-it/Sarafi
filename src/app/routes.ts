import type { Capability } from "./capabilities";

export type FinancialRoute =
  | "/fx/buy"
  | "/fx/sell"
  | "/fx/exchange"
  | "/money-in/customer"
  | "/money-in/debt-payment"
  | "/money-in/income"
  | "/money-in/owner-capital"
  | "/money-out/customer"
  | "/money-out/debt-payment"
  | "/money-out/expense"
  | "/money-out/owner-withdrawal"
  | "/move/cashbox"
  | "/move/branch"
  | "/move/bank"
  | "/debt/receivable"
  | "/debt/payable"
  | "/debts/settle"
  | "/hawala/send"
  | "/hawala/incoming"
  | "/hawala/payout"
  | "/hawala/settlement";

export function workspaceRoot(organizationId: string | null): string {
  return organizationId && organizationId !== "inspection" ? `/app/${organizationId}` : "/app/inspection";
}

export function financialRoute(organizationId: string | null, route: FinancialRoute): string {
  if (route === "/debts/settle") return `${workspaceRoot(organizationId)}${route}`;
  return `${workspaceRoot(organizationId)}/transactions/new${route}`;
}

export function financialRouteSuffix(pathname: string): FinancialRoute | null {
  if (pathname.endsWith("/debts/settle")) return "/debts/settle";
  const marker = "/transactions/new";
  const index = pathname.indexOf(marker);
  if (index < 0) return null;
  const suffix = pathname.slice(index + marker.length) as FinancialRoute;
  const known = new Set<FinancialRoute>([
    "/fx/buy", "/fx/sell", "/fx/exchange",
    "/money-in/customer", "/money-in/debt-payment", "/money-in/income", "/money-in/owner-capital",
    "/money-out/customer", "/money-out/debt-payment", "/money-out/expense", "/money-out/owner-withdrawal",
    "/move/cashbox", "/move/branch", "/move/bank",
    "/debt/receivable", "/debt/payable", "/debts/settle",
    "/hawala/send", "/hawala/incoming", "/hawala/payout", "/hawala/settlement",
  ]);
  return known.has(suffix) ? suffix : null;
}

export function capabilityForFinancialRoute(route: FinancialRoute): Capability {
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
  if (route === "/money-in/owner-capital" || route === "/money-out/owner-withdrawal") return "owner.capital.post";
  return "financial.post.money";
}
