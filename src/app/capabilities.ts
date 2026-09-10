export type Capability =
  | "workspace.view"
  | "financial.overview"
  | "financial.post.fx"
  | "financial.post.money"
  | "financial.post.debt"
  | "financial.post.hawala"
  | "financial.post.opening"
  | "financial.reverse"
  | "financial.report"
  | "customers.manage"
  | "reconciliation.submit"
  | "reconciliation.approve"
  | "approval.request"
  | "approval.decide"
  | "team.view"
  | "team.invite"
  | "team.manage"
  | "team.capabilities.manage"
  | "rates.manage"
  | "money_accounts.manage"
  | "organization.manage"
  | "security.manage"
  | "compliance.review"
  | "data.import"
  | "billing.manage"
  | "ownership.transfer"
  | "owner.delete"
  | "owner.capital.post"
  | "dashboard.owner"
  | "dashboard.manager"
  | "dashboard.accountant"
  | "dashboard.cashier"
  | "dashboard.viewer"
  | "dashboard.compliance"
  | "transactions.view"
  | "debt.view"
  | "debt.create.receivable"
  | "debt.create.payable"
  | "debt.settle.receivable"
  | "debt.settle.payable"
  | "hawala.view"
  | "hawala.send"
  | "hawala.incoming"
  | "hawala.payout"
  | "hawala.transition"
  | "hawala.settle"
  | "documents.list"
  | "documents.upload"
  | "documents.view"
  | "documents.download"
  | "documents.archive";

export type WorkspaceRole =
  | "owner"
  | "business_admin"
  | "manager"
  | "accountant"
  | "cashier"
  | "compliance_officer"
  | "viewer";

const roleCapabilityDefaults: Record<WorkspaceRole, Capability[]> = {
  owner: [
    "workspace.view", "financial.overview", "financial.post.fx", "financial.post.money",
    "financial.post.debt", "financial.post.hawala", "financial.post.opening", "financial.report",
    "financial.reverse",
    "customers.manage", "reconciliation.submit", "reconciliation.approve", "approval.request",
    "approval.decide", "team.view", "team.invite", "team.manage", "team.capabilities.manage",
    "rates.manage", "money_accounts.manage", "organization.manage", "security.manage",
    "compliance.review", "data.import", "billing.manage", "ownership.transfer", "owner.delete",
    "owner.capital.post",
    "dashboard.owner", "transactions.view", "debt.view", "debt.create.receivable", "debt.create.payable",
    "debt.settle.receivable", "debt.settle.payable", "hawala.view", "hawala.send", "hawala.incoming",
    "hawala.payout", "hawala.transition", "hawala.settle", "documents.list", "documents.upload",
    "documents.view", "documents.download", "documents.archive",
  ],
  business_admin: [
    "workspace.view", "financial.overview", "financial.post.fx", "financial.post.money", "financial.post.debt",
    "financial.post.hawala", "financial.post.opening", "financial.report",
    "financial.reverse",
    "customers.manage", "reconciliation.submit", "reconciliation.approve", "approval.request",
    "approval.decide", "team.view", "team.invite", "team.manage", "team.capabilities.manage",
    "rates.manage", "money_accounts.manage", "organization.manage", "security.manage",
    "compliance.review", "data.import",
    "dashboard.owner", "transactions.view", "debt.view", "debt.create.receivable", "debt.create.payable",
    "debt.settle.receivable", "debt.settle.payable", "hawala.view", "hawala.send", "hawala.incoming",
    "hawala.payout", "hawala.transition", "hawala.settle", "documents.list", "documents.upload",
    "documents.view", "documents.download", "documents.archive",
  ],
  manager: [
    "workspace.view", "financial.overview", "financial.post.fx", "financial.post.money",
    "financial.post.debt", "financial.post.hawala", "financial.report", "customers.manage",
    "financial.reverse",
    "reconciliation.submit", "reconciliation.approve", "approval.request", "approval.decide",
    "team.view", "rates.manage",
    "dashboard.manager", "transactions.view", "debt.view", "debt.create.receivable", "debt.create.payable",
    "debt.settle.receivable", "debt.settle.payable", "hawala.view", "hawala.send", "hawala.incoming",
    "hawala.payout", "hawala.transition", "hawala.settle",
  ],
  accountant: [
    "workspace.view", "financial.overview", "financial.report", "reconciliation.submit", "team.view",
    "dashboard.accountant", "transactions.view", "debt.view", "hawala.view",
  ],
  cashier: [
    "workspace.view", "financial.post.fx", "financial.post.money", "financial.post.debt",
    "financial.post.hawala", "customers.manage", "reconciliation.submit", "approval.request",
    "dashboard.cashier", "transactions.view", "debt.view", "debt.create.receivable",
    "debt.settle.receivable", "hawala.view", "hawala.send", "hawala.incoming", "hawala.payout",
    "hawala.transition",
  ],
  compliance_officer: [
    "workspace.view", "financial.overview", "team.view", "compliance.review", "dashboard.compliance",
    "transactions.view", "hawala.view", "documents.list", "documents.upload", "documents.view",
    "documents.download", "documents.archive",
  ],
  viewer: ["workspace.view", "financial.overview", "financial.report", "dashboard.viewer", "transactions.view", "debt.view", "hawala.view"],
};

