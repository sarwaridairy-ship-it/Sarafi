# SARAFI v7 role and capability matrix

Navigation is derived from effective capabilities and is not itself authorization. Every server path must independently check organization, branch, cashbox, amount, AAL/device state, and the named capability.

| Role | Daily financial entry | My Money | Hawala | Manage SARAFI | Security/billing |
| --- | --- | --- | --- | --- | --- |
| Owner | All permitted transaction families | Full organization and locations | Send, receive, payout, settle, manage partners | Full business, branch, cashbox, currency configuration | Full owner controls; high-risk changes require stronger verification |
| Business Administrator | Delegated operational posting; no owner-capital/ownership authority | Delegated operational scope | Delegated endpoints and workflows | Business operations, branches, cashboxes, currencies as granted | No ownership transfer or unrestricted billing authority |
| Manager | Branch-scoped posting and review within limits | Assigned branches/locations | Assigned branch send/receive/payout where granted | Operational branch settings only | No owner-only controls |
| Cashier | Assigned cashbox and transaction limits | Assigned cashbox summary only | Payout only when explicitly assigned and verified | None | Own device/session controls |
| Accountant | Accounting review, reconciliation, reports; posting only if explicitly granted | Book/current views as granted | Partner statements and settlement review | Accounting configuration as granted | No implicit user or billing administration |
| Compliance Officer | No ordinary posting by role alone | Evidence-focused view | KYC/screening/review evidence | Compliance configuration as granted | Security evidence, not ownership controls |
| Viewer | No mutation forms | Read-only permitted scope | Read-only permitted queue/detail | None | Own session only |
| Recipient partner worker | No unrelated financial entry | Assigned payout cashbox only | Exact recipient branch queue, identity capture, payout where granted | None | Own device/session controls |

Fail-closed requirements: unknown capability, missing membership, absent branch scope, stale unlock grant, missing identity evidence, missing rate context, or unavailable compliance authority must deny the mutation. No browser direct-table fallback may broaden access.
