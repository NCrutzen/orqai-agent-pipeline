// Phase 56.7 Wave 2 (D-02, D-10, D-11, D-12). Registry-driven verdict worker.
//
// Loads the matching public.swarm_categories row via loadSwarmCategories() and
// switches on `category.action` instead of branching on hardcoded category
// keys. After this rewrite, adding a new swarm with a custom side-effect needs
// only:
//   1. INSERT swarms row (ui_config + review_route)
//   2. INSERT swarm_categories row(s) with action='swarm_dispatch' + the new
//      Inngest event name in swarm_dispatch column
//   3. A new Inngest worker listening on that event
// — zero edits to this file.
//
// Phase boundaries still in this file:
//   - D-12: iController-delete is gated on swarm_type === 'debtor-email'.
//     Phase 56.8 will move it into a generic side_effects jsonb on swarms.
//
// retries: 0 — same rationale as before. Each step is independently
// idempotent at the API layer; failures surface as automation_runs.status
// ='failed' with an error_message so the queue UI's retry button is the
// recovery path rather than cascading retries that would block the next event.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { categorizeEmail, archiveEmail } from "@/lib/outlook";
import { loadSwarmCategories } from "@/lib/swarms/registry";

export const classifierVerdictWorker = inngest.createFunction(
  { id: "classifier/verdict-worker", retries: 0 },
  { event: "classifier/verdict.recorded" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      swarm_type,
      decision,
      message_id,
      source_mailbox,
      predicted_category,
      override_category,
    } = event.data;

    const admin = createAdminClient();

    // ---- Reject path ------------------------------------------------------
    // No registry lookup. No Outlook / iController side-effects — just close
    // the row out so the UI doesn't see a half-state.
    if (decision === "reject") {
      await step.run("mark-complete-reject", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
      });
      return { ok: true, decision };
    }

    // ---- Approve path: registry-driven dispatch --------------------------
    // Flip to pending so a re-trigger can't double-pick this row.
    await step.run("flip-to-pending", async () => {
      await admin
        .from("automation_runs")
        .update({ status: "pending" })
        .eq("id", automation_run_id);
      await emitAutomationRunStale(admin, `${swarm_type}-review`);
    });

    const finalCategoryKey = override_category ?? predicted_category;

    const categories = await step.run("load-categories", () =>
      loadSwarmCategories(admin, swarm_type),
    );
    const category = categories.find((c) => c.category_key === finalCategoryKey);

    if (!category) {
      const errMsg = `no swarm_categories row for (${swarm_type}, ${finalCategoryKey})`;
      await step.run("mark-failed-no-category", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "failed",
            error_message: errMsg,
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
      });
      throw new Error(errMsg);
    }

    try {
      switch (category.action) {
        case "reject": {
          // Worker-resolved 'reject' even though decision='approve' — the seed
          // category for 'unknown' is action='reject' (label-only-skip).
          break;
        }
        case "manual_review": {
          // No side-effects. Reserved for future human-only categories.
          break;
        }
        case "categorize_archive": {
          // D-11: outlook_label nullable. When null, skip BOTH categorize and
          // archive (graceful for non-Outlook-sourced swarms).
          if (category.outlook_label) {
            await step.run("categorize", async () => {
              const r = await categorizeEmail(
                source_mailbox,
                message_id,
                category.outlook_label!,
              );
              if (!r.success) {
                throw new Error(`categorize failed: ${r.error ?? "unknown"}`);
              }
            });
            await step.run("archive", async () => {
              const r = await archiveEmail(source_mailbox, message_id);
              if (!r.success) {
                throw new Error(`archive failed: ${r.error ?? "unknown"}`);
              }
            });
          }
          // D-12: iController-delete remains code-coupled for the debtor-email
          // swarm. Until Phase 56.8 generalizes side_effects, keep this inline
          // and gated on swarm_type.
          if (swarm_type === "debtor-email") {
            await step.run("queue-icontroller-delete", async () => {
              await admin.from("automation_runs").insert({
                automation: "debtor-email-cleanup",
                status: "deferred",
                swarm_type,
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
          }
          break;
        }
        case "swarm_dispatch": {
          // D-02: fire the Inngest event named in the swarm_dispatch column.
          if (!category.swarm_dispatch) {
            throw new Error(
              `swarm_dispatch action requires swarm_dispatch event name (${swarm_type}, ${finalCategoryKey})`,
            );
          }
          await step.run("dispatch", async () => {
            // Dynamic dispatch: the event name comes from the registry row, not
            // the EventSchemas map. The downstream worker is registered in a
            // separate file (see D-02 / Phase 56.7 plan) and validates its own
            // payload. Cast through unknown to widen past the strict event-name
            // union typed on `inngest.send`.
            await (inngest.send as unknown as (payload: {
              name: string;
              data: Record<string, unknown>;
            }) => Promise<unknown>)({
              name: category.swarm_dispatch!,
              data: {
                automation_run_id,
                swarm_type,
                category_key: finalCategoryKey,
                message_id,
                source_mailbox,
              },
            });
          });
          break;
        }
        default: {
          // Pitfall 3: exhaustive-check guard. If a future migration adds a
          // new SwarmAction literal, tsc will fail this assignment.
          const _exhaustive: never = category.action;
          throw new Error(`unhandled action: ${_exhaustive as string}`);
        }
      }

      await step.run("mark-completed", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
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
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
      });
      throw err;
    }
  },
);
