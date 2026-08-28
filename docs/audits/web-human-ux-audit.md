# SARAFI Web Human UX Audit

**Audit date:** 2026-08-28
**Production inspected:** https://sarafi-swart.vercel.app/
**Local verification:** production-mode Vite server and Chromium/Firefox/WebKit browser suites
**Production reinspection:** https://sarafi-swart.vercel.app/ after redeployment on 2026-08-28
**Scope:** anonymous entry, first-time learnability, language choice, responsive entry surface

## First-time user test

| Question | Production result | Evidence | Status |
|---|---|---|---|
| What is SARAFI? | The page showed only “Exchange OS” and “Secure access”; no product explanation. | Production screenshot captured during audit | FAIL, fixed locally |
| Who is it for? | Audience was not named. | Production page snapshot | FAIL, fixed locally |
| What problem does it solve? | No plain-language value or workflow explanation. | Production page snapshot | FAIL, fixed locally |
| What should I click first? | Only Sign in/Create account were visible, with no guidance. | Production page snapshot | CONFUSING, fixed locally |
| How would I record buying $1,000? | Impossible to infer before authentication. | Production page snapshot | CONFUSING, authenticated UX still requires verification |
| How would I find USD owned? | Impossible to infer before authentication. | Production page snapshot | CONFUSING, authenticated UX still requires verification |
| Which customer owes me? | Impossible to infer before authentication. | Production page snapshot | CONFUSING, authenticated UX still requires verification |

## Issue ledger

| ID | Area | Route/screen | Language | Viewport | Role | Severity | User question | Actual behavior | Why confusing | Expected behavior | Screenshot/evidence | Root cause | Proposed fix | Status | Verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UX-001 | Product explanation | `/` auth entry | English | Desktop | Visitor | HIGH | What is this? | Production opened directly to an unexplained auth form. | “Exchange OS” is technical and does not describe a Sarafi workflow. | Explain digital daftar, buying/selling, money location, debts, and shop control before sign-in. | Production screenshot from 2026-08-28 | AuthScreen had no public intro content. | Add localized public entry panel. | FIXED LOCALLY | Local production-mode browser snapshot |
| UX-002 | Language choice | `/` auth entry | EN/FA/PS | Desktop/mobile | Visitor | HIGH | Can I use my language? | Production had no language control. | A first-time Afghan user cannot choose Dari/Pashto before auth. | Explicit three-option selector before sign-in, persisted with RTL. | Production snapshot; local browser snapshot | Language state existed only inside authenticated shell. | Move direct language selector into AuthScreen. | FIXED LOCALLY | Local EN/FA/PS browser interaction |
| UX-003 | Localization leakage | `/` auth entry | Dari/Pashto | Desktop/mobile | Visitor | HIGH | What do these buttons mean? | Local intro translated, but auth labels/headings remained English. | Mixed language undermines trust and learnability. | Auth labels, errors, recovery, and actions translate together. | Local browser snapshot after language switch | AuthScreen retained hard-coded strings. | Add auth translation resources and use them in AuthScreen. | FIXED LOCALLY | Local i18n test and browser entry verification |
| UX-004 | Mobile entry layout | `/` auth entry | EN/FA/PS | 360/390/430 | Visitor | MEDIUM | Can I read and start on a phone? | Responsive public entry stacks intro and auth card without horizontal overflow. | The deployment had not previously been checked at target widths. | No horizontal overflow, readable intro, prominent first action. | Production browser viewport probe and Pashto screenshot on 2026-08-28 | Responsive CSS and direct language selector are deployed. | Keep viewport checks in release verification. | VERIFIED FOR PUBLIC ENTRY | Production probe: scroll width remained below viewport at 360, 390, 430, 768, and 1366px in Dari and Pashto |
| UX-005 | Authenticated information architecture | Protected workspace | EN/FA/PS | Desktop/mobile | Owner/cashier | HIGH | What do I do after sign-in? | Primary destinations are now Home, New transaction, My money, Customers & debts, and Transactions; advanced workspace areas are grouped under More. | The previous first-level module list made cashier actions compete with admin/reporting surfaces. | Group Home, New Transaction, My Money, Customers & Debts, Transactions, More. | Local Chromium/Firefox/WebKit browser evidence on 2026-08-28 | Existing internal section IDs and role filters are retained while the presentation is simplified. | Complete authenticated owner/cashier UAT on production. | VERIFIED IN INSPECTION MODE; UAT PENDING | 21/21 UX tests pass in Chromium, Firefox, and WebKit; authenticated production evidence pending |
| UX-006 | Human terminology | Protected workspace | Dari/Pashto | All | Owner/cashier | HIGH | What does this money status mean? | Core Buy/Sell amounts now identify the business perspective as “We give” and “We receive” in all launch languages, but other protected screens still contain hard-coded technical wording. | Technical language remains in ledger, reconciliation, counterparty, and infrastructure-facing messages. | Use Today, Check Cashbox, Customers & Sarafs, People owe us, We owe. | Source audit; local core-form update | Protected screens are only partially backed by translation keys. | Continue moving visible headings, empty states, errors, and statuses to the glossary-backed translation layer. | PARTIAL | Typecheck, lint, unit suite, and build pass; human language review pending |

## Evidence boundary

## Production deployment evidence

- Vercel deployment completed with `vercel deploy --prod --yes`.
- Deployment URL: `https://sarafi-f14h3wf7n-shafiullah-s-projects1.vercel.app`.
- Canonical alias: `https://sarafi-swart.vercel.app`.
- Production HTTP response: `200`; Vercel response identified bundle `/assets/index-DCpWpz2m.js`.
- Production browser reinspection: public EN, Dari, and Pashto entry verified; RTL and no-overflow checks passed at 360, 390, 430, 768, and 1366px.
- Deployment identity limitation: the deploy used the current dirty worktree. `HEAD` and `origin/main` are `62654ce`, but the deployed UX edits were not committed, so a single Git SHA cannot be claimed as the exact deployment source.

## Current local verification

- Public entry explanation and direct language selection: PASS in production-mode local browser.
- English, Afghan Dari, and Pashto entry copy: PASS technically; RTL direction updates correctly.
- 390px Pashto entry: PASS with no horizontal overflow in the inspected viewport.
- Auth labels and status copy: localized in source and covered by translation tests.
- Authenticated navigation: primary destinations are grouped in source and mobile navigation is available at 360-430px widths.
- Buy/Sell amount meaning: “We give” and “We receive” labels are localized in source.
- Core dashboard and trade-form terminology now uses translated keys for English, Dari, and Pashto, including My Money, Today, attention items, Fee, and the business-perspective amount fields.
- Translation regression: accessible Buy form fields switch from `We give`/`We receive` to Dari equivalents in the browser test.
- Chromium, Firefox, and WebKit UX suite: 21/21 tests passed per browser.
- Public accessibility suite: 2/2 tests passed per browser; authenticated accessibility remained intentionally skipped without a production auth fixture.

The language glossary files identify candidate terminology only. Human Afghan Dari and
Pashto approval remains open and must be completed by competent reviewers.

This audit is not a 100% completion certificate. Authenticated owner/cashier UAT,
full protected-screen terminology migration, provider backup/restore evidence, and
competent Dari/Pashto review remain required acceptance gates.

The production site was inspected after the 2026-08-28 redeployment for the public entry
surface. The subsequent translation repair is locally verified but not yet deployed:
both Vercel redeploy attempts failed with a provider `fetch failed` error, and production
continues to serve the prior bundle until a deployment succeeds.
