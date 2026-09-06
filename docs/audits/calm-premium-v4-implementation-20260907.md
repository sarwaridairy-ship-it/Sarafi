# SARAFI Calm Premium v4 implementation audit

Date: 2026-09-07 (Asia/Kabul)

Branch: `codex/calm-premium-v4`

Working baseline: `36db05107d572ca3b8afbac23d95faa28adacf4b`

Audited production source: `1185fc94cbb0548835d92dc2a2b61ccdfb88cf77`

Existing production deployment: `dpl_A9uSTZhpe5xsED4NEbEM1osxepSU` at `https://sarafi-swart.vercel.app`

## Decision

**NO-SHIP as the completed premium release.** The automatable implementation is a tested release candidate, but the governing v4 brief expressly prohibits a completion, premium, production-ready, or 100% claim until real Saraf and Afghan Dari/Pashto UAT passes. The production database migration, authenticated Business Administrator acceptance, preview deployment, native-language sign-off, and exact-artifact production deployment remain intentionally unperformed.

No new production frontend or database release was made during this implementation audit.

## Implemented scope

- Added one typed client capability model and one database capability source, including role defaults, per-member overrides, branch/cashbox scopes, base/native/per-currency limits, and effective capability resolution.
- Moved financial authorization to `require_capability(...)` at RPC command boundaries and the immutable financial-event trigger. Business Administrator operational rights and owner-only exclusions now resolve from the same source. Accountant posting is denied at the first boundary.
- Added capability-aware navigation, direct-route guards, seven focused role homes, and useful fail-closed direct-route handling.
- Rebuilt transaction entry into six families with no more than four quick actions, direct full-page task routes, compact FX defaults with advanced controls behind **Change**, and direct Debt and Hawala journeys.
- Reorganized Team into People, Invitations, Join Requests, Devices, and Roles & Limits. Invitations use a three-step access flow with action overrides, scopes, amount limits, and MFA; independent join requests remain pending until reviewed.
- Reorganized Reports around four favorites, a grouped catalogue, contextual filters, and one export menu. Reorganized Manage SARAFI into four operating areas.
- Kept the mobile workspace at exactly five destinations and verified routine-task placement from 360 px through 1440 px.
- Retained English, Afghan Dari, and Pashto visual evidence and isolated mixed-direction amounts/codes.

## Route and capability contract

All paths below are rooted at `/app/{organizationId}`.

| Family | Direct paths | Required capability |
|---|---|---|
| Currency Exchange | `/transactions/new/fx/buy`, `/fx/sell`, `/fx/exchange` | `financial.post.fx` |
| Money In | `/transactions/new/money-in/customer`, `/money-in/debt-payment`, `/money-in/income` | `financial.post.money` or `financial.post.debt` |
| Owner Money In | `/transactions/new/money-in/owner-capital` | `owner.capital.post` |
| Money Out | `/transactions/new/money-out/customer`, `/money-out/debt-payment`, `/money-out/expense` | `financial.post.money` or `financial.post.debt` |
| Owner Money Out | `/transactions/new/money-out/owner-withdrawal` | `owner.capital.post` |
| Move Our Money | `/transactions/new/move/cashbox`, `/move/branch`, `/move/bank` | `financial.post.money` |
| Debt | `/transactions/new/debt/receivable`, `/debt/payable`, `/debts/settle` | `financial.post.debt` |
| Hawala | `/transactions/new/hawala/send`, `/hawala/incoming`, `/hawala/payout`, `/hawala/settlement` | `financial.post.hawala` |

## Default persona matrix

| Persona | Default operating authority | Explicit boundary |
|---|---|---|
| Owner | All workspace, financial, reporting, team, organization, security, billing, ownership, and owner-capital capabilities | None inside the organization; platform administration remains separate |
| Business Administrator | Operational posting, reports, reversals, reconciliation, approvals, team/capability administration, rates, accounts, organization, security, compliance, and import | No billing, ownership transfer, owner deletion, or owner-capital posting |
| Manager | Operational posting, reports, reversals, customers, reconciliation, approvals, and team visibility | No owner-only or organization/security administration |
| Accountant | Overview, reports, reconciliation submission, and team visibility | No financial posting capability by default |
| Cashier | FX, money, debt, and Hawala posting; customers; reconciliation submission; approval requests | Scoped by assigned branch/cashbox and configured limits |
| Compliance Officer | Overview, team visibility, and compliance review | No posting |
| Viewer | Overview and reports | Read-only |

