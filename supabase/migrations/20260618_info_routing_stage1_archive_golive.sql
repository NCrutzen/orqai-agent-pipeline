-- Operator-initiated go-live (2026-06-18): enable the Stage-1 archive side-effect
-- for the info-routing (info@smeba.nl) swarm.
--
-- CONTEXT: swarms.dry_run_config for info-routing held only {"stage_3_routing":true}.
-- The Stage-1 archive gate (web/lib/pipeline-gating/dry-run-gate/index.ts
-- isStageBlocked → `dry_run_config.stage_1_archive ?? true`) is FAIL-CLOSED: a
-- missing key means BLOCKED. So every recognized noise verdict
-- (marketing_newsletter, cold_sales_outreach, auto_dealer_spam, spam, ...) was
-- DB-labeled but NEVER moved out of the inbox (no Graph categorize+move calls),
-- and the archive-suppressed path also withheld classifier_rule_telemetry rows.
--
-- This flip (false = LIVE) makes high-confidence Stage-1 noise verdicts archive
-- out of the info@smeba.nl inbox going forward. Medium/low-confidence noise still
-- routes to classifier/screen.requires_review (held for review, no side effect),
-- so the false-positive surface stays bounded. Reversible: set back to true.
--
-- Idempotent: merges the single key into existing dry_run_config.

update public.swarms
set dry_run_config = coalesce(dry_run_config, '{}'::jsonb)
                     || jsonb_build_object('stage_1_archive', false),
    updated_at = now()
where swarm_type = 'info-routing';
