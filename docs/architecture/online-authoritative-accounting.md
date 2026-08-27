# Online-Authoritative Accounting

## Launch Decision

SARAFI is an online-authoritative accounting system. This is a deliberate launch architecture
choice, not a temporary defect or a deferred bug fix.

Financial integrity, trustworthy balances, owner control, and a simple cashier workflow are
more valuable at launch than disconnected financial posting. Full offline accounting creates
disproportionate risk around authorization freshness, conflict resolution, inventory, debt,
P&L, approvals, and audit history.

## Required Connectivity

A live authenticated server connection is required for every operation that changes accounting
state, including trades, receive/pay, debt settlement, expenses, transfers, bank/safe movement,
capital, commission, approval, reversal, correction, journals, balances, inventory, P&L, and
cashbox state.

Authoritative state comes from Supabase. A browser cache, IndexedDB row, local calculation, or
service-worker cache is never proof that money moved or that a receipt is final.

## Safe Degraded Mode

When disconnected, SARAFI may provide:

- cached application shell and translations;
- clearly marked stale, read-only workspace data;
- optional encrypted, identity-bound operation drafts.

Offline drafts use `draft_offline` or `legacy_review_required` and are visibly marked
`DRAFT - NOT POSTED`. They do not affect balances, inventory, P&L, debts, dashboard totals,
receipts, or audit posting. Reconnection never submits them automatically. A user must review
current server state while online and intentionally create a new authoritative post.

## Legacy Queue Upgrade

Older encrypted financial queue records are not replayed. On read they are surfaced as
`legacy_review_required` with the message that they were never posted. The information is
preserved as a review-only draft where it can be safely decoded, and no background sync,
service-worker action, or reconnect listener can submit it.

## Network Failure During Online Posting

Online financial mutations retain server-side idempotency keys. If a request commits but its
response is lost, retrying the same command ID produces one economic posting. The interface
must show `Posted` only after authoritative confirmation.

## Future Scope

Full offline financial posting may be reconsidered only when pilot customers demonstrate enough
value to justify the accounting, security, and operational complexity. It is outside the SARAFI
launch scope.
