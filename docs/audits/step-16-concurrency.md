# Step 16: Live Concurrency Evidence

Step 16 is executable only against an isolated staging organization with two active
cashier identities and known inventory. The authoritative path is the Supabase
`record_fx_trade` RPC; client retries are not used as a concurrency control.

## Database control

Migration `202608270017_step16_concurrency_hardening.sql` serializes updates to an
organization/currency inventory state with a transaction advisory lock and enforces
`quantity >= 0`. The existing command-level advisory lock and unique command receipt
constraint provide idempotent replay protection.

## Run

Configure `.env.security.local` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SARAFI_E2E_CASHIER_A_EMAIL`, `SARAFI_E2E_CASHIER_A_PASSWORD`,
`SARAFI_E2E_CASHIER_B_EMAIL`, `SARAFI_E2E_CASHIER_B_PASSWORD`, `BUSINESS_A_ID`,
`BRANCH_A1_ID`, and `CASHBOX_A1_ID`. Set `SARAFI_STEP16_SOLD_CURRENCY` and the
corresponding fixture inventory so the two sale amounts are meaningful. Then run:

The two cashier accounts must both be active members of `BUSINESS_A_ID` and scoped
to `CASHBOX_A1_ID`; a cashier from another tenant is an isolation fixture, not a
concurrency participant. Seed exactly `10000` units of the sold currency in the
isolated cashbox or configure a documented policy that permits negative inventory.
The runner requires exactly one successful post in the `$8k + $7k` race, so two
authorization failures cannot produce a false green result.

```powershell
npx supabase db lint --linked
npx supabase db push --linked --yes
npm run security:step16
```

The command starts two independent authenticated sessions and checks the concurrent
`$8k + $7k` inventory race, committed-command retry, same-key multi-device replay,
balanced journal totals, unique event/receipt keys, non-negative inventory, and one
economic effect per successful command. JSON evidence is written to
`test-results/step16/concurrency-report.json`; a failed gate exits non-zero.

## Status

PASS: The runner executed against isolated live fixtures on 2026-08-28 with 7 checks
passed and 0 failed. The retained report is [step-16-live-report-20260828.json](step-16-live-report-20260828.json).
Rerun the command after every relevant schema or posting change; migration lint or
source inspection alone is not evidence of a pass.