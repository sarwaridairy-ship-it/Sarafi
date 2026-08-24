# SARAFI Data Model

Organizations own branches, cashboxes, enabled currencies, memberships, devices, financial events, ledger accounts, journal entries, journal lines, approvals, and security audit events.

Every organization-owned table carries `organization_id` directly. Child relationships also validate parent ownership. Journal lines carry native currency debit/credit and base-currency debit/credit as NUMERIC values. `command_receipts` gives each organization-scoped command an idempotency boundary.

The client reads authorized views and invokes server-side commands. It never writes journal lines or cached balances directly.
