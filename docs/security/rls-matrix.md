# SARAFI v5 authorization and RLS matrix

The database is authoritative. Client capability checks only hide or reveal controls; every protected RPC and row policy rechecks the active user through `has_capability`/`require_capability`.

## Default role bundle

`Allow` below means the default role bundle. A membership override may narrow or grant a non-owner capability for selected branches/cashboxes, limits and expiry. Owner-only capabilities cannot be delegated.

| Area | Owner | Business admin | Manager | Cashier | Accountant | Compliance | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Full owner dashboard | Allow | Deny; minimized delegated dashboard | Deny | Deny | Deny | Deny | Deny |
| Scoped operational dashboard | Allow | Allow | Allow | Own cashbox/activity | Accounting read model | Compliance read model | Scoped read model |
| FX post | Allow | Deny by default | Allow | Allow within scope/limits | Deny | Deny | Deny |
| Money operations | Allow | Deny by default | Allow | Allowed family only | Deny | Deny | Deny |
| Opening capital | Allow | Deny by default | Deny by default | Deny | Deny | Deny | Deny |
| Create receivable | Allow | Allow | Allow | Allow | Deny | Deny | Deny |
| Create payable | Allow | Allow | Allow | Deny | Deny | Deny | Deny |
| Collect receivable | Allow | Allow | Allow | Allow | Deny by default; may prepare/request adjustment | Deny | Deny |
| Pay payable | Allow | Allow | Allow | Deny | Deny by default; may prepare/request adjustment | Deny | Deny |
| Hawala send/incoming/payout | Allow | Allow | Allow | Allow within scope/limits | Deny | Review only | Deny |
| Hawala partner settlement | Allow | Allow | Allow | Deny | Deny by default | Review only | Deny |
| Rates manage | Allow | Allow | Allow | Deny | Deny | Deny | Deny |
| Approval request | Allow | Allow | Allow | Allow | Deny by default | Deny | Deny |
| Approval decision | Allow | Allow | Allow | Deny/self-denied | Deny | Deny | Deny |
| Document list/view/download | Allow | Explicit delegated bundle | **Deny by default** | **Deny by default** | Deny by default | Allow | **Deny by default** |
| Document upload/archive | Allow | Explicit delegated bundle | Deny by default | Deny | Deny | Allow | Deny |
| Ownership/billing/root deletion | Allow | Deny | Deny | Deny | Deny | Deny | Deny |

## Scope rules applied by `has_capability`

- Platform account must be active before any membership or role evaluation.
- Organization membership must be active.
- Membership capability override must be allowed and unexpired; an explicit deny wins over the role default.
- Owner-only capability definitions require role `owner` even if an override row is injected.
- Branch and cashbox must match the membership assignment or the narrower override arrays.
- Native, base and per-currency ceilings are checked from server-authoritative amounts.
- Active plan and optional feature flags are checked when the command requires them.
- A trusted, unrevoked, unexpired device and AAL2 are required when the capability limits demand them.

## Data-policy matrix

| Resource | Direct browser read | Direct browser mutation | Authorized path |
| --- | --- | --- | --- |
| `journal_entries` / financial events | Scoped RLS/capability | Denied | Financial command RPCs |
| `debts` | `debt.view` plus branch/direction minimization | Denied | `record_debt`, `settle_debt` |
| `hawala_transfers` | `hawala.view` with scoped/minimized flows | Denied | Direction-specific RPCs and exact payout lookup |
| `attachments` metadata | Document capability only | Upload metadata policy only; archive via RPC | Document APIs/RPCs |
| `storage.objects` in `sarafi-private-documents` | No broad authenticated SELECT | Capability-limited insert | Edge signing function after audited authorization |
| Approval drafts | Requester exact-ID RPC or approval inbox capability | Decision/resume RPC only | `request_*_approval`, `decide_approval`, one-time resume |

## Required live denial evidence

Static policy review is not release proof. The release run must execute authenticated direct REST/storage requests for manager, cashier, viewer and suspended identities, plus positive compliance/owner controls, and retain request/response evidence without customer data.
