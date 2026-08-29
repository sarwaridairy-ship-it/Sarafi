# SARAFI Exchange OS

SARAFI is a production web operating system for Afghan Sarafi businesses. It combines daily cashier work, an authoritative multi-currency ledger, owner oversight, customer/debt records, cashbox reconciliation, reports, team controls, and a configurable compliance boundary in English, Afghanistan Dari, and Pashto.

Production web application: `https://sarafi-swart.vercel.app/`

## Product workspaces

- Buy, sell, and exchange currency with review-before-post and stable receipts
- Receive/pay money, cash transfers, expenses, income, owner capital, and bank movements
- Owner dashboard and “Where is my money?” location evidence
- Customers, Sarafs, statements, debts, settlements, and private identity documents
- Transaction history, correction requests, rates, reports, and thermal/A4 exports
- Branch cashboxes, opening money, counts, variances, reconciliation, and approvals
- Team memberships, devices, role controls, and approval inbox
- Settings, import, optional Hawala, and a fail-closed compliance control workspace
- Responsive English/Dari/Pashto interface with RTL and keyboard accessibility

Financial writes are authenticated Supabase RPCs. Money is represented with decimal-safe domain rules; tenant isolation is enforced with row-level security. The browser receives only public Supabase configuration—never a service-role credential.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and provide only the public Supabase URL and public/anon key. Never commit credentials.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run e2e
npm run build
npm audit --omit=dev
```

Authenticated security journeys are opt-in and use environment-provided test identities. See `docs/release/production-readiness.md` and `docs/audits/professional-web-completion-20260829.md` for the current evidence ledger and external acceptance gates.

## Release boundary

The professional web implementation and automated engineering checks are complete. Final release acceptance still requires authenticated human role UAT, qualified Dari/Pashto review, Afghan legal/compliance sign-off, an approved screening provider, and provider backup/restore evidence. Offline requirements are excluded from the current completion pass; signed native packages are a separate release artifact.
