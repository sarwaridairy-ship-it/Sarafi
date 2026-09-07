# SARAFI Calm Premium v4 AI-assisted proxy UAT

Date: 2026-09-07 (Asia/Kabul)

Tested code commit: `be39853eff2ad9e9d5f35e6a16fa744041889da0`

Environment: local Vite e2e build at `http://127.0.0.1:4175`, synthetic inspection data only

## Status and boundary

This is retained **AI-assisted proxy evidence**, not human UAT. It can verify routes, visible decisions, task-state behavior, timing under automation, role boundaries, responsive structure, and browser health. It cannot stand in for real Saraf owners/cashiers, first-time users, physical receipt checks, or native Afghan Dari/Pashto terminology approval. No rows in the human UAT workbook were populated from this run.

The release decision therefore remains **No ship** until the human and external gates in the protocol pass.

## Browser health

- The isolated workspace loaded with a non-empty page (`661` visible-text characters on the initial Owner Home probe).
- No Vite error overlay appeared.
- No browser console warnings or errors were captured after the role, transaction, Team, Manage, and Reports journeys.
- The production build continued to pass separately with 405 transformed modules.

## Seven-role Home proxy

Each Home rendered one primary action, exactly five role-specific navigation items, no more than four summary cards, no more than one attention item in the fixture, and no Home table/export/rate-strip controls.

| Role | Home heading | Primary action | Load (s) | Summary | Attention | Forbidden Home controls |
|---|---|---|---:|---:|---:|---:|
| Owner | Your exchange at a glance | Make a transaction | 17.804 cold | 4 | 1 | 0 |
| Business Administrator | Operations are under control | Make a transaction | 3.592 | 4 | 1 | 0 |
| Manager | Today’s branch work | Make a transaction | 2.716 | 4 | 1 | 0 |
| Cashier | Ready for the next customer | New transaction | 2.647 | 4 | 0 | 0 |
| Accountant | Review today’s books | Open daily summary | 0.375 | 4 | 0 | 0 |
| Compliance Officer | Compliance review queue | Open reviews | 0.286 | 3 | 1 | 0 |
| Viewer | Business overview | View activity | 0.318 | 3 | 0 | 0 |

These are automated browser timings, not human completion times. The slowest cold role load remained below 25 seconds.

## Task journeys

| Journey | Observed result | Proxy time |
|---|---|---:|
| Transaction entry | Exactly six families and four quick actions | — |
| Currency Exchange → Buy | Direct `/transactions/new/fx/buy` form; three family actions | 5.337 s |
| Cashier Buy amount → review | `100 USD` calculated `7,025.00 AFN`; advanced reason field absent; review explicitly showed the shop gives AFN and receives USD | 3.638 s from editable form |
| Debt → Settle a debt | Direct `/debts/settle`; three Debt actions | 8.375 s |
| Hawala → Pay beneficiary | Direct payout route; four Hawala actions; Reference code received focus | 9.559 s |
| Team access review | Five tabs; independent join request; Assign access; Allowed action types; Roles & Limits | 14.389 s |
| Manage + Reports | Four Manage cards; Daily Summary; four favorites; one Export menu; four grouped report sections | 2.184 s |

The inspection workspace is intentionally read-only. The Buy flow was exercised through confirmation review, but **Confirm and save** returned the expected non-persistence error. This run does not claim a successful authenticated database post.

## Fail-closed role checks

| Attempt | Result | Load (s) |
|---|---|---:|
| Accountant opens direct FX posting | Access not allowed; zero financial forms | 1.320 |
| Business Administrator opens Owner capital | Access not allowed; zero financial forms | 0.667 |
| Viewer opens direct FX posting | Access not allowed; zero financial forms | 1.599 |

## Defect found and corrected

The proxy run found that a reviewed Buy could leave its amount and review state in memory when the user returned through the sidebar and chose Sell. That could create shop-perspective confusion.

Commit `be39853eff2ad9e9d5f35e6a16fa744041889da0` now clears the FX draft, override state, busy/review state, and command ID whenever a new FX intent is opened. Switching Buy/Sell/Exchange tabs also uses the exact direct route. The added regression proves a reviewed Buy cannot seed a new Sell. Post-fix evidence:

- focused browser regression: `1 passed` with a clean exit;
- full objective file: all 17 test cases individually reported `ok` (the Windows runner lingered during web-server teardown and was stopped after the final green test);
- manual browser retest: Sell opened editable, with no amount and no review panel;
- TypeScript: pass;
- lint: pass;
- unit/static suite: 24 files and 84 tests passed; 1 file and 2 environment-dependent tests skipped;
- production build: pass, 405 modules transformed.

## Language evidence

The retained automated matrix covers English, Afghan Dari, and Pashto from 360 px through 1440 px, including owner Home and transaction entry screenshots. Mixed-direction amounts and codes remain isolated. A live UI-language-switch attempt in this proxy session was interrupted by the local browser permission service, so it is not recorded as an additional pass.

Automated rendering and translation presence do not prove natural financial wording. Native Dari and Pashto reviewers must still record final sign-off in the human UAT workbook.

## Remaining release gates

1. Apply the pending capability migration to a safe preview database.
2. Run authenticated live acceptance with the real role fixtures, including Business Administrator.
3. Conduct the required owner, cashier, manager, accountant, compliance, viewer, and first-time-user sessions.
4. Obtain native Afghan Dari and Pashto terminology sign-off.
5. Verify any physical receipt/print path in its real environment.
6. Deploy and verify a preview, then promote the exact tested artifact and migration under the release procedure.

Until those gates pass, the defensible result is: **the automatable release candidate, including proxy-tested role and task flows, is implemented and verified; final human acceptance and production release are not complete.**
