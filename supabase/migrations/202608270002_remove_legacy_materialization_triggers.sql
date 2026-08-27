-- Explicitly remove legacy materialization trigger names that may survive generic cleanup.
drop trigger if exists materialize_operation_after_post on public.journal_entries;
drop trigger if exists materialize_posted_receipt_after_entry on public.journal_entries;
drop trigger if exists materialize_fx_trade_fee_after_entry on public.journal_entries;
drop trigger if exists materialize_operation_after_journal_entry on public.journal_entries;
drop trigger if exists materialize_receipt_after_journal_entry on public.journal_entries;

create trigger materialize_operation_after_journal_entry
  after insert on public.journal_entries
  for each row execute function public.materialize_posted_operation_v2();

create trigger materialize_receipt_after_journal_entry
  after insert on public.journal_entries
  for each row execute function public.materialize_posted_receipt_v2();

create trigger materialize_fx_trade_fee_after_entry
  after insert on public.journal_entries
  for each row execute function public.materialize_fx_trade_fee();
