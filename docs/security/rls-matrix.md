# RLS Matrix

| Surface | Member read | Client write |
| --- | --- | --- |
| Organizations, branches, cashboxes | Same organization | Server command only |
| Memberships | Self/member-scoped | Owner server command |
| Financial events, journal entries, lines | Same organization | Posting RPC only |
| Devices, approvals, security audit | Same organization | Dedicated security/approval RPCs |
| Currencies | Active global currencies | Migration/admin only |

RLS is defense in depth. Server functions still validate membership, role, branch, cashbox, device, and command authorization.
