# SARAFI v7 Hawala destination and state model

## Exact destination

Every new network transfer records sender organization, sender branch, sender user, recipient type, recipient organization, recipient partner, recipient branch, and expiry. A free-text destination is display information, not routing authority.

A partner endpoint becomes routable only through `configure_hawala_partner_endpoint_v7`. External endpoints require a verified reciprocal partner mapping. Send and incoming commands reject unverified or incomplete endpoints.

`list_hawala_transfers_v7` returns a row only when the caller has `hawala.view` for the exact sender branch or exact recipient branch. Transfer and status-event RLS apply the same boundary. Notifications are generated for the exact organization, branch, and required capability.

## State machine

`draft -> sent -> acknowledged -> ready -> paid`

Terminal/exception states are `cancelled`, `expired`, and `review_required`.

- Sender scope may send a draft.
- Exact recipient scope may acknowledge or mark ready.
- Expired rows are derived from expiry for active states.
- `paid` is rejected by the generic transition RPC.
- Only the atomic payout command can create the cash deduction, posted journal, receipt, payout time, partner position, audit evidence, notification, and paid state.
- Legacy ambiguous rows remain `review_required` until a controlled reconciliation supplies a verified destination.

## Payout evidence

Payout lookup is exact-reference, exact-recipient-organization, ready-state, and non-expired. The command verifies branch/cashbox authority, beneficiary match, both private Tazkira document IDs, app-unlock/approval requirements, cash availability, idempotency, and receipt creation in one server transaction.
