-- Phase 74 follow-up — extend debtor.labeling_settings.entity CHECK to allow
-- 'fire-control'. The constraint hardcodes the 5 Benelux brands. Companion to
-- 20260507_phase74_entity_brand_fire_control.sql which appends fire-control
-- to the swarms.entity_brand registry. CHECK constraints can't reference a
-- dynamic registry, so we mirror the registry update here.
alter table debtor.labeling_settings
  drop constraint if exists labeling_settings_entity_check;

alter table debtor.labeling_settings
  add constraint labeling_settings_entity_check
  check (entity = any (array[
    'smeba'::text,
    'berki'::text,
    'sicli-noord'::text,
    'sicli-sud'::text,
    'smeba-fire'::text,
    'fire-control'::text
  ]));
