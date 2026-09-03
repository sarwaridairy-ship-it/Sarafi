-- The Hawala poster deliberately uses a standard receive-money ledger event and
-- links its journal entry to hawala_transfers. Match that durable relationship
-- instead of comparing the event enum with a value that does not exist.
do $$
declare
  function_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.get_named_financial_report(uuid,text,date,date)'::regprocedure)
  into function_definition;

  corrected_definition := replace(
    function_definition,
    'fe.event_type = ''hawala_send''',
    'exists (select 1 from public.hawala_transfers h where h.journal_entry_id = je.id)'
  );

  if corrected_definition = function_definition then
    raise exception 'Expected Hawala report predicate was not found';
  end if;

  execute corrected_definition;
end;
$$;
