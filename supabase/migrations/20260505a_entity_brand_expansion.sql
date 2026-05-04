-- Phase 69 (CANO-02, D-01). Expand swarms.entity_brand from a flat jsonb-of-strings
-- (Phase 68 D-Discretion-3 seed) into per-brand metadata objects so Stage 4
-- handler agents have everything needed to render a register-correct reply
-- (signoff phrase, formal-address pronoun, register language + dialect, NXT
-- alias, iController company key) without prompt edits.
--
-- Idempotent: detects already-expanded shape via jsonb_typeof((entity_brand)->0)
-- and skips the rewrite. Migration runs forward-only; no rollback path is
-- provided because the new shape is a strict superset of the old (codes are
-- preserved as `code` field on each object).
--
-- Wave 1 of Phase 69 applies this via Supabase MCP under operator gate.
-- Wave 0 (this commit) only stages the migration file.

-- ---- 1. Extend swarms.entity_brand to jsonb of metadata objects -------------

-- Phase 68 already created entity_brand as jsonb (see 20260504b_swarms_registry_generalisation.sql:15).
-- The phase-68 seed populated it with a flat array of strings:
--   ["smeba", "smeba-fire", "sicli-noord", "sicli-sud", "berki"]
-- We rewrite to objects only when the first element is still a string scalar.

do $$
declare
  current_first_kind text;
begin
  select jsonb_typeof((entity_brand)->0)
    into current_first_kind
    from public.swarms
   where swarm_type = 'debtor-email';

  -- Already migrated (objects) → no-op for idempotency.
  if current_first_kind = 'object' then
    return;
  end if;

  update public.swarms
     set entity_brand = jsonb_build_array(
       jsonb_build_object(
         'code',                'smeba',
         'display_name',        'Smeba',
         'register_language',   'nl',
         'register_dialect',    'nl-NL',
         'signoff_phrase',      'Met vriendelijke groet',
         'formal_address',      'u',
         'nxt_database_alias',  'smeba',
         'icontroller_company', 'smeba'
       ),
       jsonb_build_object(
         'code',                'smeba-fire',
         'display_name',        'Smeba Fire',
         'register_language',   'nl',
         'register_dialect',    'nl-NL',
         'signoff_phrase',      'Met vriendelijke groet',
         'formal_address',      'u',
         'nxt_database_alias',  'smeba-fire',
         'icontroller_company', 'smeba-fire'
       ),
       jsonb_build_object(
         'code',                'sicli-noord',
         'display_name',        'Sicli Noord',
         'register_language',   'nl',
         'register_dialect',    'nl-BE',
         'signoff_phrase',      'Met vriendelijke groet',
         'formal_address',      'u',
         'nxt_database_alias',  'sicli-noord',
         'icontroller_company', 'sicli-noord'
       ),
       jsonb_build_object(
         'code',                'sicli-sud',
         'display_name',        'Sicli Sud',
         'register_language',   'fr',
         'register_dialect',    'fr-BE',
         'signoff_phrase',      'Cordialement',
         'formal_address',      'vous',
         'nxt_database_alias',  'sicli-sud',
         'icontroller_company', 'sicli-sud'
       ),
       jsonb_build_object(
         'code',                'berki',
         'display_name',        'Berki',
         'register_language',   'nl',
         'register_dialect',    'nl-NL',
         'signoff_phrase',      'Met vriendelijke groet',
         'formal_address',      'u',
         'nxt_database_alias',  'berki',
         'icontroller_company', 'berki'
       )
       -- Phase 69 A1 decision (operator, 2026-05-04): keep only the 5 Benelux
       -- brands live today. iccafe / iccafe-france deferred — they will be
       -- onboarded in a future phase via INSERT (CANO-04 zero-prompt-edit path).
     )
   where swarm_type = 'debtor-email';
end $$;

-- ---- 2. Lightweight shape sanity check (no constraint, just an assertion) ---
-- After migration, every element must be a jsonb object carrying a `code` key.
-- We surface this via a NOTICE rather than a CHECK constraint because
-- enforcement is the brand-register loader's job (it throws on unknown codes).

do $$
declare
  bad_count integer;
begin
  select count(*)
    into bad_count
    from public.swarms s,
         jsonb_array_elements(s.entity_brand) elem
   where s.swarm_type = 'debtor-email'
     and (jsonb_typeof(elem) <> 'object' or (elem->>'code') is null);

  if bad_count > 0 then
    raise exception 'entity_brand expansion left % malformed elements', bad_count;
  end if;
end $$;
