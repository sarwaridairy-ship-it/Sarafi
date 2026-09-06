# SARAFI Premium Re-Audit Baseline

Date: 2026-09-04
Repository: sarwaridairy-ship-it/Sarafi
Branch: main
Starting SHA: 5a74a14 (Complete master production web controls)
Production target inspected: https://sarafi-swart.vercel.app/?public=1

## Evidence captured before edits

| Check | Result | Evidence |
| --- | --- | --- |
| Local dev server | PASS | Vite served `http://127.0.0.1:5173/` |
| Production HTTP | PASS | `sarafi-swart.vercel.app` returned HTTP 200 |
| Local browser render | PASS | Opening/auth page rendered with no error overlay or console errors |
| Production browser render | PASS | Opening/auth page rendered with no error overlay or console errors |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Unit tests | PASS | 71 passed, 2 skipped |
| Production build | PASS | `npm run build` |
| More removal | FAIL | `showMoreNavigation`, desktop and mobile More controls remain in `src/App.tsx` |
| URL routing | FAIL | `activeNav` remains the primary navigation authority |
| Opening handoff | FAIL | `OpeningExperience` redirects to `public/sarafi-opening.html` |
| Hawala completeness | FAIL | UI/API evidence is primarily outgoing `record_hawala_send` |
| Worker connection | PARTIAL | Invitation/team primitives exist; complete lobby/activation evidence is absent |
| Transaction detail routing | PARTIAL | Existing list/detail flow requires structural verification against the deep-scroll regression |
| Role-specific shells | PARTIAL | Role-dependent content exists, but the primary shell is shared |
| Local daily report | PARTIAL | Localized copy exists; required complete Hawala narrative and RTL render evidence are absent |
| Human Dari/Pashto review | BLOCKED | Requires competent local-language UAT outside automated checks |
| Live authenticated owner/cashier/Hawala UAT | BLOCKED | Requires approved test identities and live evidence |

## Current blockers

The PDF explicitly forbids a 100% or production-ready claim until live authenticated journeys, screenshots, ledger reconciliation, PDF/receipt rendering and human Afghan-language review are recorded. Those gates remain open at this baseline.

## Implementation order

1. Replace More and activeNav-only navigation with stable URL-backed routes and role-aware shells.
2. Make Make a Transaction and Hawala first-class, purpose-built workflows.
3. Complete owner/worker connection and Team & Access journeys.
4. Move transaction detail into a route-backed drawer/full-screen view.
5. Repair same-DOM opening/auth handoff and local report/document presentation.
6. Run full static, browser, security, responsive, RTL and production evidence gates.

## Implementation update

The first architecture pass has now been applied:

- Removed desktop/mobile More navigation and its stylesheet implementation.
- Added role-shaped five-destination navigation with no hidden overflow menu.
- Added URL-backed section paths, browser history synchronization and stable inspection deep links.
- Added a visible Make a Transaction center with role-aware operation categories.
- Changed transaction selection to a route-backed, in-viewport detail drawer/full-screen mobile detail.
- Removed the normal React redirect to the standalone opening page; the React opening gate now hands off to the real auth screen.
- Replaced stale E2E expectations that depended on More with direct route and no-overflow assertions.

These changes are not yet a final audit claim. Hawala incoming/payout/settlement, worker connection state screens, complete role shells, live authenticated evidence, screenshot matrices, PDF/receipt visual QA and human Dari/Pashto UAT still require completion and verification.

## Post-change verification

| Check | Result |
| --- | --- |
| Typecheck | PASS |
| Lint | PASS |
| Unit tests | PASS - 71 passed, 2 skipped |
| Production build | PASS |
| Chromium role/mobile matrix | PASS - 18/19 before the final viewer assertion update; the remaining assertion was corrected to match the role-specific five-item navigation |
| Manual local browser smoke | PASS - opening handoff, no More control, five-item mobile navigation, transaction-center categories, route-backed transaction drawer and no horizontal overflow |

## Release evidence (2026-09-05)

| Check | Result | Evidence |
| --- | --- | --- |
| Corrected Chromium role/mobile/localization matrix | PASS | 24/24 tests passed across Dari, Pashto, roles, 360/390/430px mobile, tablet and desktop |
| Native unit suite | PASS | 22 files passed, 71 tests passed, 2 skipped |
| Typecheck and lint | PASS | `npm run typecheck`; `npm run lint` |
| Production build | PASS | `npm run build`; Vite production bundle completed |
| Production deployment | PASS | Vercel deployment `dpl_HwCJpP9sRygza7w83S8QbUi1eUTm`, READY, aliased to `https://sarafi-swart.vercel.app` |
| Production HTTP availability | PASS | Production alias returned HTTP 200 during release inspection |
| Full PDF audit claim | BLOCKED | Live authenticated Hawala lifecycle, worker connection activation, ledger invariants, PDF/receipt visual QA and human Dari/Pashto UAT remain unverified |

## Follow-up implementation (2026-09-05)

- Added `transition_hawala_status` as a migration-backed, role-checked, row-locked lifecycle RPC with append-only status and security audit events.
- Added the client API wrapper and Hawala workflow controls for the next valid state.
- Applied migration `20260904210918_hawala_lifecycle_controls.sql` to the linked Supabase project; `supabase db lint --linked --fail-on error` reports no schema errors.
- Rebuilt and redeployed the frontend; latest READY deployment is `dpl_H4oRLCcnYgXVZnwzB5o2R4binVXk`, aliased to `https://sarafi-swart.vercel.app`.
- Re-ran typecheck, lint, unit tests, and production build successfully.

