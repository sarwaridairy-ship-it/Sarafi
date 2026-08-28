# Step 19: Import and Onboarding Evidence

The existing onboarding RPC creates the organization, enabled currencies, first branch,
and first cashbox on the server. The import core in `src/domain/imports.ts` provides
CSV templates and a dry-run preview for counterparties, opening balances, and debts.
It reports row-level validation errors, duplicate keys, and Decimal-based totals.

The preview is non-mutating. The local commit adapter now sends the exact reviewed batch
to the tenant-scoped `commit_import` RPC. Counterparties are created through the server,
while opening balances and debts delegate to authoritative accounting RPCs. The import
key is advisory-lock protected and idempotent. It must never write imported financial
rows directly from the browser. Migration `202608270019` is frozen until the remote
`202608270013`-`016` history gap is reconciled, so this commit path is implemented
locally but not yet live-applied.

Focused evidence:

```powershell
npm test -- src/domain/imports.test.ts
```

Remaining acceptance work is live deployment of the reviewed migration, post-commit
reconciliation evidence, reversal/compensation policy, support diagnostics, and
EN/Dari/Pashto help content validated by a real Saraf.