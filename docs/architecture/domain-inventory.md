# SARAFI Domain Inventory

This document maps the required production inventory to the deployed schema. Existing cleaner equivalents are noted rather than duplicated.

## Deployed groups

- Tenancy/configuration: organizations, organization_settings, organization_features, branches, currencies, organization_currencies, rate_groups, rate_board_entries, valuation_rate_sets, valuation_rates.
- Identity/authorization: profiles, organization_memberships, roles, permissions, role_permissions, membership_scopes, devices, trusted_devices, auth_security_events, support_access_grants.
- Locations/accounts: cashboxes, safes, bank_accounts, ledger_accounts, chart_of_accounts.
- Ledger: financial_events/source_events, journal_entries, journal_lines, command_receipts/command_idempotency, reversals, accounting_periods, daily_balance_snapshots.
- Operations: fx_trades, fx_trade_legs, fees, cash_transfers, bank_movements, expenses, income_events, owner_capital_events, debts, settlements, receipts, attachments.
- People: counterparties, counterparty_contacts, counterparty_addresses, counterparty_tags, counterparty_credit_limits, counterparty_documents.
- Costing/position: fx_inventory_cost_state, currency_position_snapshots, valuation snapshots.
- Reconciliation: shifts, cashbox_closes/cashbox_closures, cashbox_close_lines/cash_counts, cash_count_lines, cash_variances.
- Workflow/control: approval_requests, notifications, notification_preferences, security_audit_events, audit_checkpoints, organization_features.
- Offline/sync: offline_policies, offline_command_receipts, client command IDs, conflict status, minimum-version policy remains a release configuration gate.
- Compliance: compliance_profiles, compliance_rule_sets, compliance_rules, kyc_profiles, kyc_documents, screening_runs, screening_matches, compliance_alerts, compliance_cases, regulatory_report_runs, regulatory_report_exports, compliance_audit_events.
- Hawala: hawala_transfers, hawala_beneficiaries, hawala_partners, hawala_status_events, hawala_settlements.

All organization-owned inventory tables have organization IDs and explicit read RLS policies. Financial mutation remains RPC-only. Native amounts, base amounts, rates, and balances use PostgreSQL NUMERIC.

## Remaining product surface gaps

The schema inventory is complete, but not every inventory entity has a dedicated route or fully wired live form. Those are tracked in the release scorecard and must be closed before public production.
