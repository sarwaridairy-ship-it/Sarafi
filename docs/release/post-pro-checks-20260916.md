# SARAFI post-Pro checks — 16 September 2026

Status: **HOLD public real-money release**. This continuation closes concrete
engineering checks, not the remaining recovery or human-acceptance gates.

## What changed

- Enabled included Pro leaked-password protection after the browser session was
  reconnected. A fresh independent security-advisor call confirms the warning
  is gone. No password, MFA setting, recovery setting or paid add-on was changed.
- Added a read-only recovery inventory and fail-closed evaluator with 19 tests.
  Missing/stale/malformed evidence is rejected. Active jobs, HTTP queues,
  outbound extensions, foreign servers or copied Vault secrets block physical
  cloning. Output never contains job commands, credentials or customer data.
- Corrected the recovery runbook: a copied scheduled job can run immediately;
  disabling it after restore is unsafe. A historical backup must be compared
  against a backup-time baseline, not today's production totals. Reconciliation
  is per organization, with global/Auth records and Storage checked separately.
- Restricted Vitest to the current checkout's source tree. The former `src`
  CLI filter also discovered an archived checkout under `tmp`, duplicating tests
  and producing two misleading CRLF-sensitive failures. No genuine source test
  was deleted, skipped or weakened. Vite's existing configuration is retained.
- Closed an exposed legacy `current_rate` SECURITY DEFINER helper. Its body had
  no tenant check, its authenticated EXECUTE grant bypassed the protected rate
  table, and neither application code nor another database function used it.
  A read-only two-business fixture regression failed before the fix and passes
  afterward. Migration `20260916193628_restrict_legacy_rate_helper.sql` revoked
  PUBLIC/anon/authenticated execution on production; the supported branch-guarded
  `get_current_rates_v6` API remains available. No financial records were changed.
  Added a persistent authenticated CI assertion for the exact permission denial.

## Fresh evidence

| Check | Result |
| --- | --- |
| TypeScript, lint and production build | Passed |
| Current-source unit suite | 188 passed, 2 existing skips; 37 files passed, 1 skipped |
| Live authenticated role/security API after legacy-rate fix | 10 passed, 0 skipped |
| Read-only two-business rate isolation regression | All 6 checks passed; 0 financial writes |
| Live named reports | All 22 report types returned valid responses |
| Public status and anonymous financial-report boundary | Public status available; anonymous financial report denied |
| Owner controls, reconciliation history and sensitive-feature MFA | Passed; cashier denied owner controls |
| Read-only journal audit | 226 posted journals; 0 missing/short/unbalanced line sets at the snapshot |
| Public-table RLS | 0 public tables without RLS |
| Candidate CI before these changes | `38a057e` PR workflow 35077567724 remains successful |

Authenticated mutation testing was confined to the disposable `SECURITY_TEST_`
business and its idempotency test. No real customer financial entry was rewritten.
New commit CI must be read separately; the older green workflow is not proof for
the changed revision. No fresh UI/browser certification is claimed here.

The source recovery inventory at 19:23:25 UTC contained one active scheduled job,
zero queued HTTP requests, zero foreign servers, the `pg_net` extension, two Vault
secrets and 24 Storage objects. The evaluator returned **BLOCKED**, as expected.
Zero queued HTTP requests does not make a scheduled future request safe.

The initial Supabase security advisor reported 152 warnings: 150 authenticated
SECURITY DEFINER functions, one anonymous function and leaked-password protection
off. After enabling protection, the fresh scan contains 151 function warnings;
the leaked-password warning is absent. No remaining warning was dismissed.
The anonymous `get_public_platform_status()` implementation has a fixed empty
search path and returns explicit active version/announcement fields. Its access
is intentional; the underlying protected tables were not exposed. All inspected
authenticated SECURITY DEFINER functions have fixed search paths. This is not a
complete authorization review of their bodies, call chains or every role pair.
The subsequent legacy-rate fix reduces authenticated executable definers from
150 to 149. The fresh advisor still reports function-exposure categories; these
remaining findings have not been blanket-suppressed or certified as safe.

## Still not done

- Function authorization review and further account hardening: existing sign-in
  tests do not certify all RPC call chains or the reauthentication flows. Secure
  password-change and current-password requirements were left unchanged pending
  flow verification. Any administrator password previously shared in a conversation
  must be changed privately by the owner; it was not changed or repeated here.
- Real isolated recovery: no new target was bought or overwritten. Physical
  cloning is unsafe with the current external job. A reviewed logical restore,
  approved private target/cost limit, separate object backup and measured exact
  recovery evidence are still needed. Sahibash is never a restore target.
- Independent review, signed release tag, protected promotion, qualified Afghan
  language review, physical-device/printer acceptance and accountable operational/
  legal approval remain open. No gate was weakened or approved on another person's
  behalf. The public alias was not promoted in this continuation.

## References

- [Supabase clone limitations](https://supabase.com/docs/guides/platform/clone-project)
- [Password-protection guidance](https://supabase.com/docs/guides/auth/password-security)
- [Vitest source discovery](https://vitest.dev/config/include)
- [Recovery procedure](../audits/step-17-recovery-drill.md)
