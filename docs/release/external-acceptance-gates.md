# External Acceptance Gates

This document records release evidence that cannot be generated from source code alone.
The public inspection experience remains intentionally unauthenticated; the gates below
cover the protected backend and operational release process.

## Authenticated Security

Configure these variables only in the test runner secret store:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SARAFI_E2E_EMAIL`
- `SARAFI_E2E_PASSWORD`
- `SARAFI_E2E_ORGANIZATION_ID`

Run `npx playwright test --config=playwright.api.config.ts` and retain the
stage-specific report. These are authenticated API contracts, not UI click journeys.
Set `SARAFI_E2E_ROLE_FIXTURES` for all seven roles and `STEP15_CERTIFICATION=true`
so missing fixtures fail instead of silently skipping. Keep browser rendering and
authenticated API results separate; neither replaces live UI acceptance.

## Compliance Provider

An approved sanctions provider must be selected by the regulated business and legal or
compliance owner. Enable an organization feature in the form `sanctions_provider:<name>`
only after the provider contract, list version, screening retention, false-positive
workflow, and outage policy are approved. The database function
`require_sanctions_provider` intentionally fails closed until that feature exists.

## Backup and Restore

The Supabase project owner must record backup/PITR plan, retention, RPO, and RTO. Restore
a production-like backup into an isolated staging project, run `npx supabase migration
list`, `npx supabase db lint --linked`, `npm test`, and `npm run e2e`, then attach the
restore timestamp and result to the release record. Never restore production data into
local development or a shared test project.

## Monitoring

Configure a provider for browser errors, Supabase function failures, database health,
slow queries, failed financial commands, sync conflicts, realtime failures, storage
failures, and backup failures. Alerts must include an owner, severity, response target,
and runbook link. A deployed URL alone is not monitoring evidence.

## Mobile Release

The repository currently contains a web/PWA product and no native Android or iOS
project. Native delivery requires an approved Expo or native architecture, package IDs,
EAS or equivalent account, signing credentials, privacy disclosures, device testing,
and store accounts. Do not claim a signed build until an artifact has been installed and
tested against staging.

## Localization and UAT

Complete a screen-by-screen English, Afghan Dari, and Pashto review. Record reviewer,
date, terminology decisions, RTL result, mixed currency-number result, and unresolved
issues. A product owner, cashier, manager, accountant, and compliance reviewer must
execute the UAT guide and sign the production-readiness record.

## Current Status

Check the current commit's CI manifest and the
[16 September launch audit](launch-audit-20260916.md). Historical green tests do
not certify a later commit. The external gates remain open until their owners
provide evidence; this document must not be replaced with an unsupported
"complete" claim.
