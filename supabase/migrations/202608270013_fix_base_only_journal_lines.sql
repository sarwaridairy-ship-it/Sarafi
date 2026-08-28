-- Realized FX gain/loss lines may be base-currency-only postings.
alter table public.journal_lines drop constraint if exists journal_lines_check;
alter table public.journal_lines drop constraint if exists journal_lines_check1;
alter table public.journal_lines add constraint journal_lines_check check (
  (native_debit = 0 or native_credit = 0)
  and (base_debit = 0 or base_credit = 0)
  and native_debit + native_credit + base_debit + base_credit > 0
);