Owner-only capabilities cannot be delegated. A delegated administrator cannot grant a capability they do not hold. Cashiers require active branch and cashbox assignments. Capability changes, invitations, and join reviews write security audit events.

## Database evidence and rollback

Migration: `supabase/migrations/20260906190754_calm_premium_capabilities.sql`

- Parsed successfully as 213 PostgreSQL statements with `pglast`.
- `supabase db push --dry-run` connected to the linked project and identified this as the only pending migration.
- The migration does not rewrite financial rows or alter prior migration history.
- Risk review found only intentional constraint/trigger replacement, privilege revocation/regrant, and scope-row replacement inside approved membership assignment.
- Rollback requires revoking and dropping the new capability/invitation/assignment/join RPCs, removing the added invitation/join columns, renaming the private command implementations back to their prior names, restoring the prior workspace-context function, and dropping the capability trigger/tables. Financial journal rows are untouched.

The migration is not applied to production because the release sequence requires human UAT and preview verification first.

## Automated verification

| Gate | Result |
|---|---|
| Lint | PASS, zero warnings |
| TypeScript project check | PASS |
| Unit/static capability suite | PASS: 24 files, 82 tests; 1 file and 2 environment-dependent tests skipped |
| Full Chromium E2E | PASS: 100 tests; 4 credential/environment-dependent tests skipped |
| Legacy controls regression | PASS: 44 tests; 1 retired offline-draft test skipped |
| Firefox + WebKit core acceptance | PASS: 82 tests; 4 credential/environment-dependent tests skipped |
| Objective Calm Premium v4 E2E | PASS: 16 active tests |
| Accessibility, localization, role UX, responsive matrix, and screenshot capture | PASS |
| Migration parse | PASS: 213 statements |
| Supabase remote migration status | PASS preflight; new migration correctly reported as pending |
| Production build | PASS: 405 modules transformed; Vite production bundle completed |

The credential-dependent live acceptance runner now requires an actual Business Administrator fixture and asserts both its delegated operations and owner-only denials. The current protected environment lacks only `SARAFI_E2E_BUSINESS_ADMIN_A_EMAIL` and `SARAFI_E2E_BUSINESS_ADMIN_A_PASSWORD`, so this suite was not misrepresented as executed.

## Retained evidence

- Task-path targets: [`artifacts/calm-premium-v4/task-paths.json`](../../artifacts/calm-premium-v4/task-paths.json)
- English desktop owner Home and 390 px transaction entry
- Afghan Dari desktop owner Home and 390 px transaction entry
- Pashto desktop owner Home, 360 px owner Home, and 390 px transaction entry
- Screenshot generator and cognitive assertions: `tests/e2e/screenshots.spec.ts` and `tests/e2e/calm-premium-v4.spec.ts`

The task-path file records targets, not observed human results. `human_results` remains `null` by design.

## Changed architecture

- New: `src/app/capabilities.ts`, `src/app/routes.ts`
- New: `src/features/home/RoleHome.tsx`, `src/features/transactions/TransactionCenter.tsx`, `src/features/manage/ManageSarafi.tsx`
- New: `src/styles/calm-premium.css`
- Updated: `src/App.tsx`, `src/lib/financialApi.ts`, acceptance/security script, and E2E suites
- New: capability migration, unit contract tests, objective cognitive-load E2E tests, task-path metrics, and retained screenshots

The old primary-flow transaction chooser and duplicated role-home structures were removed from `App.tsx`. Existing base styles remain for secondary and legacy operational surfaces; Calm Premium classes own the rebuilt primary Home, transaction, reports, management, and responsive surfaces.

## Human and external release gates

1. Provision real owner, Business Administrator, manager, accountant, cashier, compliance, viewer, and first-time-user participants in a safe preview environment.
2. Add the protected Business Administrator live fixture and run the authenticated capability/security suite after applying the migration to that preview database.
3. Record task success, time, errors, and confusion against the task-path targets.
4. Obtain Afghan Dari and Pashto terminology sign-off from native reviewers.
5. Verify physical receipt/print behavior where used.
6. Deploy a preview, rerun exact-artifact cross-browser acceptance, then apply the controlled migration and promote that exact artifact to production.
7. Record the new deployment ID, production source SHA, migration status, human results, and final ship decision.

Until those gates pass, the defensible claim is: **automated release candidate implemented and verified; final premium completion not yet proven.**
