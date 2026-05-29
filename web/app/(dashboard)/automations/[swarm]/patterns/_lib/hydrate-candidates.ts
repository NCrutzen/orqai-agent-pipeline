// Phase 4 Plan 02 Task 1 — server-side hydration for the Patterns listing.
//
// Reads public.promotion_candidates (Plan 01 emit target) for one swarm.
// Pure read; no Stage 1 / Stage 3 registry coupling — Plan 02's UI surfaces
// only what Plan 01's cron has already clustered + rendered into
// proposed_change.display_signature.

import { createAdminClient } from "@/lib/supabase/admin";
import type { PromotionCandidateRow } from "@/lib/promotion-recommender/types";

/**
 * SELECT * FROM public.promotion_candidates
 * WHERE swarm_type = $1
 * ORDER BY stage ASC, expected_savings_cents_per_month DESC NULLS LAST
 *
 * NULLS LAST keeps non-deterministic-kind rows (AI tuning / new topic / draft
 * style — expected_savings_cents_per_month IS NULL by P4-D-05) below the
 * deterministic kinds within each stage. Plan 02 UI groups by stage, so the
 * order primarily controls intra-stage ordering.
 */
export async function hydrateCandidatesForSwarm(
  swarm_type: string,
): Promise<PromotionCandidateRow[]> {
  const supa = createAdminClient();
  const { data, error } = await supa
    .from("promotion_candidates")
    .select("*")
    .eq("swarm_type", swarm_type)
    .order("stage", { ascending: true })
    .order("expected_savings_cents_per_month", {
      ascending: false,
      nullsFirst: false,
    });
  if (error) throw error;
  return (data ?? []) as PromotionCandidateRow[];
}
