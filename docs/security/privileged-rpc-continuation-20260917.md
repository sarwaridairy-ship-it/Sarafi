# Privileged RPC continuation review — 17 September 2026

## Scope

This review continued the release-readiness audit after the full CI workflow
returned green. It was deliberately read-only against the hosted database. No
financial record, access assignment, payment, production alias, or live schema
was changed.

## Hosted authorization evidence

- The `public` schema contains 229 `SECURITY DEFINER` functions.
- 144 are intentionally executable by `authenticated`; one read-only platform
  status function is executable by `anon`.
- A recursive static call-graph check found that 143 of the 144 authenticated
  entry points reach authenticated user/JWT context. The exception is
  `get_public_platform_status()`, which returns only active web-version and
  announcement data and is intentionally public.
- 141 authenticated entry points reach a named authorization guard. The two
  other private entry points are guarded directly:
  - `get_team_control_plane(uuid)` delegates to an internal implementation that
    requires an active owner, business administrator, or manager membership.
  - `mark_notification_state(uuid,text)` updates only a notification whose
    `recipient_user_id` equals `auth.uid()`.
- The live, non-writing seven-role boundary probe passed all 82 checks with
  zero financial writes and zero access changes.
- Browser roles cannot create objects in `public`, `auth`, or `extensions`.
  The remaining exposed functions with older non-empty pinned search paths use
  schema-qualified application objects. This materially limits search-path
  substitution risk; normalizing those definitions remains defense-in-depth
  work, not evidence of an active exploit.

## RLS information notices

Supabase reports 15 `rls_enabled_no_policy` information notices. All 15 tables
deny `SELECT`, `INSERT`, `UPDATE`, and `DELETE` to both `anon` and
`authenticated`. They are intentionally reached through guarded RPCs or a
service-role Edge Function. The notices therefore represent deny-all API
boundaries, not publicly readable tables.

The findings remain visible because the database linter reports design shape,
not application intent:

- [RLS enabled without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Anonymous `SECURITY DEFINER` execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated `SECURITY DEFINER` execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## Hardening prepared in this branch

Migration `20260917121432_restrict_legacy_financial_rpc_surface.sql` revokes
direct browser execution from five superseded financial implementations:

- `record_fx_trade(jsonb)`
- `request_fx_trade_approval(jsonb)`
- `record_hawala_incoming(jsonb)`
- `record_hawala_send(jsonb)`
- `record_hawala_send_v6(jsonb)`

The current guarded and versioned browser RPCs remain unchanged. The legacy
implementations remain callable by trusted server-side code and by their
`SECURITY DEFINER` wrappers. Five pgTAP assertions protect these boundaries.

## Verification

- Hosted privileged-RPC probe: 82/82 passed, no writes.
- Supabase linked migration dry-run: one expected migration, no remote change.
- Unit tests: 213 passed, 2 skipped; 38 files passed, 1 skipped.
- Lint: passed.
- Production build: passed.
- Local database replay was unavailable because Docker/Podman is not installed
  on this host. The branch CI migration-replay job is the required isolated
  execution proof before this migration may be applied.

## Release statement

This evidence improves the authorization posture but is not, by itself, a
100% public-launch approval. Production remains unchanged until the isolated
migration replay and the remaining human/external release gates are complete.