export const financialPostCapabilities: Capability[] = [
  "financial.post.fx",
  "financial.post.money",
  "financial.post.debt",
  "financial.post.hawala",
  "financial.post.opening",
  "financial.reverse",
  "owner.capital.post",
  "debt.create.receivable",
  "debt.create.payable",
  "debt.settle.receivable",
  "debt.settle.payable",
  "hawala.send",
  "hawala.incoming",
  "hawala.payout",
  "hawala.transition",
  "hawala.settle",
];

export function inspectionCapabilities(role: WorkspaceRole): Capability[] {
  return roleCapabilityDefaults[role];
}

export function hasCapability(capabilities: readonly string[], capability: Capability): boolean {
  return capabilities.includes(capability);
}

export function hasAnyCapability(capabilities: readonly string[], required: readonly Capability[]): boolean {
  return required.some((capability) => hasCapability(capabilities, capability));
}

export type NavigationSection =
  | "Dashboard"
  | "Trade"
  | "Rates"
  | "Transactions"
  | "Cash & Accounts"
  | "People"
  | "Debts"
  | "Hawala"
  | "Reports"
  | "Reconciliation"
  | "Cashbox Close"
  | "Team & Devices"
  | "Compliance Reviews"
  | "Compliance Cases"
  | "Search"
  | "Control";

export function navigationSections(capabilities: readonly string[]): NavigationSection[] {
  // The server capability response is authoritative. Dashboard capabilities
  // identify the role-shaped read model without trusting a client role name.
  if (hasCapability(capabilities, "dashboard.compliance"))
    return ["Dashboard", "Hawala", "Compliance Reviews", "Compliance Cases", "Search"];
  if (hasCapability(capabilities, "dashboard.accountant"))
    return ["Dashboard", "Transactions", "Reports", "Debts", "Reconciliation"];
  if (hasCapability(capabilities, "dashboard.cashier"))
    return ["Dashboard", "Trade", "People", "Transactions", "Cashbox Close"];
  if (hasCapability(capabilities, "dashboard.manager"))
    return ["Dashboard", "Trade", "Rates", "Cash & Accounts", "Transactions", "Team & Devices"];
  if (hasCapability(capabilities, "dashboard.viewer"))
    return ["Dashboard", "Cash & Accounts", "Transactions", "Reports", "Search"];
  if (hasCapability(capabilities, "dashboard.owner") && hasCapability(capabilities, "owner.delete"))
    return ["Dashboard", "Trade", "Rates", "Cash & Accounts", "Transactions", "Control"];
  if (hasCapability(capabilities, "dashboard.owner"))
    return ["Dashboard", "Trade", "Rates", "People", "Transactions", "Control"];

  // Custom capability bundles receive the most useful role-shaped shortcuts.
  const candidates: NavigationSection[] = [
    "Dashboard",
    ...(hasAnyCapability(capabilities, financialPostCapabilities) ? ["Trade" as const] : []),
    ...(hasCapability(capabilities, "rates.manage") ? ["Rates" as const] : []),
    ...(hasCapability(capabilities, "transactions.view") ? ["Transactions" as const] : []),
    ...(hasCapability(capabilities, "financial.report") ? ["Reports" as const] : []),
    ...(hasCapability(capabilities, "financial.overview") ? ["Cash & Accounts" as const] : []),
    ...(hasCapability(capabilities, "customers.manage") ? ["People" as const] : []),
    ...(hasCapability(capabilities, "debt.view") ? ["Debts" as const] : []),
    ...(hasCapability(capabilities, "compliance.review") ? ["Compliance Reviews" as const] : []),
    "Search",
  ];
  return candidates.filter((section, index) => candidates.indexOf(section) === index).slice(0, 5);
}

const sectionCapabilities: Partial<Record<string, Capability[]>> = {
  Trade: financialPostCapabilities,
  Transactions: ["financial.overview", "financial.report", ...financialPostCapabilities],
  "Cash & Accounts": ["financial.overview", "money_accounts.manage"],
  People: ["customers.manage", "financial.overview"],
  Debts: ["debt.view", "debt.create.receivable", "debt.create.payable", "debt.settle.receivable", "debt.settle.payable", "financial.post.debt", "financial.overview", "financial.report"],
  Rates: ["rates.manage", "financial.overview"],
  Reports: ["financial.report"],
  "Team & Devices": ["team.view", "team.manage"],
  Control: ["organization.manage", "team.manage", "rates.manage", "security.manage", "billing.manage"],
  "Business Settings": ["organization.manage"],
  Security: ["security.manage"],
  Reconciliation: ["reconciliation.submit", "reconciliation.approve"],
  "Cashbox Close": ["reconciliation.submit", "reconciliation.approve"],
  Hawala: ["hawala.view", "hawala.send", "hawala.incoming", "hawala.payout", "hawala.transition", "hawala.settle", "financial.post.hawala", "financial.overview", "compliance.review"],
  Compliance: ["compliance.review"],
  "Compliance Reviews": ["compliance.review"],
  "Compliance Cases": ["compliance.review"],
  Import: ["data.import"],
  Billing: ["billing.manage"],
  Offline: ["workspace.view"],
};

export function canOpenSection(capabilities: readonly string[], section: string): boolean {
  if (section === "Search") return hasCapability(capabilities, "workspace.view");
  if (["Public", "Auth", "Pending", "Platform", "Not Found"].includes(section)) return true;
  if (section === "Dashboard") return hasCapability(capabilities, "workspace.view");
  const required = sectionCapabilities[section];
  return required ? hasAnyCapability(capabilities, required) : false;
}
