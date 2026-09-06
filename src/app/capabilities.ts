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
  | "owner.capital.post";

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
  ],
  business_admin: [
    "workspace.view", "financial.overview", "financial.post.fx", "financial.post.money",
    "financial.post.debt", "financial.post.hawala", "financial.post.opening", "financial.report",
    "financial.reverse",
    "customers.manage", "reconciliation.submit", "reconciliation.approve", "approval.request",
    "approval.decide", "team.view", "team.invite", "team.manage", "team.capabilities.manage",
    "rates.manage", "money_accounts.manage", "organization.manage", "security.manage",
    "compliance.review", "data.import",
  ],
  manager: [
    "workspace.view", "financial.overview", "financial.post.fx", "financial.post.money",
    "financial.post.debt", "financial.post.hawala", "financial.report", "customers.manage",
    "financial.reverse",
    "reconciliation.submit", "reconciliation.approve", "approval.request", "approval.decide",
    "team.view",
  ],
  accountant: ["workspace.view", "financial.overview", "financial.report", "reconciliation.submit", "team.view"],
  cashier: [
    "workspace.view", "financial.post.fx", "financial.post.money", "financial.post.debt",
    "financial.post.hawala", "customers.manage", "reconciliation.submit", "approval.request",
  ],
  compliance_officer: ["workspace.view", "financial.overview", "team.view", "compliance.review"],
  viewer: ["workspace.view", "financial.overview", "financial.report"],
};

export const financialPostCapabilities: Capability[] = [
  "financial.post.fx",
  "financial.post.money",
  "financial.post.debt",
  "financial.post.hawala",
  "financial.post.opening",
  "financial.reverse",
  "owner.capital.post",
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
  | "Transactions"
  | "Cash & Accounts"
  | "People"
  | "Reports"
  | "Reconciliation"
  | "Compliance Reviews"
  | "Control";

export function navigationSections(capabilities: readonly string[]): NavigationSection[] {
  const result: NavigationSection[] = ["Dashboard"];
  const add = (section: NavigationSection, allowed: boolean) => {
    if (allowed && result.length < 5 && !result.includes(section)) result.push(section);
  };

  const hasManagement = hasAnyCapability(capabilities, ["organization.manage", "team.manage", "rates.manage", "security.manage", "billing.manage"]);
  add("Trade", hasAnyCapability(capabilities, financialPostCapabilities));
  add("Transactions", hasAnyCapability(capabilities, ["financial.overview", "financial.report", ...financialPostCapabilities]));
  if (hasManagement) {
    add("Reports", hasCapability(capabilities, "financial.report"));
    add("Control", true);
    return result;
  }
  add("People", hasAnyCapability(capabilities, ["customers.manage", "financial.overview"]));
  add("Cash & Accounts", hasAnyCapability(capabilities, ["financial.overview", "money_accounts.manage"]));
  add("Reports", hasCapability(capabilities, "financial.report"));
  add("Reconciliation", hasAnyCapability(capabilities, ["reconciliation.submit", "reconciliation.approve"]));
  add("Compliance Reviews", hasCapability(capabilities, "compliance.review"));
  add("Control", hasAnyCapability(capabilities, ["organization.manage", "team.manage", "rates.manage", "security.manage", "billing.manage"]));
  return result;
}

const sectionCapabilities: Partial<Record<string, Capability[]>> = {
  Trade: financialPostCapabilities,
  Transactions: ["financial.overview", "financial.report", ...financialPostCapabilities],
  "Cash & Accounts": ["financial.overview", "money_accounts.manage"],
  People: ["customers.manage", "financial.overview"],
  Debts: ["financial.post.debt", "financial.overview", "financial.report"],
  Rates: ["rates.manage", "financial.overview"],
  Reports: ["financial.report"],
  "Team & Devices": ["team.view", "team.manage"],
  Control: ["organization.manage", "team.manage", "rates.manage", "security.manage", "billing.manage"],
  "Business Settings": ["organization.manage"],
  Security: ["security.manage"],
  Reconciliation: ["reconciliation.submit", "reconciliation.approve"],
  "Cashbox Close": ["reconciliation.submit", "reconciliation.approve"],
  Hawala: ["financial.post.hawala", "financial.overview", "compliance.review"],
  Compliance: ["compliance.review"],
  "Compliance Reviews": ["compliance.review"],
  "Compliance Cases": ["compliance.review"],
  Import: ["data.import"],
  Billing: ["billing.manage"],
  Offline: ["workspace.view"],
};

export function canOpenSection(capabilities: readonly string[], section: string): boolean {
  if (section === "Dashboard") return hasCapability(capabilities, "workspace.view");
  const required = sectionCapabilities[section];
  return required ? hasAnyCapability(capabilities, required) : false;
}
