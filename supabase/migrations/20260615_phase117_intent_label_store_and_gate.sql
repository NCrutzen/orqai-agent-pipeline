-- Phase 117 Plan 01 Task 3 (D-3 / D-4 / D-5) — intent-label store + dry-run gate seed.
--
-- TWO logically-coupled changes for the Outlook AI:-category write loop:
--
-- (1) public.swarm_written_categories — the per-message written-category store.
--     Records the last `AI:`-prefixed category the swarm-agnostic intent-label worker
--     (Plan 02) wrote per SOURCE message. Keyed by email_id (= email_pipeline.emails.id):
--       - email_id PRIMARY KEY is the upsert conflict target → idempotency / anti-churn
--         (D-4): a verdict change UPDATEs in place, never accumulates duplicate AI: rows.
--       - it is the join key Phase 112.5's swarm-behavior-sync.ts uses (it already maps
--         Graph source_id → email_pipeline.emails.id) to seed prevCategories from this
--         baseline and fire its dormant `category_edited` transition (D-5). This store is
--         the write-side half of that gap; Phase 112.5 builds the signal side.
--     RLS mandatory (CLAUDE.md): service_role FOR ALL (backend worker writes/reads) +
--     authenticated FOR SELECT (112.5 / Bulk Review read the baseline). NO anon policy.
--
-- (2) dry_run_config.stage_3_intent_label seed — adds the new D-3 gate key to BOTH
--     debtor-email AND sales-email, seeded GATED (true). The Outlook AI:-category write
--     is a no-op until an operator green-lights and flips the flag to false. Uses the
--     jsonb `||` merge (same pattern as 20260609c_phase113_stage3_routing_gate.sql) so
--     existing per-stage flags are preserved — NOT a full-object replace. Convention:
--     TRUE = gated/dry-run, FALSE = live, MISSING = fail-closed (gated) by the helper.
--
-- NOTE: this migration is WRITTEN here but APPLIED in Plan 02 (its [BLOCKING] apply
-- task runs check:supabase + the live remote apply). Do NOT apply it from Plan 01.

BEGIN;

-- ── (1) Written-category store ───────────────────────────────────────────────

-- 1a. Table. email_id PRIMARY KEY = upsert conflict target + one baseline row per
--     source message + the 112.5 source_id→email_id→baseline join key (D-5).
CREATE TABLE IF NOT EXISTS public.swarm_written_categories (
  email_id        uuid PRIMARY KEY,
  swarm_type      text NOT NULL,
  source_mailbox  text NOT NULL,
  ai_category     text NOT NULL,
  written_at      timestamptz NOT NULL DEFAULT now()
);

-- 1b. Enable RLS — required (CLAUDE.md; advisor flags rls_disabled_in_public ERROR).
ALTER TABLE public.swarm_written_categories ENABLE ROW LEVEL SECURITY;

-- 1c. Service role (backend worker via createAdminClient) gets full access.
DROP POLICY IF EXISTS swarm_written_categories_service_all ON public.swarm_written_categories;
CREATE POLICY swarm_written_categories_service_all
  ON public.swarm_written_categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 1d. Authenticated users — read-only. Phase 112.5 delta-sync + Bulk Review read the
--     written baseline to detect operator category edits. SELECT only; no write.
DROP POLICY IF EXISTS swarm_written_categories_auth_select ON public.swarm_written_categories;
CREATE POLICY swarm_written_categories_auth_select
  ON public.swarm_written_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- 1e. anon — intentionally NO policy. Anon stays fully denied under RLS.

-- ── (2) stage_3_intent_label dry-run gate seed (D-3) ─────────────────────────
-- Both swarms seeded GATED (true): the Outlook AI:-category write is held until an
-- operator flips the flag. jsonb `||` merge preserves the existing per-stage flags.

-- debtor-email: GATED (true) — dry-run until operator green-light.
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_3_intent_label', true),
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

-- sales-email: GATED (true) — respects the Sugar cut-over / Power Automate sweep
-- dependency before any write to verkoop@smeba.nl (same gate as 112.5 activation, D-3).
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_3_intent_label', true),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
