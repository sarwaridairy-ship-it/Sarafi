# SARAFI v7 identity, app lock, and threat model

## Identity-document model

Hawala Tazkira evidence is stored in the existing private-document boundary using opaque object paths. Front and back are distinct attachment entity types. The browser validates file magic, size, and dimensions and redraws images through canvas to remove ordinary EXIF/location metadata before upload.

Direct browser `SELECT` on storage objects remains unavailable. Access must use the audited signed-document path and the exact document capability. Both document IDs must belong to the Hawala recipient organization and transfer before payout. Broad audit and notification payloads do not include the identity number or object path.

Retention duration and lawful deletion/hold rules still require owner/legal approval for the operating jurisdiction; code must not silently delete financial or identity evidence.

## App lock

The web implementation treats Face ID, Touch ID, fingerprint, device PIN, or another platform verifier as WebAuthn user verification selected by the operating system. SARAFI never receives biometric templates.

The passkey path is feature-gated. The six-digit fallback PIN is sent to the server function, hashed with memory-hard `scrypt`, rate-limited with lockout, and never written to localStorage or IndexedDB. Successful verification creates a short-lived, purpose- and device-bound grant whose token is kept only in memory; only its SHA-256 hash is retained server-side. Sensitive server commands validate organization, user, device, purpose, expiry, and revocation.

## Threats and controls

| Threat | Control | Residual gate |
| --- | --- | --- |
| A display swap changes financial meaning | Canonical server quote and immutable side/leg evidence | Authenticated accounting integration test |
| Client publishes an exceptional rate globally | Transaction publication scope; server context validation | Direct RPC denial test |
| Missing valuation becomes zero | Missing/stale exclusion and partial-snapshot warning | Linked SQL integration test |
| Hawala leaks to another branch | Exact sender/recipient fields, branch capability RPC and RLS | Two-tenant, two-branch denial test |
| Generic status marks transfer paid | Generic transition rejects `paid`; payout trigger requires journal/receipt/docs | Authenticated payout test |
| Public or broad Tazkira access | Private bucket, opaque path, audited signed access, recipient binding | Storage denial suite |
| PIN theft from browser storage | Server-only scrypt credential and in-memory grant | Edge Function integration/rate-limit test |
| Replay or duplicate money command | Server idempotency keys and atomic posting | Concurrency test |
| Locked screen leaks values | Lock layer replaces financial workspace | Authenticated visual/security test |
| Legacy Hawala routed by guessed text | Quarantine as `review_required` | Migration reconciliation review |
