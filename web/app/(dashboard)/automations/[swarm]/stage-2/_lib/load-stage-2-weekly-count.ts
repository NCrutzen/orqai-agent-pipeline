// Phase 81-02 — Stage 2 placeholder count source.
//
// Returns the number of `debtor.email_labels` rows with
// `icontroller_tag_status = 'failed'` created in the last 7 days.
// Uses the supabase head-count pattern (`select(id, {count:'exact', head:true})`)
// so no row data is pulled — only the integer count.
//
// Anti-pattern (per 81-PATTERNS.md): do NOT derive the count by calling
// the row-by-row tagging-failure enrichment loader and taking its .size —
// that path pulls screenshot URLs and joined columns per row. This
// helper is the thin head-count sibling.
//
// Phase 77 will replace the Stage 2 placeholder surface with a real one;
// this helper is the bridge until then.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadStage2WeeklyCount(
  admin: SupabaseClient = createAdminClient(),
): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { count, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .select("id", { count: "exact", head: true })
    .eq("icontroller_tag_status", "failed")
    .gte("created_at", sevenDaysAgo.toISOString());

  if (error) {
    throw new Error(`loadStage2WeeklyCount: ${error.message}`);
  }
  return count ?? 0;
}
