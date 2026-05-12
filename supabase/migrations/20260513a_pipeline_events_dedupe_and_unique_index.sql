-- Phase 82.2 — Stage 0 telemetry coverage fix (v8.0 stabilisation)
-- Plan 82.2-01 / TELE-COV-01, TELE-COV-03
--
-- Atomic dedupe + partial UNIQUE index on public.pipeline_events.
--
-- Background: pre-flight audit (Plan 82.2-01 Task 1) found 280 duplicate
-- (email_id, swarm_type, stage) groups — 380 extra rows, all historical,
-- all swarm_type='debtor-email'. Operator approved "dedupe all stages,
-- then full index" path on 2026-05-12.
--
-- Step 1: collapse each duplicate group to its earliest row (MIN(created_at),
--         tiebreak MIN(id::text)).
-- Step 2: create partial UNIQUE index that prevents recurrence.
-- Both steps run in one migration → atomic. If the index creation fails
-- (e.g. dedupe missed a group due to a concurrent write race), the dedupe
-- DELETEs roll back too.

BEGIN;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY email_id, swarm_type, stage
           ORDER BY created_at ASC, id::text ASC
         ) AS rn
  FROM public.pipeline_events
  WHERE email_id IS NOT NULL
)
DELETE FROM public.pipeline_events pe
USING ranked r
WHERE pe.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_events_one_per_stage_email
  ON public.pipeline_events (email_id, swarm_type, stage)
  WHERE email_id IS NOT NULL;

COMMIT;
