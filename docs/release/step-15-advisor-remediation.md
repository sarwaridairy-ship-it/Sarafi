# Step 15 Advisor Remediation

Reviewed: 2026-08-27
Project: `vbvwuqzqtcorassvotke`

## Classification

| Rule | Affected area | Classification | State | Verification |
|---|---|---|---|---|
| `anon_security_definer_function_executable` | Public SECURITY DEFINER RPC surface | CRITICAL/SECURITY RELEVANT | Remediated | `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public`; live anonymous RPC matrix denied |
| `function_search_path_mutable` | Four trigger functions | SECURITY RELEVANT | Remediated | `assert_posted_entry_balanced`, `prevent_posted_mutation`, `prevent_journal_line_mutation`, and `prevent_audit_mutation` now use `search_path = ''`; remote lint passes |
| `authenticated_security_definer_function_executable` | Client RPC boundary functions | SECURITY RELEVANT | Accepted with controls | Explicit authenticated allow-list, server-side `auth.uid`, membership, role, tenant, branch, cashbox, and input checks; direct live matrix passed |
| `auth_leaked_password_protection` | Supabase Auth password security | CONFIGURATION / EXTERNAL | Pending external configuration | Must be enabled in Supabase Auth password-security settings if supported by the project plan; no application workaround was used |
| `auth_rls_initplan` | Notifications, notification preferences, profiles policies | PERFORMANCE | Open optimization | Authorization semantics are unchanged; `auth.uid()` init-plan optimization should be scheduled separately and benchmarked |

## Function Review

All live SECURITY DEFINER functions were enumerated through the linked database catalog.
Trigger-only functions have no `anon` or `authenticated` EXECUTE grant. Client RPCs retain
only explicit `authenticated` grants. The `public` role no longer has EXECUTE on public
functions, so anonymous PostgREST callers cannot invoke SECURITY DEFINER functions.

Functions that legitimately cross RLS boundaries retain `SECURITY DEFINER` with
`search_path = public` and schema-qualified table references. Their authorization is
performed inside the function using `auth.uid()`, active membership, role, tenant, branch,
cashbox, or compliance checks as appropriate. Moving all such functions to a private
schema requires a broader API migration and was not performed blindly during this closure.

## Live Verification

- Supabase remote lint: passed, no schema errors.
- Public SECURITY DEFINER execution query: no anonymously executable SECURITY DEFINER
  functions remained after migration `202608270007`.
- Direct live security matrix after remediation: `66 passed`, `0 failed`, `0 unsupported`.
- Anonymous financial table and RPC access: denied.
- Cross-tenant reads, writes, and financial RPC attempts: denied.
- The exact advisor command returned a post-remediation report with 31 remaining warnings;
  these are the authenticated SECURITY DEFINER review items, the two RLS helper grants
  required for policy evaluation, leaked-password configuration, and performance init-plan
  items described above. The final post-helper-grant report contained 33 warnings and no
  advisor error-level finding.

## External Items

Supabase Auth leaked-password protection must be enabled by an authorized project owner in
the Auth password-security settings when the current plan supports it. Human security review
should confirm the accepted authenticated SECURITY DEFINER allow-list and the remaining
performance warnings before a production compliance sign-off.
