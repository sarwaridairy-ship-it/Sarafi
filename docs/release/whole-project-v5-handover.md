# SARAFI whole-project v5 handover

Status: **production promotion frozen pending independent gates**.

Starting SHA: `c6435eb354fdf47a3726ba598f43103302e472bb`

Implementation branch: `codex/whole-project-v5`

The final commit SHA must be taken from `git rev-parse HEAD` after review; a commit cannot truthfully embed its own hash.

## Forward migrations

1. `20260906190754_calm_premium_capabilities.sql`
2. `20260907121336_whole_project_integrity_v5.sql`

Remote migration history currently stops at `20260906014500`. A dry run confirms only the two files above are pending.

Compatibility strategy:

- Both migrations are forward-only and primarily additive before replacing RPC implementations.
- Existing financial rows are preserved. Ambiguous Hawala history is marked `review_required` and placed in a review queue rather than rewritten.
- Old direct mutation entry points remain revoked from browser roles; compatible public RPC names are retained where possible.
- Approval drafts and one-time consumption fields are nullable for legacy rows and backfilled where safe.
- The document signing Edge Function must be deployed with the database migration; direct authenticated storage SELECT remains denied.

Rollback strategy:

- Do not apply a destructive down migration to financial history.
- Before promotion, take and verify a restorable database backup/PITR point.
- If the UI release fails, restore the prior immutable Vercel deployment while keeping the additive schema.
- If a new RPC is faulty, ship a forward corrective migration; do not drop evidence columns, journal links, receipts, audit events or review-queue rows.
- A database restore is reserved for catastrophic migration failure and requires reconciliation against any transactions accepted after the restore point.

## Production state captured before promotion

- Alias: `https://sarafi-swart.vercel.app`
- Active deployment: `dpl_A9uSTZhpe5xsED4NEbEM1osxepSU`
- Immutable URL: `https://sarafi-342o8attc-shafiullah-s-projects1.vercel.app`
- State: READY
- Deployment Git SHA: unavailable in Vercel metadata; this is a release blocker.

## Route → capability → server path

| Route | Capability | API / RPC |
| --- | --- | --- |
| `/transactions/new/fx/buy` | `financial.post.fx` | `postFxTrade` → `record_fx_trade_v5` |
| `/transactions/new/fx/sell` | `financial.post.fx` | `postFxTrade` → `record_fx_trade_v5` |
| `/transactions/new/fx/exchange` | `financial.post.fx` | two rate contexts → `record_fx_trade_v5`; override → approval draft/resume |
| `/transactions/new/money-in/customer` | `financial.post.money` | `recordOperation` → `record_operation` |
| `/transactions/new/money-in/income` | `financial.post.money` | `recordOperation` → `record_operation` |
| `/transactions/new/money-in/owner-capital` | `owner.capital.post` | `recordOperation` → `record_operation` |
| `/transactions/new/money-out/customer` | `financial.post.money` | `recordOperation` → `record_operation` |
| `/transactions/new/money-out/expense` | `financial.post.money` | `recordOperation` → `record_operation` |
| `/transactions/new/money-out/owner-withdrawal` | `owner.capital.post` | `recordOperation` → `record_operation` |
| `/transactions/new/move/{cashbox,branch,bank}` | `financial.post.money` | `recordOperation` → `record_operation` |
| `/transactions/new/debt/receivable` | `debt.create.receivable` | `recordDebt` → `record_debt` |
| `/transactions/new/debt/payable` | `debt.create.payable` | `recordDebt` → `record_debt` |
| `/debts/:id` | `debt.view` | `getDebtDetail` → `get_debt_detail_v5` |
| `/debts/:id/settle` | direction-specific debt settlement | `settleDebt` → `settle_debt` |
| `/transactions/new/hawala/send` | `hawala.send` | `recordHawalaSend` → `record_hawala_send` |
| `/transactions/new/hawala/incoming` | `hawala.incoming` | `recordHawalaIncoming` → `record_hawala_incoming` |
| `/transactions/new/hawala/payout` | `hawala.payout` | exact-code lookup → payout/approval/resume RPC |
| `/hawala/partners/:id/settle` | `hawala.settle` | statement RPC → `settle_hawala_partner` |
| `/transactions/:id` | `transactions.view` | `getTransactionDetail` → `get_transaction_detail` |
| `/customers/:id` | permitted customer/debt/Hawala/transaction read | `getCounterpartyDetail` → `get_counterparty_detail_v5` |

