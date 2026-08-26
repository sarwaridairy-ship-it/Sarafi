# SARAFI Production Baseline

Reviewed: 2026-08-26

## Verified State

| Area | Evidence | Status |
| --- | --- | --- |
| Git | `main` and `origin/main` at `7ff0d1d22ec464d9e8dad5ca1a3a4cd04bffc2f8` | PASS |
| Working tree | `git status` reports clean | PASS |
| Web deployment | Vercel production deployment is Ready; alias `https://sarafi-swart.vercel.app` | PASS |
| Supabase migrations | Local and remote migrations `202608240001` through `202608240026` match | PASS |
| Supabase schema lint | `npx supabase db lint --linked` reports no schema errors | PASS |
| Unit tests | `50 passed` across 17 files | PASS |
| Browser tests | `10 passed`, 2 authenticated tests intentionally skipped without opt-in secrets | PASS with documented exception |
| Typecheck/lint/build | All pass; build reports a non-blocking large chunk warning | PASS with non-blocking warning |
| Authentication gate | Public inspection mode is intentional per product-owner exception | EXCEPTION |

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
| Offline | Encrypted durable outbox | `offline.ts`, `offlineStore.ts` | PARTIAL: storage and reconnect helper exist; production sync adapter and conflict UI remain |
| Compliance | Rules/KYC/screening boundary | compliance migrations; fail-closed provider function | PARTIAL: no approved provider or legal sign-off |

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
- The public authentication gate remains intentionally disabled by owner request.

This file is an evidence baseline, not a production-complete claim. Update the status and
evidence when each capability passes its user-facing, authorization, accounting, and
operational acceptance gate.