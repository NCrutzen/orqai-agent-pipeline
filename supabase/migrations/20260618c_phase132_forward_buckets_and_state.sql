-- Phase 132 Plan 02 Task 3 (D-03 / D-04, FWD-01) — forward-buckets seed + the
-- info_routing_forwards idempotency table.
--
-- NOTE on filename: the plan named this 20260617e_phase132_forward_buckets_and_state.sql,
-- but 20260617e is already taken by 20260617e_phase131_algemeen_no_forward.sql.
-- Renamed to 20260618c (next free suffix after 20260618b) to avoid a collision
-- and keep the lexical apply-order monotonic. Content is unchanged from the plan.
--
-- TWO logically-coupled changes for the Stage-4 forward loop:
--
-- (1) dry_run_config.stage_4_forward_buckets seed — adds the per-BUCKET forward
--     RELEASE map to info-routing, seeded EMPTY (`{}`) = everything HELD (D-04).
--     INVERSE polarity (isForwardBucketReleased: a bucket is live ONLY on an
--     explicit TRUE; empty map / missing entry → held / fail-closed). Releasing a
--     bucket later is a one-line jsonb UPDATE — no codegen (RESEARCH A2: this is a
--     jsonb-map gate, NOT a registry column). Uses the jsonb `||` merge (same
--     pattern as 20260615_phase117) so existing per-stage flags are PRESERVED,
--     never replaced.
--
-- (2) public.info_routing_forwards — the dedicated per-message forward
--     idempotency store (RESEARCH OQ-2). email_id PRIMARY KEY = the upsert
--     conflict target → D-02 no-double-forward on replay; the status mirror lets
--     Bulk Review surface forward status cheaply, and gives Phase 134 a clean
--     correction-event join. RLS mandatory (CLAUDE.md): service_role FOR ALL
--     (the worker writes/reads) + authenticated FOR SELECT (Bulk Review reads
--     forward status). NO anon policy.
--
-- NOTE: this migration is WRITTEN here but APPLIED in Plan 04 (its [BLOCKING]
-- apply task runs check:supabase + the live remote apply). Do NOT apply from
-- Plan 02.

BEGIN;

-- ── (1) stage_4_forward_buckets seed (D-04 — all held) ───────────────────────
-- Empty map = every bucket HELD. jsonb `||` merge preserves existing flags
-- (stage_3_routing, stage_3_intent_label, …). Idempotent on re-apply: `{}` ||
-- merge into an already-present key is a no-op-equivalent (re-seeds empty).
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_4_forward_buckets', '{}'::jsonb),
       updated_at = now()
 WHERE swarm_type = 'info-routing';

-- ── (2) info_routing_forwards idempotency table ─────────────────────────────

-- 2a. Table. email_id PRIMARY KEY = upsert conflict target (one forward row per
--     source message) + the D-02 idempotency / no-double-forward guard.
CREATE TABLE IF NOT EXISTS public.info_routing_forwards (
  email_id        uuid PRIMARY KEY,
  swarm_type      text NOT NULL,
  status          text NOT NULL,
  draft_id        text,
  target_mailbox  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2b. Enable RLS — required (CLAUDE.md; advisor flags rls_disabled_in_public ERROR).
ALTER TABLE public.info_routing_forwards ENABLE ROW LEVEL SECURITY;

-- 2c. Service role (the forward worker via createAdminClient) gets full access.
DROP POLICY IF EXISTS info_routing_forwards_service_all ON public.info_routing_forwards;
CREATE POLICY info_routing_forwards_service_all
  ON public.info_routing_forwards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2d. Authenticated users — read-only. Bulk Review reads the forward status to
--     surface forwarded / held / skipped per row. SELECT only; no write.
DROP POLICY IF EXISTS info_routing_forwards_auth_select ON public.info_routing_forwards;
CREATE POLICY info_routing_forwards_auth_select
  ON public.info_routing_forwards
  FOR SELECT
  TO authenticated
  USING (true);

-- 2e. anon — intentionally NO policy. Anon stays fully denied under RLS.

COMMIT;
