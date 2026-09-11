# SARAFI whole-project v7 handover

Date: 2026-09-12 (Asia/Kabul)

Branch: `codex/whole-project-v7`

Starting SHA: `eceb0ea50f8a3506a1b28836e5b819a80eaa2ad1` (descends from v5 candidate `1e50c13fc72a632447e279d8f9071d318e4d00c8`).

Final SHA: record after the reviewed commit; a commit cannot truthfully contain its own hash.

Input evidence hashes:

- Both v7 re-audit Markdown copies: `1BC7FB287F70573585DB1A6FD8141A355F1AC0D2F64150032D92472E53CF30A8`.
- v7 correction command: `1A85A616F90A4DCC09F2C89243069D606EB073CA71E5BAEF9B21011D15EAB649`.

## Implemented scope

- Responsive shell modes: full sidebar at >=1200, 80 px rail at 960-1199, drawer below 960, and role-aware maximum-five bottom navigation below 700.
- Exactly six transaction families and one-task route forms.
- Compact one-side rate resolver with exact inverse display and transaction-only manual rates; the oversized explanation card and phrase `این نرخ چگونه حساب شده؟` are removed.
- Debt currency selection has no transaction FX resolver.
- Server-authoritative immutable My Money valuation snapshots with missing-rate exclusion.
- Exact-recipient Hawala endpoints, branch-scoped list/RLS/notifications, explicit state transitions, private two-sided Tazkira capture, and atomic payout-only Paid state.
- WebAuthn-ready app-lock model plus server-side scrypt PIN fallback and short-lived memory-only device grants.
- Responsive Business, Currencies & Rates, and Security surfaces plus locked-screen redaction.
- Confirmation is a real responsive dialog/bottom sheet with both actions visible above mobile navigation.

## Automated and visual evidence

The final local candidate checks were clean: lint passed; 140 unit/static contract tests passed with 2 environment-dependent skips; the production TypeScript/Vite build passed; and `git diff --check` passed. The public inspection browser suite recorded 331 passing and 65 skipped cases across Chromium, Firefox, and WebKit, with zero failures. The final Chromium regression was 121 passed and 11 skipped. Skips are retained—not counted as passes—and include authenticated linked-environment journeys and browser-specific deterministic artifact cases. The linked migration dry run succeeded and reported only the v7 migration pending. Interactive browser checks covered My Money, Buy FX normal/stale/confirmation, Hawala inbox/send/payout/identity, Rates for Sarai Shahzada and Khorasan, Business, Security, app lock, and Debt at desktop/tablet/mobile widths. Screenshot artifacts are under `artifacts/whole-project-v7/screenshots/` and `artifacts/whole-project-v7/e2e-screenshots/`.

Security design denials are encoded in v7 SQL and static contract tests: transaction-only rates do not publish; unrelated Hawala branch scopes do not match; generic status cannot produce Paid; payout requires both private identity documents; app-lock browser storage contains no PIN/grant persistence. These are implementation assertions, not a substitute for authenticated linked-database denial tests.

## Immutable preview

- Vercel deployment: `dpl_AeRiyHWSRzhnza8GxN1QaknQDRQ8`.
- URL: `https://sarafi-1str3ztmz-shafiullah-s-projects1.vercel.app`.
- Target/status: Preview / READY.
- Deployed source SHA metadata: `89149616e807588b85b5d1cfe40d876eb54d6de7`.
- Vercel remote build: successful.

The preview is protected by Vercel authentication. After the owner granted access, a remote browser smoke reached the deployed SARAFI application. The business sign-in and separate platform-administrator sign-in gates rendered correctly at a 639 px viewport, the document had no horizontal overflow, and the browser console reported no warnings or errors. No SARAFI account credentials were entered, so authenticated workspace behavior is not claimed by this smoke. Local inspection-mode browser evidence remains the workspace UI evidence.

## Production deployment

The owner explicitly requested production deployment after the preview and open release gates were reported.

- Supabase project: `vbvwuqzqtcorassvotke` (`ACTIVE_HEALTHY`).
- Database migration: `20260911195348_whole_project_v7_authority.sql` applied successfully; the follow-up dry run reports the remote database is up to date.
- Edge Function: `app-lock` version 1 is ACTIVE with JWT verification enabled; an unauthenticated probe returned HTTP 401.
- Vercel production deployment: `dpl_49cRmbxFi29egb5TSF9GhpDgYZL4` (`READY`).
- Production URL: `https://sarafi-swart.vercel.app`.
- Promoted frontend artifact source SHA: `89149616e807588b85b5d1cfe40d876eb54d6de7`.
- Migration compatibility correction SHA: `7153e5e9040654778497947fb8a7aee716f6206d`.
- Public production smoke: business and platform-administrator sign-in gates rendered in Pashto/RTL at 639 px with no horizontal overflow or browser console errors.
- Market API smoke: two markets returned, with 20 Sarai Shahzada rows and 5 Khorasan rows.
- Vercel production error scan immediately after deployment: no error logs found.

## Open assurance gates

Production is deployed, but the following assurance work remains open and must not be reported as passed:

1. A clean zero-to-latest Supabase reset and SQL lint.
2. Authenticated multi-tenant/branch RLS, storage, Edge Function, payout, accounting, approval, idempotency, and concurrency tests with no security skips.
3. Chromium, Firefox, and WebKit release CI with retained accessibility/performance/trace artifacts.
4. Provider backup/PITR evidence and a successful isolated restore/reconciliation drill.
5. Afghan Dari/Pashto human review and the documented multi-persona UAT threshold.
6. Physical receipt/PDF checks and legal retention/compliance approval.
7. A signed release tag, authenticated workspace smoke, and rollback rehearsal.

The rollback plan is the previous immutable frontend deployment `dpl_HC69FKWmi2W2MjPJJ63dc4rRrmtr` plus forward-only database correction; never delete financial evidence with a down migration.
