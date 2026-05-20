-- Phase 86 D-02 — snapshot table for nightly-clustered intent proposals.
--
-- Cron handler (web/lib/inngest/functions/intent-proposals-refresh.ts, Plan 02)
-- reads the intent_proposals_v1 view, runs Levenshtein clustering server-side,
-- and UPSERTs rows here. UI (Plan 03) reads from this table directly so the
-- Bulk Review tab renders sub-50ms without re-clustering on every request.
--
-- Rationale (drift #2, plan-check locked): regular VIEW + snapshot-table is
-- preferred over true MATERIALIZED VIEW because (a) zero in-repo MV precedents,
-- (b) snapshot table supports proper RLS (matviews do not), (c) idempotent
-- UPSERT is simpler than REFRESH CONCURRENTLY lock dance.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intent_proposal_clusters (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swarm_type        text NOT NULL,
  centroid_label    text NOT NULL,
  member_count      int  NOT NULL,
  member_labels     text[] NOT NULL,
  sample_email_ids  text[] NOT NULL,    -- 3-5 pipeline_event_ids as strings
  window_start      timestamptz NOT NULL,
  window_end        timestamptz NOT NULL,
  refreshed_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one cluster per (swarm_type, centroid_label, window_end).
CREATE UNIQUE INDEX IF NOT EXISTS intent_proposal_clusters_uniq
  ON public.intent_proposal_clusters (swarm_type, centroid_label, window_end);

-- UI query: list clusters for a swarm by size desc.
CREATE INDEX IF NOT EXISTS intent_proposal_clusters_swarm_size_idx
  ON public.intent_proposal_clusters (swarm_type, member_count DESC, refreshed_at DESC);

-- Cron cleanup: DELETE rows older than 90 days.
CREATE INDEX IF NOT EXISTS intent_proposal_clusters_refreshed_idx
  ON public.intent_proposal_clusters (refreshed_at DESC);

ALTER TABLE public.intent_proposal_clusters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intent_proposal_clusters_service_all ON public.intent_proposal_clusters;
CREATE POLICY intent_proposal_clusters_service_all
  ON public.intent_proposal_clusters FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS intent_proposal_clusters_auth_select ON public.intent_proposal_clusters;
CREATE POLICY intent_proposal_clusters_auth_select
  ON public.intent_proposal_clusters FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.intent_proposal_clusters TO authenticated;
GRANT ALL    ON public.intent_proposal_clusters TO service_role;

COMMIT;
