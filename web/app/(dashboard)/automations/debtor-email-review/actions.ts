"use server";

// Phase 60-06 (D-16/D-17/D-29). The reviewer's verdict server-action does
// ONLY the synchronous write path:
//   1. flip automation_runs.status: predicted -> feedback (row leaves queue
//      via Phase 59 broadcast invalidation, D-17)
//   2. write public.agent_runs telemetry row (D-01)
//   3. fire the verdict-recorded Inngest event — the classifier-verdict-worker
//      Inngest function does the slow Outlook + downstream side-effects
//      async (D-16)
//   4. emit single broadcast for the queue-UI invalidation
//
// No inline side-effects. No reclassify-guard, no per-row chunking,
// no 5-minute server-action timeout. Returns instantly.

import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { inngest } from "@/lib/inngest/client";

export interface VerdictInput {
  automation_run_id: string;
  rule_key: string;
  decision: "approve" | "reject";
  message_id: string;
  source_mailbox: string;
  entity: string;
  predicted_category: string;
  override_category?: string;
}

export async function recordVerdict(input: VerdictInput): Promise<{ ok: true }> {
  const admin = createAdminClient();

  // 1. Flip predicted -> feedback. Row leaves queue on broadcast (D-17).
  const { error: updErr } = await admin
    .from("automation_runs")
    .update({
      status: "feedback",
      completed_at: new Date().toISOString(),
    })
    .eq("id", input.automation_run_id);
  if (updErr) {
    throw new Error(`automation_runs update failed: ${updErr.message}`);
  }

  // 2. Telemetry — public.agent_runs (D-01).
  const { data: ar, error: arErr } = await admin
    .from("agent_runs")
    .insert({
      swarm_type: "debtor-email",
      automation_run_id: input.automation_run_id,
      rule_key: input.rule_key,
      human_verdict: input.decision === "approve" ? "approved" : "rejected_other",
      corrected_category: input.override_category ?? null,
      context: {
        message_id: input.message_id,
        source_mailbox: input.source_mailbox,
        entity: input.entity,
        predicted_category: input.predicted_category,
      },
    })
    .select("id")
    .single();
  if (arErr || !ar) {
    throw new Error(`agent_runs insert failed: ${arErr?.message ?? "no row returned"}`);
  }

  // 3. Async side-effects (D-16/D-29). Worker handles Outlook categorize +
  //    archive + downstream cleanup with replay-safe step.run isolation.
  await inngest.send({
    name: "classifier/verdict.recorded",
    data: {
      automation_run_id: input.automation_run_id,
      agent_run_id: ar.id,
      swarm_type: "debtor-email",
      rule_key: input.rule_key,
      decision: input.decision,
      message_id: input.message_id,
      source_mailbox: input.source_mailbox,
      entity: input.entity,
      predicted_category: input.predicted_category,
      override_category: input.override_category,
    },
  });

  // 4. Broadcast invalidate so the queue-UI re-fetches and the row vanishes.
  await emitAutomationRunStale(admin, "debtor-email-review");

  return { ok: true };
}
