-- Phase 83 hot-fix: Plan 83-06 D-09 telemetry writes
--   coordinator_runs.decision_details.input_size = { input_chars, truncated }
-- but Plan 83-01 never added the column. Without this migration the Stage 3
-- coordinator UPDATE at web/lib/inngest/functions/debtor-email-coordinator.ts:281
-- fails on every email and the verify-phase83 harness V3 check crashes.

alter table public.coordinator_runs
  add column if not exists decision_details jsonb;

comment on column public.coordinator_runs.decision_details
  is 'Phase 83 D-09: per-run structured telemetry; today carries input_size.{input_chars,truncated} from assembleInput.';
