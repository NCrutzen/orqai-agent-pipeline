/**
 * Phase 112 Plan 01 Task 2 — resolve the Stage-1 disposition input per
 * candidate (D-05, RESEARCH A4/OQ-2).
 *
 * The backfill reuses the Phase 111 retro harness output: the latest
 * `stage_1_retro_runs` verdict (`predicted_category_key`, `confidence`) for each
 * email_id. Re-classifying ~850+ rows would re-incur LLM cost; reusing the
 * persisted verdict is deterministic and free. Candidates with no retro verdict
 * resolve to `unknown`/`low` → they route to Bulk Review (never auto-archived),
 * which is the safe fall-through.
 *
 * The read is chunked to stay under the PostgREST 1000-row IN cap (Pitfall 3).
 *
 * Pure relative to its inputs except the DB read — no clock/random; safe under
 * Inngest replay when called inside a step.run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetroConfidence } from "./disposition";

export type ResolvedVerdict = {
  predicted_category_key: string;
  confidence: RetroConfidence;
};

type RetroRunRow = {
  email_id: string;
  predicted_category_key: string | null;
  confidence: string | null;
  created_at?: string | null;
};

function coerceConfidence(c: string | null): RetroConfidence {
  return c === "high" || c === "medium" ? c : "low";
}

/**
 * Look up the most-recent retro verdict per email_id. Returns a Map keyed by
 * email_id; absent rows are simply not present (caller treats missing as a
 * queue-bound unknown).
 */
export async function resolveVerdicts(
  admin: Pick<SupabaseClient, "from">,
  emailIds: string[],
): Promise<Map<string, ResolvedVerdict>> {
  const out = new Map<string, ResolvedVerdict>();
  if (emailIds.length === 0) return out;

  const CHUNK = 500;
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const slice = emailIds.slice(i, i + CHUNK);
    const { data, error } = (await admin
      .from("stage_1_retro_runs")
      .select("email_id, predicted_category_key, confidence, created_at")
      .in("email_id", slice)
      .order("created_at", { ascending: false })) as {
      data: RetroRunRow[] | null;
      error: unknown;
    };
    if (error) throw error as Error;
    for (const r of data ?? []) {
      // First row per email_id wins (newest-first order above).
      if (out.has(r.email_id)) continue;
      out.set(r.email_id, {
        predicted_category_key: r.predicted_category_key ?? "unknown",
        confidence: coerceConfidence(r.confidence),
      });
    }
  }
  return out;
}
