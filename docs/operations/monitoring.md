# SARAFI Monitoring and Alerting

## Signals to collect

- Web build/runtime errors with release identifier and correlation ID.
- Supabase RPC failures, rejected commands, idempotency conflicts, and slow queries.
- Realtime subscription failures and reconnect/refetch results.
- Offline draft storage failures and attempts to post while disconnected. Authoritative
	offline financial sync is retired; any replay attempt is a security incident signal.
- Authentication abuse, failed MFA, refresh-token revocation, and rate-limit events.
- Private document upload rejection/failure and compliance job failures.
- Backup/PITR health and restore-test results.

## Logging rules

Never log passwords, tokens, full identity-document numbers, full KYC payloads, or unnecessary transaction PII. Use organization-safe correlation IDs and journal/command IDs. Keep sensitive values in the database/provider audit path, not browser console output.

## Urgent alerts

Page the owner/security operator for repeated financial RPC failures, duplicate/idempotency anomalies, unexpected negative physical cash, cross-tenant policy failures, audit hash mismatch, backup failure, or suspected stolen-device activity.

## Response

1. Preserve logs and audit records.
2. Revoke affected sessions/devices.
3. Pause risky posting if financial truth is uncertain.
4. Reconcile from immutable journal lines.
5. Use a reversal or forward migration, never direct row edits.
6. Record incident scope, decision owner, and recovery evidence.
