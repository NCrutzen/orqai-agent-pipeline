/**
 * Phase 111 Plan 03 Task 2 — sales-email Stage-1 retro baseline aggregator.
 *
 * Reads `stage_1_retro_runs WHERE run_id = $1` and computes, per predicted
 * noise category, the calibration evidence Plan 04 consumes:
 *
 *   - hit_rate          — share of the corpus this category captured (count/total)
 *   - false_archive_rate — among rows this category WOULD archive, the share
 *                          flagged false_archive_suspect (a normalized-inbound
 *                          mail that the noise verdict would have archived).
 *                          The D-09 loopback enable/disable decision reads this.
 *
 * JS-side GROUP BY (supabase-js has no builder GROUP BY) — tally into Maps.
 * Pure (no clock reads, no randomness) — safe under Inngest replay.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AggregateBaselineArgs = {
  run_id: string;
  swarm_type: string;
};

export type CategoryBaselineRow = {
  predicted_category_key: string;
  count: number;
  hit_rate: number;
  would_archive_count: number;
  false_archive_count: number;
  false_archive_rate: number;
};

export type AggregateBaselineResult = {
  total: number;
  categories: CategoryBaselineRow[];
};

type RetroVerdictRow = {
  predicted_category_key: string;
  would_archive: boolean | null;
  false_archive_suspect: boolean | null;
};

type Tally = {
  count: number;
  would_archive: number;
  false_archive: number;
};

export async function aggregateBaseline(
  admin: Pick<SupabaseClient, "from">,
  args: AggregateBaselineArgs,
): Promise<AggregateBaselineResult> {
  const { data, error } = (await admin
    .from("stage_1_retro_runs")
    .select("predicted_category_key, would_archive, false_archive_suspect")
    .eq("run_id", args.run_id)) as {
    data: RetroVerdictRow[] | null;
    error: unknown;
  };
  if (error) throw error as Error;
  const rows = data ?? [];
  const total = rows.length;

  const tally = new Map<string, Tally>();
  for (const r of rows) {
    const key = r.predicted_category_key;
    const cur = tally.get(key) ?? { count: 0, would_archive: 0, false_archive: 0 };
    cur.count += 1;
    if (r.would_archive) cur.would_archive += 1;
    if (r.false_archive_suspect) cur.false_archive += 1;
    tally.set(key, cur);
  }

  const categories: CategoryBaselineRow[] = Array.from(tally.entries())
    .map(([predicted_category_key, t]) => ({
      predicted_category_key,
      count: t.count,
      hit_rate: total === 0 ? 0 : Number((t.count / total).toFixed(4)),
      would_archive_count: t.would_archive,
      false_archive_count: t.false_archive,
      false_archive_rate:
        t.would_archive === 0
          ? 0
          : Number((t.false_archive / t.would_archive).toFixed(4)),
    }))
    // Stable, deterministic ordering (replay-safe, diff-friendly).
    .sort((a, b) =>
      a.predicted_category_key < b.predicted_category_key
        ? -1
        : a.predicted_category_key > b.predicted_category_key
          ? 1
          : 0,
    );

  return { total, categories };
}
