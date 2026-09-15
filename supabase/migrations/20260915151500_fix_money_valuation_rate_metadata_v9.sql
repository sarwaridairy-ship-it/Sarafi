-- Forward-only repair for the v9 valuation function deployed in
-- 20260915134012_exact_instruction_v9.sql. The lateral query calculated the
-- board/editor metadata but did not project it to the outer positions CTE.

do $migration$
declare
  function_definition text;
  incomplete_projection constant text :=
    'select candidate.rate, candidate.effective_at, candidate.source';
  complete_projection constant text :=
    'select candidate.rate, candidate.effective_at, candidate.source, candidate.board_name, candidate.changed_by, candidate.editor_name';
begin
  select pg_get_functiondef(
    'public.get_money_valuation_snapshot(uuid,date,text,jsonb)'::regprocedure
  )
  into function_definition;

  if function_definition is null then
    raise exception 'get_money_valuation_snapshot is not installed';
  end if;

  if position(complete_projection in function_definition) > 0 then
    return;
  end if;

  if position(incomplete_projection in function_definition) = 0 then
    raise exception 'unexpected get_money_valuation_snapshot definition; refusing an unsafe rewrite';
  end if;

  function_definition := replace(
    function_definition,
    incomplete_projection,
    complete_projection
  );

  execute function_definition;
end;
$migration$;
