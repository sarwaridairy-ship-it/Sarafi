# Step 03: Live Buy / Sell / Exchange Evidence

Reviewed: 2026-08-26

## Implemented

- Buy, Sell, and Exchange are distinct primary actions in the web interface.
- FX forms collect currency pair, amount, rate preview, optional counterparty, fee, and note.
- Client-side previews use decimal arithmetic only for display.
- Posting sends a unique idempotency key and refreshes authoritative state only after success.
- Invalid amounts remain in the form and show an error; failed RPCs do not close the form or create local rows.
- Submit controls are disabled while a post is in flight.
- Database migration `202608240028_fx_trade_authority.sql` validates rate/amount consistency, counterparty scope, fee metadata, and materializes commission journal lines.
- Existing database constraints and RPCs enforce authenticated membership, active branch/cashbox, enabled currencies, inventory availability, and idempotency.
- Receipt materialization is enabled for posted journal entries.

## Executable Evidence

- Command validation tests cover malformed IDs, zero amounts, fees, rates, and fee currencies.
- Browser tests cover distinct Buy/Sell/Exchange forms, mobile rendering, RTL switching, and invalid amount behavior.
- Supabase migrations are synchronized through `028`.
- `npx supabase db lint --linked` passes with no schema errors.
- Typecheck, lint, unit tests, and production build pass.

## Remaining Gate

Authenticated Buy/Sell/Exchange posting, duplicate-click replay after a committed response,
stale-rate rejection against a configured rate board, inventory reconciliation with real
organization data, and reversal testing require an authenticated test organization and
live test credentials. The opt-in authenticated Playwright harness is available in
`tests/e2e/authenticated-security.spec.ts`; no credentials are stored in this repository.