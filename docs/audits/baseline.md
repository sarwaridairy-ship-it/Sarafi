# SARAFI Production Baseline

Reviewed: 2026-08-26

## Verified State

| Area | Evidence | Status |
| --- | --- | --- |
| Git | `git rev-parse HEAD` equals `git rev-parse origin/main` on `main` | PASS |
| Working tree | `git status` reports clean | PASS |
| Web deployment | Vercel production deployment is Ready; alias `https://sarafi-swart.vercel.app` | PASS |
| Supabase migrations | Local and remote migrations `202608240001` through `202608240026` match | PASS |
| Supabase schema lint | `npx supabase db lint --linked` reports no schema errors | PASS |
| Unit tests | `50 passed` across 17 files | PASS |
| Browser tests | `10 passed`, 2 authenticated tests intentionally skipped without opt-in secrets | PASS with documented exception |
| Typecheck/lint/build | All pass; build reports a non-blocking large chunk warning | PASS with non-blocking warning |
| Authentication gate | Production requires Supabase session; only `MODE=e2e` or explicit development flag enables inspection mode | PASS with documented exception |

## Route and Capability Matrix

| Surface | User capability | Implementation | Status |
| --- | --- | --- | --- |
| Dashboard | Owner overview shell | `src/App.tsx`; `get_owner_dashboard` | PARTIAL: public inspection view; authenticated live path exists but is not UI-enabled |
| Trade | Sell FX form | `src/App.tsx`; `record_fx_trade` | PARTIAL: public preview cannot post; buy/exchange UI remains simplified |
| More actions | Receive/pay/transfer/expense/capital/bank forms | `src/App.tsx`; `record_operation` | PARTIAL: forms and RPC exist; full domain workflows need richer records and live authenticated journeys |
| Transactions | Activity table | `src/App.tsx`; dashboard activity payload | PARTIAL: no full search/detail/reversal screen |
| Cash & Accounts | Money locations | `src/App.tsx`; dashboard locations payload | PARTIAL: summary only |
| People | Counterparties | Supabase tables and read API | PARTIAL: no full management screen |
| Debts | Receivable/payable and settlement | `record_debt`, `settle_debt`; `DebtsView` | PARTIAL: list/create/settle surface exists; authenticated E2E absent |
| Rates | Rate board and calculator | `RatesView`; valuation domain | PARTIAL: preview rates; no authorized publish/history UI |
| Reports | PDF/CSV/print | `ReportsView`; `record_report_export`; export helpers | PARTIAL: report data and authorization are limited in preview |
| Reconciliation | Cash count and variance | `record_cashbox_close`, `approve_cashbox_close`; `ReconciliationView` | PARTIAL: entry screen exists; history/approval UI incomplete |
| Hawala | Feature-gated send and list | `record_hawala_send`; `HawalaView` | PARTIAL: send workflow exists; enabled-provider and settlement journeys need authenticated validation |
| Team & Devices | Device/team control | Supabase tables and local models | PARTIAL: no complete UI |
| Settings | Organization configuration | Supabase settings tables | PARTIAL: no complete UI |
| Network resilience | Encrypted offline drafts | `offline.ts`, `offlineStore.ts` | Safe degraded mode: cached shell/read-only state and review-only drafts; no authoritative offline posting |
| Compliance | Rules/KYC/screening boundary | compliance migrations; fail-closed provider function | PARTIAL: no approved provider or legal sign-off |

## Capability Owners

| Capability group | Owner |
| --- | --- |
| Dashboard, Trade, Transactions, Cash & Accounts | Web product engineering |
| More actions, Debts, Reconciliation, Hawala | Financial domain engineering |
| Rates, Reports, exports | Reporting and valuation engineering |
| Offline degraded mode and draft privacy | Client platform engineering |
| Roles, devices, MFA, RLS, privileged RPCs | Security and database engineering |
| Compliance rules, KYC, sanctions boundary | Compliance engineering plus regulated-business reviewer |
| CI, Vercel, Supabase migrations, release evidence | Release engineering |
| Dari/Pashto terminology and UAT | Localization lead plus named Afghan reviewers |
| Native Android/iOS delivery | Mobile release owner |

## Privileged Database Surface

Authoritative functions include `record_fx_trade`, `record_operation`, `record_debt`,
`settle_debt`, `record_cashbox_close`, `approve_cashbox_close`, `record_hawala_send`,
`record_report_export`, and `require_sanctions_provider`. They are security-definer
functions with explicit authenticated grants. Remote schema lint is clean.

## Known Release Blockers

- Authenticated role, MFA, device, RLS, and concurrency journeys require configured test identities.
- An approved sanctions provider and Afghan legal/compliance sign-off are external requirements.
- Backup/restore and monitoring require provider-level access and evidence.
- Native Android/iOS projects require architecture, signing credentials, store accounts, and device testing.
- Human Dari/Pashto terminology review and formal UAT require named reviewers.
- The public authentication gate is active; `MODE=e2e` and the explicit development flag are the only inspection exceptions.

This file is an evidence baseline, not a production-complete claim. Update the status and
evidence when each capability passes its user-facing, authorization, accounting, and
operational acceptance gate.