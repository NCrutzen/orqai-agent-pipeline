/**
 * Phase 87 Plan 02 Task 3 — aggregateBaseline.
 *
 * Reads `stage_3_retro_runs WHERE run_id = $1`, groups by `new_top_intent`,
 * computes per-intent share, and INSERTs one closed_list row per distinct
 * intent into `intent_volume_baselines`. Then appends one proposal_cluster
 * row per `intent_proposal_clusters` matching the swarm + window. Returns
 * the actual insert counts for the closure summary.
 *
 * Pure (no Date.now, no random) — safe under Inngest replay.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AggregateBaselineArgs = {
  run_id: string;
  window_start: string;
  window_end: string;
  swarm_type: string;
};

export type AggregateBaselineResult = {
  closed_list_rows: number;
  proposal_rows: number;
};

type ClusterRow = {
  centroid_label: string;
  member_count: number;
};

type IntentVolumeBaselineRow = {
  swarm_type: string;
  window_start: string;
  window_end: string;
  intent_key: string;
  intent_source: "closed_list" | "proposal_cluster";
  count: number;
  share: number;
};

export async function aggregateBaseline(
  admin: Pick<SupabaseClient, "from">,
  args: AggregateBaselineArgs,
): Promise<AggregateBaselineResult> {
  // Phase A: fetch the per-email verdicts for this run and tally closed-list
  // counts in JS (supabase-js doesn't expose GROUP BY at the builder).
  const { data: retroRows, error: retroErr } = (await admin
    .from("stage_3_retro_runs")
    .select("new_top_intent")
    .eq("run_id", args.run_id)) as {
    data: Array<{ new_top_intent: string }> | null;
    error: unknown;
  };
  if (retroErr) throw retroErr as Error;
  const retro = retroRows ?? [];

  const tally = new Map<string, number>();
  for (const r of retro) {
    tally.set(r.new_top_intent, (tally.get(r.new_top_intent) ?? 0) + 1);
  }
  const total = retro.length;

  const closedListRows: IntentVolumeBaselineRow[] = Array.from(
    tally.entries(),
  ).map(([intent_key, count]) => ({
    swarm_type: args.swarm_type,
    window_start: args.window_start,
    window_end: args.window_end,
    intent_key,
    intent_source: "closed_list",
    count,
    share: total === 0 ? 0 : Number((count / total).toFixed(4)),
  }));

  // Phase B: proposal-cluster rows overlapping the window for this swarm.
  const { data: clusterRows, error: clusterErr } = (await admin
    .from("intent_proposal_clusters")
    .select("centroid_label, member_count")
    .eq("swarm_type", args.swarm_type)
    .gte("window_start", args.window_start)
    .lte("window_end", args.window_end)) as {
    data: ClusterRow[] | null;
    error: unknown;
  };
  if (clusterErr) throw clusterErr as Error;
  const clusters = clusterRows ?? [];

  const proposalRows: IntentVolumeBaselineRow[] = clusters.map((c) => ({
    swarm_type: args.swarm_type,
    window_start: args.window_start,
    window_end: args.window_end,
    intent_key: c.centroid_label,
    intent_source: "proposal_cluster",
    count: c.member_count,
    share:
      total === 0 ? 0 : Number((c.member_count / total).toFixed(4)),
  }));

  const allRows = [...closedListRows, ...proposalRows];
  if (allRows.length > 0) {
    const { error: insErr } = (await admin
      .from("intent_volume_baselines")
      .insert(allRows)) as { error: unknown };
    if (insErr) throw insErr as Error;
  }

  return {
    closed_list_rows: closedListRows.length,
    proposal_rows: proposalRows.length,
  };
}
