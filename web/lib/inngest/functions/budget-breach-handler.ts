/**
 * Phase 64 BUDG-01 — Budget breach handler.
 *
 * Pitfall 1 mitigation: `retries: 0` — Inngest auto-retry MUST NOT trigger on
 * a breach (the budget guard already fired and any retry would re-spend the
 * same cost). Recovery path is the operator pressing "Retry" in the Kanban
 * UI on the human-review row this handler files.
 *
 * Wiring:
 *   trigger:  pipeline/budget_breached  (emitted by stage-0/safety-worker)
 *   step 1:   mark the originating automation_runs row failed
 *   step 2:   file a NEW automation_runs row with topic='budget_breach',
 *             status='pending', triggered_by='budget-breach-handler' so it
 *             surfaces in the Kanban human-review lane.
 *
 * D-13: breach is data, not exception. This handler never throws on a
 * "happy" breach — only on a Supabase write failure (Inngest will surface
 * that to the dev-server log and the run lands without retry).
 */

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

const STALE_CHANNEL = "debtor-email-review";

export const budgetBreachHandler = inngest.createFunction(
  { id: "stage-0/budget-breach-handler", retries: 0 },
  { event: "pipeline/budget_breached" },
  async ({ event, step }) => {
    const { automation_run_id, email_id, budget, reason } = event.data;

    const admin = createAdminClient();

    // Step 1 — mark originating run failed so the Kanban shows it as terminal.
    await step.run("mark-failed", async () => {
      const { error } = await admin
        .from("automation_runs")
        .update({
          status: "failed",
          error_message: `budget breach: ${reason}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", automation_run_id);
      if (error) {
        throw new Error(
          `automation_runs update failed: ${error.message}`,
        );
      }
    });

    // Step 2 — file the human-review Kanban row.
    await step.run("file-kanban-card", async () => {
      const { error } = await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "pending",
        swarm_type: "debtor-email",
        topic: "budget_breach",
        result: {
          source_automation_run_id: automation_run_id,
          email_id,
          budget,
          reason,
        },
        triggered_by: "budget-breach-handler",
      });
      if (error) {
        throw new Error(`automation_runs insert failed: ${error.message}`);
      }
    });

    await emitAutomationRunStale(admin, STALE_CHANNEL);

    return { ok: true, source_automation_run_id: automation_run_id };
  },
);
