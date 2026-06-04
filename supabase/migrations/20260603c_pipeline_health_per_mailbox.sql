-- Phase 110 Plan 04 (D-12). Per-mailbox dimension on pipeline_health_snapshots.
--
-- Today pipeline-health-monitor.ts writes one snapshot per swarm (the swarm
-- aggregate). VERIFY-01 needs per-mailbox visibility — specifically the
-- ~33/day verkoop@smeba.nl sales throughput. This adds a nullable text
-- source_mailbox dimension:
--
--   source_mailbox = NULL  → the existing swarm aggregate row (back-compat;
--                            every historical row keeps NULL).
--   source_mailbox = '<addr>' → a per-mailbox breakdown row written alongside
--                               the aggregate by the monitor (Task 2).
--
-- Uniform key is text source_mailbox (NOT int mailbox_id): sales
-- automation_runs.mailbox_id is null, so the monitor reads source_mailbox from
-- automation_runs.result JSONB. The composite index supports the per-mailbox
-- timeline read (latest snapshot per swarm+mailbox).
--
-- Only ALTERs an existing RLS-enabled table (public.pipeline_health_snapshots);
-- existing policies (service_role ALL + authenticated SELECT) cover the new
-- column. The column holds a mailbox ADDRESS only — no email body / PII content
-- (T-110-13). No new table, no new policy, no anon grant.

BEGIN;

ALTER TABLE public.pipeline_health_snapshots
  ADD COLUMN IF NOT EXISTS source_mailbox text;  -- nullable: null = swarm aggregate

CREATE INDEX IF NOT EXISTS pipeline_health_snapshots_swarm_mailbox_idx
  ON public.pipeline_health_snapshots (swarm_type, source_mailbox, checked_at DESC);

COMMIT;
