# Migration Recovery Evidence: 2026-08-28

The supported command was checked with Supabase CLI `2.115.0`:

```powershell
supabase migration fetch --help
```

A disposable clone with the linked project metadata fetched the exact remote history
for project `vbvwuqzqtcorassvotke`. The recovered files were copied unchanged into the
working repository. No migration repair, reset, or production schema change was run.

| Version | Recovered file | SHA-256 |
|---|---|---|
| 202608270013 | `202608270013_fix_base_only_journal_lines.sql` | `8F78766E2138B22550EC472D98E30109E9BDAFCEF7EAB6C182F4E934BF6E9186` |
| 202608270014 | `202608270014_serialize_fx_inventory_mutations.sql` | `1F8FD4996699A8DEB5402AC27E65FE0A204AF98A1A8EFFCF8E7A7B8FE86B3E11` |
| 202608270015 | `202608270015_fix_reversal_race.sql` | `36EEE257505C06A01A8B6982C3E38F1E019DD06945E3873212A122230ABB2B1E` |
| 202608270016 | `202608270016_materialize_reversal_inventory.sql` | `90B9913943FCE6C710C1E541D856837EC7D89484D440E72CEF11980F4F7B1ADC` |

## Result

`supabase migration list --linked` now reports local and remote parity for every version
through `202608270016`. Local `202608270017`, `202608270018`, and
`202608270019` remain unapplied and intentionally frozen. The next action is a clean
local rebuild/schema comparison, not a blind production push.

`supabase db push --linked --dry-run` is the safe next check. A real local rebuild could
not be performed on this host because Docker Desktop/local Postgres is unavailable.
 
The live anonymous REST probe was attempted with a bounded 30-second timeout and the
Supabase REST endpoint did not respond. It is opt-in via `SARAFI_RUN_LIVE_TESTS=true`,
so ordinary CI cannot hang on provider/network health; explicit live security runs
remain required for certification.
