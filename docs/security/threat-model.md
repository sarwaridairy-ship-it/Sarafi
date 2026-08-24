# SARAFI Threat Model

## Protected assets

Tenant financial data, native-currency balances, KYC/customer data, employee identities, device registrations, audit history, and credentials.

## Baseline controls

- Row Level Security on every exposed tenant table.
- Authoritative roles in membership records/app metadata, never editable user metadata.
- No service-role key in a browser or mobile bundle.
- Explicit, time-limited, reason-coded support access.
- Immutable financial records and append-only audit events.
- Idempotency on every financial mutation.
- Encrypted backups with tested restore procedures.
- Private document storage with MIME/size limits and organization-scoped storage policies.
- Versioned compliance rules and human review before regulatory reporting.
- Hash-linked audit checkpoints as a tamper-evidence supplement.
- CSP, frame denial, content-type protection, and restrictive permissions headers.

## Open implementation gate

Official DAB and FinTRACA pages could not be fully retrieved during the 2026-08-25 review. Legal source review, cross-tenant tests, and production backup/restore drills remain required gates.
