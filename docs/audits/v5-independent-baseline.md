# SARAFI v5 independent baseline

Date: 2026-09-07 (Asia/Tehran)

Last local verification: 2026-09-08 (Asia/Tehran)

Scope: independent re-audit and forward correction requested by `SARAFI_Whole_Project_Independent_Reaudit_v5` and `SARAFI_Whole_Project_Correction_Command_v5`.

## Identity and release state

| Check | Result | Evidence |
| --- | --- | --- |
| Starting Git SHA | PASS | `c6435eb354fdf47a3726ba598f43103302e472bb` |
| Feature branch | PASS locally | `codex/whole-project-v5`; remote protection is not proven |
| Commit signature | FAIL | `git log -1 --show-signature --format=fuller` showed no cryptographic signature block |
| Git remote | PASS | `https://github.com/sarwaridairy-ship-it/Sarafi.git` |
| Vercel account/project | PASS | account `shafiullahsarwari40-pixel`; team `shafiullah-s-projects1`; project `sarafi`, `prj_K0cO23MJOgFXggnjM65dDrEuTMZ5` |
| Production alias | PASS | `https://sarafi-swart.vercel.app` |
| Active deployment | PASS | `dpl_A9uSTZhpe5xsED4NEbEM1osxepSU`; immutable URL `https://sarafi-342o8attc-shafiullah-s-projects1.vercel.app`; READY; created 2026-09-06 20:33:20 +03:30 |
| Production Git SHA | FAIL / unavailable | Vercel deployment metadata contains no Git SHA or source metadata; the active build cannot be tied to an exact commit |
| Supabase link | PARTIAL | linked ref `vbvwuqzqtcorassvotke`, region `ap-south-1`, Postgres 17, ACTIVE_HEALTHY. Dashboard project name is generic (`sarwaridairy-ship-it's Project`), so business-scope ownership still needs human confirmation |
| Remote migration parity | FAIL by design while frozen | Remote ends at `20260906014500`; pending local migrations are `20260906190754` and `20260907121336` |
| Backup/PITR/restore status | NOT PROVEN | Not exposed by the available CLI evidence; production migration remains frozen |
| Branch protection / required checks | NOT PROVEN | GitHub CLI is unavailable in this environment and no authenticated branch-protection evidence is attached |
| Latest protected CI | PARTIAL | Public branch run `34200072410`/job `101976597282` completed the Linux Chromium/Firefox/WebKit matrix with 300 passed and 24 skipped; that pre-split run failed only at the 500 KiB performance gate. Branch protection and required-check enforcement are still not proven |

## Reproducible commands

| Command | Result |
| --- | --- |
| `node --max-old-space-size=4096 node_modules\typescript\bin\tsc -b --pretty false` | PASS |
| `node_modules\.bin\oxlint.cmd --max-warnings=0 src` | PASS |
| `npm test` | PASS: 25 files passed, 1 skipped; 99 tests passed, 2 skipped |
| `npm run build` | PASS: route-level lazy loading reduced the initial application chunk to 484.81 kB (473.5 KiB); no Vite `>500 kB` warning |
| `npm run performance:step18` | PASS: initial application chunk 484,817 bytes, below the 500 KiB budget |
| `npm audit --audit-level=high` | PASS: 0 vulnerabilities |
| `python -c "... pglast.parse_sql(...)"` | PASS for `20260907121336_whole_project_integrity_v5.sql` |
| `npx supabase db lint --linked --level warning` | PASS: no schema errors in the currently deployed remote schema |
| `npx supabase migration list --linked` | PASS: identified exactly two pending migrations |
| `npx supabase db push --dry-run` | PASS/no write: would push only `20260906190754` and `20260907121336` |
| `npx playwright test tests/e2e/controls.spec.ts --project=chromium --grep "Exchange"` | Scenario results PASS after correction; Playwright/Vite teardown hangs after reporting cases, so process-level clean exit is not certified |
| Local in-app browser: Exchange with both AFN legs missing | PASS: Review disabled until both rates were supplied; derived cross was `0.936750998668`, `100 USD` produced `93.68 EUR`, review opened, and the console contained no warnings/errors |
| Local Firefox launch | ENVIRONMENT BLOCKED: Firefox cannot start a tab subprocess on this Windows host and fails before application code runs; CI retains the full browser matrix and now emits GitHub-native failure annotations |
| Clean local Supabase reset | BLOCKED | Docker/Podman is not installed; no isolated local database can be started |

## Baseline findings and correction disposition

| Gate | Baseline | Current correction state |
| --- | --- | --- |
| Hawala terminal payout integrity | FAIL | Implemented in forward migration: only payout RPC can produce `paid`; journal and receipt invariants required |
| Canonical Hawala partner/direction | FAIL | Implemented with review queue for ambiguous legacy rows; history is not rewritten silently |
| Partner statement settlement | FAIL | Implemented with payable/receivable lines, partial/full settlement, and net totals |
| One capability authority | FAIL | Implemented server-side with suspension first, membership/override expiry, scope, amount, MFA, device, plan and feature checks; inherited debt, rate and reversal role checks were explicitly replaced |
| Cashier debt direction | FAIL | Corrected: receivable create/collect defaults; payable create/pay denied unless explicitly granted. Legacy contradictory role checks were replaced |
| Role-specific dashboard reads | FAIL | Implemented server-side minimized read models; owner RPC execute removed from authenticated users |
| Private document reads | FAIL | Broad storage and attachment SELECT policies removed; manager/cashier/viewer have no default document capability; signed URL authorization is audited before signing |
| Non-FX foreign rates | FAIL | Shared in-form resolver and atomic optional publication added to money, opening, debt and Hawala commands |
| Cross-currency Exchange | FAIL | Both AFN legs are resolved, an implied cross is derived, deviations are compared in basis points, capability limits use server-resolved values, and cashier overrides use persisted approval drafts |
| Exact deep links | FAIL | Exact-ID RPCs added for transaction, debt and counterparty details |
| Error recovery | PARTIAL | Global error boundary and stable localized financial error mapping added; complete telemetry/support diagnostics remain open |

## Independent gates that remain open

These are release blockers, not implementation claims:

- Apply both pending migrations to an isolated database from zero and run deterministic accounting/RLS tests against real PostgreSQL.
- Create authenticated fixtures for owner, Business Administrator, manager, cashier, accountant, compliance officer and viewer; prove every capability and denial.
- Prove direct REST/storage denial for manager, cashier, viewer and suspended users.
- Confirm the linked Supabase project is the intended production business scope and attach auth, backup/PITR and restore-drill evidence.
- Attach a protected GitHub CI run, branch protection, signed release/tag, exact deployment SHA and protected production environment approval.
- Complete human Dari/Pashto review, A4 plus 58/80 mm physical print review, and timed 390 px cognitive-load tests.
- Resolve or formally accept the local Windows Playwright subprocess/teardown limitation; the remote Linux browser matrix exits cleanly.
- Continue modularizing the remaining application shell as a maintainability improvement. The enforced startup-bundle gate and Vite warning are resolved.

Until those gates have external evidence, the correct release status is **implementation complete for the addressed code paths, production certification withheld**.