The overall PDF audit remains intentionally blocked until the authenticated, end-to-end workflows and human review gates are evidenced.

## v2 prompt review (2026-09-05)

The complete 37-page `SARAFI_Current_State_Reaudit_and_Corrected_Master_Prompt_v2 (1).pdf` was read. Its acceptance gates were compared with the current implementation. The actionable repository work completed in this pass is the role-aware navigation/control architecture, same-document opening/auth handoff, route-backed transaction detail, and production Hawala lifecycle status authority. The v2-specific requirements for incoming Hawala obligation creation, beneficiary code-verified payout, partner settlement accounting, worker-first connection requests, delegated `business_admin`, searchable embedded-font PDFs, and native-language human UAT remain explicitly open rather than represented by placeholders.

Latest frontend deployment: `dpl_ZfXFjEVD4v1EgzRojdZMqgw63iRu`, READY and aliased to `https://sarafi-swart.vercel.app`.

## Significant follow-up implementation (2026-09-05)

- Added `record_hawala_incoming`: records a balanced incoming Hawala obligation without paying cash.
- Added `pay_hawala_beneficiary`: validates `ready` status, money-account scope and available balance before posting payout and marking the transfer paid.
- Added `settle_hawala_partner`: validates the active partner, paid transfer and remaining settlement balance before posting a liability settlement without false income.
- Added visible Hawala tabs for Send, Incoming instruction, Pay beneficiary and Settle partner.
- Applied migrations `20260904231303_hawala_operating_journeys.sql` and `20260904231613_hawala_partner_settlement.sql` to the linked Supabase project.
- Linked Supabase schema lint: PASS with no schema errors.
- Focused Chromium role/mobile suite: PASS, 19/19.
- Vercel deployment `dpl_GS8kBrnQiwNLnzWBiurU4qcpBifR`: READY and aliased to `https://sarafi-swart.vercel.app`.

The remaining audit blockers are authenticated live journey evidence, worker-first connection/approval, delegated business administration, searchable embedded-font PDFs, and human Dari/Pashto plus physical-printer UAT.

## Latest workflow pass (2026-09-06)

- Read the complete supplied workflow-focused master prompt.
- Changed the primary FX form opened from `/transactions/new` to an in-page working surface that replaces the category grid; it is no longer a blocking dialog in the main transaction route.
- Preserved the existing secondary-launch behavior for compatibility while the primary route migrates.
- Added visible Send, Incoming, Pay beneficiary and Settle partner Hawala workflows backed by the production RPCs.
- TypeScript diagnostics compile: PASS; lint: PASS; Vite production build: PASS; unit tests: 71 passed, 2 skipped; focused browser tests: 19/19 passed.
- Latest production deployment `dpl_FEYE8a1XQ7AjMi47d7XGwAxhdM7i` is READY and aliased to `https://sarafi-swart.vercel.app`.

The definition of done is still not fully certified: rate resolution/override is not yet fully server-context-driven in the ordinary FX form, worker-first connection and delegated business-admin capabilities remain, daily PDFs remain rasterized, and authenticated/native-language/printer UAT has not been performed.
## Follow-up verification (2026-09-06)

- Added the delegated `business_admin` workspace role to the client role model, invitation role choices, membership constraint, and shared permission helper while preserving owner-only ownership semantics.
- Replaced the daily report canvas/JPEG export with a selectable vector-text PDF export path; the report preview remains available for print styling.
- `npx tsc -b --pretty false`, `npm run lint`, `npm test`, and `npx supabase db lint --linked` pass.
- `npx vite build` passes. The full Playwright run was started but stopped after existing route-model timeout failures in owner navigation/report and screenshot tests; authenticated tests remain skipped without provisioned credentials.
- Added `get_transaction_rate_context` plus a database trigger that rejects stale/mismatched buy and sell FX rates; focused browser acceptance remains 72/72 across Chromium, Firefox, and WebKit.

## Final superseding closure (2026-09-06)

The earlier blocker statements in this baseline are historical snapshots. Engineering-controlled workflow implementation and automated release verification are now closed in `docs/audits/final-premium-workflow-reaudit-20260906.md`.

- Current/missing/override/stale/cashier-approval rate journeys: PASS.
- Worker connection and delegated `business_admin`: PASS in UI, domain model, database and automated acceptance.
- Searchable localized vector-text PDF output with embedded fonts: PASS.
- Full browser matrix: 242 passed, 22 intentional environment/matrix skips, 0 failed.
- Controlled screenshots: 69, including every role in English/Dari/Pashto at desktop and 390px mobile.
- Live financial/security suites: PASS, including exact balance, idempotency and concurrency oracles.
- Production deployment `dpl_A9uSTZhpe5xsED4NEbEM1osxepSU`: READY and aliased to `https://sarafi-swart.vercel.app`.
- Production source commit: `1185fc94cbb0548835d92dc2a2b61ccdfb88cf77`.
- Direct nested production refresh: PASS after adding the `/app/:path*` SPA rewrite.

Human language/role UAT, legal/provider approval, physical printer acceptance and provider-managed restore evidence remain external and are not represented as software-complete.