## Transaction → accounting effect

| Subtype | Authoritative command | Core journal effect |
| --- | --- | --- |
| Buy FX | `record_fx_trade_v5` | Credit AFN cash; debit purchased FX inventory; rate evidence on event |
| Sell FX | `record_fx_trade_v5` | Debit AFN cash; credit FX inventory at carrying cost; realize gain/loss |
| Exchange FX | `record_fx_trade_v5` | Credit sold FX inventory; debit bought FX inventory; validate both AFN legs and realize carrying-cost difference |
| Receive/pay income/expense/capital | `record_operation` | Money account against typed income/expense/equity/counterparty offset |
| Money transfer | `record_operation` | Debit destination money account; credit source money account |
| Create receivable | `record_debt` | Debit receivable; credit selected cash/money account |
| Create payable | `record_debt` | Debit selected cash/money account; credit payable |
| Collect receivable | `settle_debt` | Debit money; credit receivable |
| Pay payable | `settle_debt` | Debit payable; credit money |
| Outgoing Hawala | `record_hawala_send` | Direction-bound money/partner settlement and fee entries |
| Incoming Hawala | `record_hawala_incoming` | Partner receivable/payable evidence without beneficiary cash payout |
| Beneficiary payout | `pay_hawala_beneficiary` | Atomic cash deduction, payout journal, receipt, status and audit |
| Partner settlement | `settle_hawala_partner` | Settle selected payable/receivable statement line, partial or full |

## Hawala evidence

- `paid` is excluded from the generic transition RPC.
- A paid transfer requires direction `incoming`, workflow readiness, payout journal, payout receipt and payout timestamp.
- Exact reference lookup rejects ambiguous ready references.
- Beneficiary identity confirmation/reference, KYC state, assigned account, balance, device and approval are checked before posting.
- Partner identity is canonical through `hawala_partner_id`; ambiguous legacy records enter a review queue.
- Partner statements expose payable and receivable lines with remaining amount and net receivable totals.
- Settlement is bound to the selected statement-line ID and canonical partner ID.

## Rate and approval evidence

- One context RPC returns rate/group IDs, content-derived context ID, buy/sell values, age, expiry, basis-point tolerance, source, branch, stale/missing and approval requirement.
- Non-FX money, opening, debt and Hawala commands call the shared inline-rate preparation path.
- Optional publication and posting occur in one database transaction; a failed post rolls the rate change back.
- Exchange loads source sell and target buy AFN legs, derives the implied cross-rate and records both validated leg contexts.
- Capability/approval amount checks use the greatest client consideration and server-resolved leg valuation, preventing an understated client base value from lowering limits.
- Cashier deviations outside tolerance create an immutable server draft. The approver only decides; the requesting actor resumes and consumes the approval once.

## Verification completed locally

- SQL parser: PASS.
- TypeScript: PASS.
- Source lint: PASS.
- Unit/integration: 98 passed, 2 skipped.
- Production build: PASS; 520.89 kB main-chunk warning remains.
- Linked Supabase lint: PASS for currently deployed schema.
- Migration dry run: PASS/no write; exactly two pending migrations.
- Chromium Exchange behavior: all three focused cases reached PASS; runner teardown still hangs and was stopped after results.
- Local in-app browser Exchange check: PASS with both rate legs missing; Review remained blocked until both inline rates were supplied, the implied cross and receive amount were derived correctly, and no console warnings/errors were logged.

## Required evidence before production

See `docs/audits/v5-independent-baseline.md`. In particular: isolated full database reset, seven authenticated role fixtures, direct RLS/storage denial tests, backup/restore proof, protected CI and environment approval, exact deployment SHA, full clean E2E exit, human Dari/Pashto review and physical receipt/PDF sign-off.
