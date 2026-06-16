/**
 * Debtor attachment backfill — Stage-1-survivor resolution (V9.5 baseline lever).
 *
 * The sales backfill (Phase 112) re-derives a disposition from the Phase 111
 * `stage_1_retro_runs` retro verdict because its corpus is OLD outlook mail that
 * was never live-classified. The debtor backfill corpus is the opposite: recent
 * `zapier-debtor-ingest` mail that ALREADY flowed through the live pipeline. Its
 * survivor signal is therefore already persisted — a mail that survived Stage 1
 * noise and reached Stage 2 customer-resolution has a `debtor.email_labels` row.
 *
 * So "survivor" here = "has an email_labels row". This is the exact population
 * the V9.5 resolution baseline cares about (attachment-derived identifiers can
 * only lift resolution for mail that actually reaches Stage 2). Mail with no
 * label row was filtered as noise upstream and is skipped by the backfill.
 *
 * The read is chunked to stay under the PostgREST IN/header cap (mirrors the
 * sales resolve-verdicts 150-id chunk that hit UND_ERR_HEADERS_OVERFLOW at 500).
 * Pure relative to its inputs except the DB read — safe under Inngest replay when
 * called inside a step.run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Return the subset of `emailIds` that have a debtor.email_labels row (i.e.
 * survived Stage 1 and reached Stage 2). Absent ids are noise → not returned.
 */
export async function resolveSurvivors(
  admin: SupabaseClient,
  emailIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (emailIds.length === 0) return out;

  // 150, not 500: a 500-uuid .in() builds a ~19.6KB URL that PostgREST/undici
  // rejects with UND_ERR_HEADERS_OVERFLOW (>16KB) — same cap the sales
  // resolve-verdicts read hit live (2026-06-04). 150 ids ≈ 5.9KB.
  const CHUNK = 150;
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const slice = emailIds.slice(i, i + CHUNK);
    const { data, error } = (await admin
      .schema("debtor")
      .from("email_labels")
      .select("email_id")
      .in("email_id", slice)) as {
      data: Array<{ email_id: string }> | null;
      error: unknown;
    };
    if (error) throw error as Error;
    for (const r of data ?? []) out.add(r.email_id);
  }
  return out;
}
