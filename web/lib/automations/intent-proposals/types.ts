/**
 * Phase 86 — Open-set intent proposal surface (Plan 01).
 *
 * Pure TypeScript contracts consumed by:
 *   - Plan 02 cron (intent-proposals-refresh.ts) — produces ClusterRow[].
 *   - Plan 03 UI (Bulk Review "Intent proposals" tab) — reads ClusterRow[]
 *     and writes ViewEvent rows on tab open.
 *
 * No runtime imports — pure types. Any drift between these interfaces and the
 * Phase 86 migrations (intent_proposals_v1 view, intent_proposal_clusters
 * table, intent_proposal_views table) MUST be caught at type-check time by
 * the view-shape tests in __tests__/view-shape.test.ts.
 */

/**
 * One row of the `public.intent_proposals_v1` view.
 *
 * Column order matches the SQL projection in
 * supabase/migrations/20260520_phase86_intent_proposals_v1.sql so that
 * positional SELECTs in Plan 02 stay aligned.
 *
 * Note: first field is `pipeline_event_id` (NOT `coordinator_run_id`) — the
 * proposal sink is `pipeline_events.decision_details`, not coordinator_runs.
 * See the migration header for the source-of-truth correction.
 */
export interface ProposalRow {
  pipeline_event_id: string;       // pipeline_events.id (uuid)
  email_id: string | null;         // pipeline_events.email_id (uuid NULL)
  swarm_type: string;
  proposal_label: string;          // decision_details->>'intent_proposal' (never null per view WHERE)
  proposal_reason: string | null;  // decision_details->>'proposal_reason'
  intent_version: string | null;   // decision_details->>'intent_version' (e.g. '2026-05-19.v3')
  ranked_top_intent: string | null;// decision_details->'ranked'->0->>'intent'
  created_at: string;              // ISO timestamp
  subject: string | null;          // LEFT JOIN — null if emails row absent
  sender_email: string | null;     // LEFT JOIN — null if emails row absent
}

/**
 * One row of `public.intent_proposal_clusters` — a snapshot of clustering
 * output for a single (swarm_type, centroid_label, window_end) tuple.
 *
 * Produced by the Plan 02 cron after Levenshtein-grouping rows from
 * intent_proposals_v1. Consumed by the Plan 03 UI directly.
 */
export interface ClusterRow {
  id: string;
  swarm_type: string;
  centroid_label: string;            // canonical label for the cluster (typically the most-frequent member)
  member_count: number;
  member_labels: string[];           // distinct normalized labels in the cluster
  sample_email_ids: string[];        // 3-5 pipeline_event_ids (strings) for operator inspection
  window_start: string;              // ISO — cluster aggregates rows with created_at in [window_start, window_end)
  window_end: string;                // ISO
  refreshed_at: string;              // ISO — when the cron last UPSERTed this row
}

/**
 * One row of `public.intent_proposal_views` — telemetry for a single open of
 * the Bulk Review "Intent proposals" tab.
 *
 * Inserted by the Plan 03 server action; never updated. Volume <=50/month.
 */
export interface ViewEvent {
  swarm_type: string | null;
  operator_id: string | null;
  cluster_id: string | null;
  user_agent: string | null;
  viewed_at: string;                 // ISO — defaults to now() server-side
}
