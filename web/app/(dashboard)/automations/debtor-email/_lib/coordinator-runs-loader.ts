// Phase 65-05 (CORD-03 surface). Server-side loader joining coordinator_runs
// to a list of automation_run_ids. Bulk Review's page.tsx calls this once
// after loading the predicted-rows page; the resulting Map is threaded
// through PredictedRow → RowStrip → CoordinatorBadge.
//
// Phase 71 (LERN-*) will widen the surface to include the full ranked_intents
// array + override controls. Phase 65 ships only the three booleans needed
// for the partial_synthesis badge.

import { createAdminClient } from "@/lib/supabase/admin";

export interface CoordinatorRunSummary {
  escalation_decision: "single_shot" | "orchestrator";
  escalation_reason: string | null;
  partial_synthesis: boolean;
}

export async function loadCoordinatorRunsForReview(
  automationRunIds: string[],
): Promise<Map<string, CoordinatorRunSummary>> {
  const result = new Map<string, CoordinatorRunSummary>();
  if (automationRunIds.length === 0) return result;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coordinator_runs")
    .select(
      "automation_run_id, escalation_decision, escalation_reason, partial_synthesis",
    )
    .in("automation_run_id", automationRunIds);
  if (error) {
    throw new Error(
      `loadCoordinatorRunsForReview: ${
        (error as { message?: string }).message ?? "unknown supabase error"
      }`,
    );
  }

  type Row = {
    automation_run_id: string | null;
    escalation_decision: "single_shot" | "orchestrator";
    escalation_reason: string | null;
    partial_synthesis: boolean;
  };
  for (const r of (data ?? []) as Row[]) {
    if (!r.automation_run_id) continue;
    result.set(r.automation_run_id, {
      escalation_decision: r.escalation_decision,
      escalation_reason: r.escalation_reason,
      partial_synthesis: r.partial_synthesis,
    });
  }
  return result;
}
