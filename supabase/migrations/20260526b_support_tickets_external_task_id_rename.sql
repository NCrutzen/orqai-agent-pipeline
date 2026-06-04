-- ============================================================================
-- 20260526b_support_tickets_external_task_id_rename.sql
--
-- Phase 1 follow-up — rename support_tickets.clickup_task_id to external_task_id.
--
-- Architectural reason: per Phase 1 design discussion 2026-05-26, the external
-- task-tracker ID is the stable cross-stage entity handle (counterpart of
-- pipeline_events.email_id in the email-swarm world). The original column was
-- ClickUp-specific; the new generic name allows future swap-out to a different
-- tracker without another schema rename. The runtime contract: every support-
-- tickets submission arrives with an external_task_id created upstream (Zapier,
-- direct API, or a later automation — TBD) BEFORE hitting our ingest endpoint.
--
-- Scope: rename column only + update the swarms.ui_config jsonb to reference
-- the new column. No data migration needed (Phase 1 has zero rows in
-- support_tickets at apply time).
--
-- Idempotency: this migration is safe to re-apply. The rename uses a guarded
-- block; the ui_config jsonb update is unconditional but produces the same
-- result every time.
-- ============================================================================

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (A) Rename column clickup_task_id → external_task_id on public.support_tickets
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_tickets'
      AND column_name = 'clickup_task_id'
  ) THEN
    ALTER TABLE public.support_tickets
      RENAME COLUMN clickup_task_id TO external_task_id;
  END IF;
END
$$;

-- Add a comment to document the new generic semantic:
COMMENT ON COLUMN public.support_tickets.external_task_id IS
  'Stable cross-stage entity handle from the upstream task tracker (e.g. ClickUp). '
  'Equivalent of email_id for email swarms. Required on every new submission via '
  '/api/automations/support-tickets/ingest. Polymorphic per tracker — current '
  'implementation uses ClickUp task ids, future trackers can reuse this column.';

-- ───────────────────────────────────────────────────────────────────────────
-- (B) Update public.swarms.ui_config to reference external_task_id (was clickup_task_id)
--     Touch only the support-tickets row.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.swarms
SET ui_config = jsonb_set(
      jsonb_set(
        ui_config,
        '{row_columns}',
        (
          SELECT jsonb_agg(
            CASE
              WHEN col->>'key' = 'clickup_task_id'
                THEN jsonb_set(col, '{key}', '"external_task_id"')
                  || jsonb_build_object('label', 'External Task')
              ELSE col
            END
          )
          FROM jsonb_array_elements(ui_config->'row_columns') AS col
        )
      ),
      '{drawer_fields}',
      (
        SELECT jsonb_agg(
          CASE WHEN value::text = '"clickup_task_id"' THEN '"external_task_id"'::jsonb ELSE value END
        )
        FROM jsonb_array_elements(ui_config->'drawer_fields') AS value
      )
    ),
    updated_at = now()
WHERE swarm_type = 'support-tickets';

-- Rename status-mirror field if present (clickup_status was a separate column NOT renamed —
-- that one keeps ClickUp semantics because status sync is tracker-specific. Future trackers
-- would get their own status column / mapping layer.)

COMMIT;

-- ============================================================================
-- Post-apply verification (run separately):
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='support_tickets'
--    AND column_name IN ('clickup_task_id','external_task_id');
-- → must return exactly ONE row, with column_name='external_task_id'.
--
-- SELECT ui_config->'row_columns' FROM public.swarms WHERE swarm_type='support-tickets';
-- → row with key='external_task_id' must be present; no row with key='clickup_task_id'.
-- ============================================================================
