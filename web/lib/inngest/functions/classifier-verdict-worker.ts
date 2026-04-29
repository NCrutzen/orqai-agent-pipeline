// Phase 60-06 (D-16/D-29). Event-triggered worker for the
// classifier/verdict.recorded event fired by recordVerdict (the bulk-review
// server action). Splits the slow side-effects into separate step.run blocks
// for replay-safe idempotency (RESEARCH §Pitfall 8): if archive fails on
// retry, categorize is already memoized as success.
//
// retries: 0 — same rationale as debtor-email-icontroller-cleanup-worker.ts:
// each side-effect is independently idempotent at the API layer (categorize
// is natively idempotent; archive moves to Archive folder = no-op on second
// call), and a failed step surfaces as automation_runs.status='failed' with
// an error_message + a retry button in the queue UI rather than cascading
// retries that would block the next event.
//
// iController-delete is NOT performed inline. We queue a debtor-email-cleanup
// row that the existing Phase 55 cleanup-dispatcher cron picks up — this
// reuses the multi-mailbox Browserless session pool instead of spawning a new
// one per verdict.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { categorizeEmail, archiveEmail } from "@/lib/outlook";

// Outlook category labels — mirrors actions.ts pre-rewrite. Could move to a
// shared constants module once a second consumer needs it.
//
// Note: the UI override dropdown (OVERRIDE_CATEGORIES in
// debtor-email-review/categories.ts) uses the short key `payment` while the
// ingest classifier writes the longer `payment_admittance`. Both must map
// to the same Outlook category here. `unknown` is intentionally NOT in this
// map — actions.ts short-circuits override='unknown' to a reject (label-only
// skip), so the worker never reaches a label lookup for it.
const CATEGORY_LABEL: Record<string, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "OoO — Temporary",
  ooo_permanent: "OoO — Permanent",
  payment: "Payment Admittance",
  payment_admittance: "Payment Admittance",
  // Phase 60 review-only: reviewers tag invoice-copy-request emails so we
  // accumulate Wilson telemetry on this category. Phase 62 will replace
  // the Outlook-only handling with a full copy-document swarm
  // (fetchDocument → draft reply with PDF). Today the worker just applies
  // the label so the email is visible in Outlook for manual handling.
  invoice_copy_request: "Invoice Copy Request",
};

export const classifierVerdictWorker = inngest.createFunction(
  { id: "classifier/verdict-worker", retries: 0 },
  { event: "classifier/verdict.recorded" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      decision,
      message_id,
      source_mailbox,
      predicted_category,
      override_category,
    } = event.data;

    const admin = createAdminClient();

    // ---- Reject path ------------------------------------------------------
    // No Outlook / iController side-effects — just close the row out so the
    // UI doesn't see a half-state.
    if (decision === "reject") {
      await step.run("mark-complete-reject", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      return { ok: true, decision };
    }

    // ---- Approve path -----------------------------------------------------
    // Flip to pending so a re-trigger can't double-pick this row (analog of
    // cleanup-worker's flip-to-pending pattern).
    await step.run("flip-to-pending", async () => {
      await admin
        .from("automation_runs")
        .update({ status: "pending" })
        .eq("id", automation_run_id);
      await emitAutomationRunStale(admin, "debtor-email-review");
    });

    const finalCategoryKey = override_category ?? predicted_category;
    const categoryLabel = CATEGORY_LABEL[finalCategoryKey];

    if (!categoryLabel) {
      const errMsg = `no Outlook category configured for ${finalCategoryKey}`;
      await step.run("mark-failed-no-category", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "failed",
            error_message: errMsg,
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      throw new Error(errMsg);
    }

    try {
      // Each side-effect is its own step.run — replay-safe memoization
      // (Pitfall 8). categorize success persists across retries; archive
      // can fail without re-categorizing.
      await step.run("categorize", async () => {
        const res = await categorizeEmail(source_mailbox, message_id, categoryLabel);
        if (!res.success) {
          throw new Error(`categorize failed: ${res.error ?? "unknown"}`);
        }
      });

      await step.run("archive", async () => {
        const res = await archiveEmail(source_mailbox, message_id);
        if (!res.success) {
          throw new Error(`archive failed: ${res.error ?? "unknown"}`);
        }
      });

      // Defer iController-delete to the existing cleanup pipeline. We write
      // a debtor-email-cleanup row in 'deferred' status; the Phase 55
      // cleanup-dispatcher cron picks it up and shards it to the
      // iController shard worker. No new Browserless wiring needed here.
      await step.run("queue-icontroller-delete", async () => {
        await admin.from("automation_runs").insert({
          automation: "debtor-email-cleanup",
          status: "deferred",
          swarm_type: "debtor-email",
          result: {
            stage: "icontroller_delete",
            source_automation_run_id: automation_run_id,
            message_id,
            source_mailbox,
            icontroller: "pending",
          },
          triggered_by: "classifier-verdict-worker",
        });
        await emitAutomationRunStale(admin, "debtor-email-cleanup");
      });

      await step.run("mark-completed", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });

      return { ok: true, decision };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "failed",
            error_message: msg,
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      throw err;
    }
  },
);
