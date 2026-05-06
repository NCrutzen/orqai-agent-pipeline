-- Phase 74 follow-up — add `fire-control` to swarms.entity_brand registry
-- so downstream Stage 2/3 brand-resolution (handler agents, register/dialect
-- lookup) can resolve it. Sister migration to
-- 20260507_phase74_labeling_settings_fire_control.sql which seeds the per-
-- mailbox row.
--
-- Idempotent: only appends if a row with code='fire-control' isn't already
-- present in the entity_brand array.
--
-- AFTER applying: run `npm run codegen` to refresh the literal-union TS type
-- in *.generated.ts (Phase 69 D-03 — build-time codegen, never hand-edit).
do $$
declare
  already_present boolean;
begin
  select exists (
    select 1
      from public.swarms s,
           jsonb_array_elements(s.entity_brand) elem
     where s.swarm_type = 'debtor-email'
       and elem->>'code' = 'fire-control'
  ) into already_present;

  if already_present then
    raise notice 'fire-control already present in swarms.entity_brand — skipping';
    return;
  end if;

  update public.swarms
     set entity_brand = entity_brand || jsonb_build_array(
       jsonb_build_object(
         'code',                'fire-control',
         'display_name',        'Fire Control',
         'register_language',   'nl',
         'register_dialect',    'nl-NL',
         'signoff_phrase',      'Met vriendelijke groet',
         'formal_address',      'u',
         'nxt_database_alias',  'fire-control',
         'icontroller_company', 'fire-control'
       )
     ),
       updated_at = now()
   where swarm_type = 'debtor-email';
end $$;
