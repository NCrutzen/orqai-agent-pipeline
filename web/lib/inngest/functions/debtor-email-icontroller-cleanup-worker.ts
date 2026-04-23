import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  openIControllerSession,
  closeIControllerSession,
} from "@/lib/automations/icontroller/session";
import { deleteEmailOnPage } from "@/lib/automations/debtor-email-cleanup/browser";

/**
 * iController-cleanup SHARD WORKER. Triggered by
 * `icontroller/cleanup.shard.requested` events emitted by the dispatcher.
 * Each event carries a workerIndex (for session-key sharding) and a
 * list of rows to process. This function runs as its own Vercel
 * invocation — so 3 shards fan out to 3 parallel serverless executions
 * with independent Browserless sessions.
 *
 * Concurrency key on `workerIndex` prevents two overlapping ticks from
 * both grabbing the same shard (which would mutate the same session-key
 * in Supabase concurrently).
 */

const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

interface PendingResult {
  stage: string;
  message_id: string;
  from: string;
  subject: string;
  received_at: string;
  icontroller?: string;
}

interface PendingRow {
  id: string;
  result: PendingResult;
}

type Outcome = {
  message_id: string;
  outcome: "deleted" | "not_found" | "failed";
  error?: string;
};

export const cleanupIControllerShardWorker = inngest.createFunction(
  {
    id: "automations/debtor-email-icontroller-shard-worker",
    retries: 1,
    // CEL expression wrapped in string() so a numeric workerIndex (0,1,2)
    // yields three distinct string keys ("0","1","2") instead of collapsing
    // into a single bucket — which is what Inngest appears to do when the
    // key expression returns a number. Observed 2026-04-23: without this
    // wrap, 3 emitted shard events ran sequentially (1 running + 2 queued)
    // instead of all three in parallel.
    concurrency: { limit: 1, key: "string(event.data.workerIndex)" },
  },
  { event: "icontroller/cleanup.shard.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const { workerIndex, rows } = event.data as {
      workerIndex: number;
      rows: PendingRow[];
    };
    const processorName = `inngest-cleanup-cron-w${workerIndex}`;

    return step.run("process-shard", async () => {
      const out: Outcome[] = [];

      const session = await openIControllerSession("production", workerIndex);
      try {
        for (const row of rows) {
          const r = row.result;

          // Flip to pending so the kanban shows the card in progress and
          // a re-trigger of the same shard can't double-pick this row.
          await admin
            .from("automation_runs")
            .update({
              automation: "debtor-email-cleanup",
              status: "pending",
              result: { ...r, processed_by: processorName },
            })
            .eq("id", row.id);

          try {
            const icRes = await deleteEmailOnPage(session.page, session.cfg, {
              company: ICONTROLLER_COMPANY,
              from: r.from,
              subject: r.subject,
              receivedAt: r.received_at,
            });
            const errText = icRes.error ?? "";
            const icStatus: "deleted" | "not_found" | "failed" =
              icRes.success && icRes.emailFound
                ? "deleted"
                : !icRes.emailFound &&
                    /email not found|company .* not found/i.test(errText)
                  ? "not_found"
                  : "failed";

            await admin
              .from("automation_runs")
              .update({
                automation: "debtor-email-cleanup",
                status: icStatus === "failed" ? "failed" : "completed",
                result: {
                  ...r,
                  icontroller: icStatus,
                  screenshots: icRes.screenshots,
                  processed_by: processorName,
                },
                error_message: icStatus === "failed" ? errText || null : null,
                completed_at: new Date().toISOString(),
              })
              .eq("id", row.id);

            out.push({
              message_id: r.message_id,
              outcome: icStatus,
              error: errText || undefined,
            });
          } catch (err) {
            const msg = String(err);
            await admin
              .from("automation_runs")
              .update({
                automation: "debtor-email-cleanup",
                status: "failed",
                result: {
                  ...r,
                  icontroller: "failed",
                  processed_by: processorName,
                },
                error_message: msg,
                completed_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            out.push({ message_id: r.message_id, outcome: "failed", error: msg });
          }
        }
      } finally {
        await closeIControllerSession(session);
      }

      return {
        workerIndex,
        processed: out.length,
        deleted: out.filter((r) => r.outcome === "deleted").length,
        not_found: out.filter((r) => r.outcome === "not_found").length,
        failed: out.filter((r) => r.outcome === "failed").length,
      };
    });
  },
);
