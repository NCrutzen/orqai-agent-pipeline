-- Phase 130 Plan 03 Task 1 — NOISE-03 measurement read-model.
--
-- Per-mailbox Stage-1 unknown-pool composition over public.pipeline_events
-- for the info-routing swarm. This is the *distribution half* of the
-- NOISE-03 before/after measurement: it reports, per mailbox proxy
-- (decision_details->>'entity' = 'smeba' | 'fire-control'), how the
-- Stage-1 decisions split (unknown vs the six new noise classes vs spam
-- vs payment_admittance), as raw counts (n) and a within-mailbox pct.
--
-- Baseline corpus: the existing ~1,185 info-routing Stage-1 pipeline_events
-- rows (~596 unknown + 375 spam + 26 payment_admittance in the sampled
-- window, 2026-06-16) ARE the baseline — there is NO data migration here.
-- The view simply reads them.
--
-- ⚠ NECESSARY-BUT-NOT-SUFFICIENT (RESEARCH Pitfall 5, NOISE-03 LOCKED):
-- distribution counts alone CANNOT prove success. A shrinking `unknown`
-- pool could mean the true-noise share dropped (the goal) OR that routable
-- mail got mis-archived into a noise class (a regression masquerading as
-- success). This view MUST be paired with the Task-3 per-mailbox
-- labelled-sample baseline (web/scripts/eval/info-unknown-pool-noise-baseline.ts),
-- which establishes a human-labelled true-noise fraction (with a Wilson CI)
-- on a sample, before AND after, per mailbox. The Plan-02 NOISE-04 carve-out
-- (hasActionableToken) is the upstream guard against that mis-archive.
--
-- Security (T-130-03-01): created `with (security_invoker = true)` so the
-- RLS of the CALLING role applies (pipeline_events is authenticated-select /
-- service_role-all per 20260506a:50-59) — NEVER a definer-rights view. A
-- definer-rights view on `public` is ERROR-gated by `npm run check:supabase`.
-- No new base table → no new RLS policy needed.
--
-- No fixed time window is baked in — callers (the Task-3 baseline script,
-- ad-hoc before/after queries) filter `created_at` themselves so each can
-- pick its own comparison range.
--
-- Idempotent: CREATE OR REPLACE VIEW is safe to re-run.

BEGIN;

CREATE OR REPLACE VIEW public.info_unknown_pool_composition
  WITH (security_invoker = true) AS
  SELECT
    decision_details->>'entity'                                          AS mailbox_entity,
    decision,
    count(*)                                                             AS n,
    round(
      100.0 * count(*)
        / sum(count(*)) OVER (PARTITION BY decision_details->>'entity'),
      1
    )                                                                    AS pct
  FROM public.pipeline_events
  WHERE swarm_type = 'info-routing'
    AND stage = 1
  GROUP BY decision_details->>'entity', decision;

COMMENT ON VIEW public.info_unknown_pool_composition IS
  'Phase 130 NOISE-03 measurement read-model. Per-mailbox (decision_details->>entity) '
  'Stage-1 decision composition for swarm_type=info-routing: n + within-mailbox pct. '
  'security_invoker=true (caller RLS). No time window baked in (callers filter created_at). '
  'Distribution counts are necessary-but-not-sufficient (Pitfall 5) — pair with the '
  'labelled-sample baseline (info-unknown-pool-noise-baseline.ts) for the true-noise fraction.';

COMMIT;
