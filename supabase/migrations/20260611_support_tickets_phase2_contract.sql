-- Phase 2 Plan 02-01 Task 2 — CONTRACT-01 schema migration.
--
-- Adds the `systeem` column to `public.support_tickets` so that the Phase 2
-- ingest INSERT (CONTRACT-01 / D-04) can persist the system_key slug chosen
-- by the submitter in the software-ticket submit form.
--
-- What this migration does NOT change:
--   - No new table, no new RLS policy. `support_tickets` already has RLS
--     enabled (Phase 1 migration 20260526a_support_tickets_phase1.sql §D)
--     with service_role full access and authenticated SELECT policies.
--     A single column addition requires no new policy.
--   - No change to `external_task_id`. The column is already `text NULL` in
--     the DB (Phase 1 migration §C). The CONTRACT-02 change (making the Zod
--     field optional) is a schema-only fix, not a DDL change.
--
-- Trust: T-02-03 / T-02-04 (see Plan 02-01 threat model). Column is free-form
-- text; no injection sink (parameterized INSERT); existing RLS unchanged.

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS systeem text NULL;

COMMENT ON COLUMN public.support_tickets.systeem IS
  'Phase 2 (CONTRACT-01 / D-04) — system_key slug uit support_software_systems '
  'zoals gekozen door de gebruiker in het software-ticket-formulier. '
  'NULL voor tekst-only inzendingen of wanneer "mijn systeem staat er niet bij" gekozen wordt.';

COMMIT;
