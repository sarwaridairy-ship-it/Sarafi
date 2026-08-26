# Step 04: Non-FX Daily Operations Evidence

Reviewed: 2026-08-26

## Implemented

- Receive Money and Pay Money use validated operation forms and the authoritative `record_operation` RPC.
- Expenses capture category, amount, currency, location, and note.
- Owner investment and withdrawal use separate equity accounts and are not treated as operating income or expense.
- Bank deposit and withdrawal capture source and destination locations.
- Cash transfers capture source and destination locations and preserve zero operating profit.
- Receivables and payables use `record_debt`; partial settlements use `settle_debt` with row locking and outstanding-balance validation.
- Settlement records are materialized into the `settlements` table.
- Opening balances use `record_opening_balance`, post to cash and opening capital, and require owner/manager authorization.
- Corrections use `request_reversal`, preserve the original entry, require a reason, and write reversed journal lines.
- Hawala send is feature-gated and uses an immutable journal event, receipt, and status event.
- Every posted journal entry receives an idempotent receipt record.
- Operation materialization keeps expense, income, capital, bank, transfer, and settlement tables aligned with the journal.

## Executable Evidence

- Domain operation tests cover FX receipts, debt creation, partial settlement limits, expense classification, owner investment, transfer profit neutrality, bank movement, Hawala feature gating, and reversal effects.
- Browser tests cover direct core actions, More Actions forms, Debts, Reconciliation, Hawala, Opening Balance, responsive behavior, and RTL.
- Supabase migrations through `030` are applied and `npx supabase db lint --linked` passes with no schema errors.
- Typecheck, lint, unit tests, browser tests, and production build pass.

## Remaining Gate

Authenticated execution of every operation against a real organization, including opening
balances, reversal approval, settlement materialization, and dashboard/report reconciliation,
requires configured authenticated test identities and seeded test data. No demo financial
records are created to satisfy this gate. The public production UI requires a Supabase
session; the e2e inspection mode is read-only and cannot prove real posting.
