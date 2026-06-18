// Shared onFailure sink for pipeline handoff workers.
//
// Root cause this addresses (2026-06-16 debug `sales-pipeline-funnel-stall`):
// every stage/handoff worker ran `retries: 0` and several real failure modes
// THROW uncaught (Postgres statement timeout on the emails lookup, Orq schema
// mismatch / timeout, emit IO). An uncaught throw landed BEFORE the next-stage
// `inngest.send`, so the email was permanently + silently dropped with no
// record — the original "failures surface in Bulk Review" assumption only ever
// covered CAUGHT-and-returned errors, never throws.
//
// Two-part fix: (1) handoff workers now carry a retry budget so transient
// throws recover; (2) THIS sink is wired as each worker's `onFailure` so a
// TERMINAL failure (after retries are exhausted) writes a VISIBLE record
// instead of vanishing into Inngest's failed-run log.
//
// Contract: this function must NEVER throw — an onFailure that throws would
// itself be lost. Every write is best-effort and independently try/caught.

import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

/**
 * The Inngest v3 onFailure callback receives the `inngest/function.failed`
 * wrapper event; the ORIGINAL trigger payload is at `event.data.event.data`
 * (same shape used by classifier-invoice-copy-handler.ts:73).
 */
type FailureEvent = {
  data?: { event?: { data?: Record<string, unknown> } };
};

export interface RecordWorkerFailureArgs {
  /** pipeline_events.stage (smallint 0..4). Stage 1.5 → use 1 + stageLabel. */
  stage: number;
  /** Human label for telemetry, e.g. "stage-1.5-attachment-extractor". */
  stageLabel: string;
  /** Fallback swarm_type when the payload lacks one. */
  defaultSwarmType?: string;
  /** The onFailure wrapper event. */
  event: unknown;
  /** The thrown error Inngest surfaces. */
  error: { name?: string; message?: string } | undefined;
}

/**
 * Record a terminal handoff-worker failure so it is visible in Bulk Review /
 * pipeline telemetry instead of being silently dropped.
 *
 * Writes:
 *   1. a `pipeline_events` row (decision='worker_failed') — email_id LEFT NULL
 *      to dodge the partial unique index
 *      `pipeline_events_one_per_stage_email (email_id, swarm_type, stage)`,
 *      so a failure record never collides with that stage's success row; the
 *      real email/message refs live in decision_details.
 *   2. best-effort `status='failed'` + error_message on the originating
 *      automation_runs / agent_runs rows (when their ids are in the payload),
 *      guarded so a clean upstream completion is never clobbered.
 */
export async function recordWorkerFailure({
  stage,
  stageLabel,
  defaultSwarmType,
  event,
  error,
}: RecordWorkerFailureArgs): Promise<void> {
  try {
    const orig = (event as FailureEvent)?.data?.event?.data ?? {};
    const swarmType =
      (typeof orig.swarm_type === "string" && orig.swarm_type) ||
      defaultSwarmType ||
      "unknown";
    const emailId = asUuid(orig.email_id);
    const automationRunId = asUuid(orig.automation_run_id);
    const agentRunId = asUuid(orig.agent_run_id);
    const messageId =
      typeof orig.message_id === "string" ? orig.message_id : null;
    const errorMessage = (error?.message ?? "unknown error").slice(0, 2000);

    const admin = createAdminClient();

    // 1. Telemetry row (never collides — email_id NULL).
    try {
      const { error: insErr } = await admin.from("pipeline_events").insert({
        swarm_type: swarmType,
        stage,
        email_id: null,
        decision: "worker_failed",
        decision_details: {
          stage_label: stageLabel,
          error_message: errorMessage,
          error_name: error?.name ?? null,
          email_id: emailId,
          message_id: messageId,
          automation_run_id: automationRunId,
          agent_run_id: agentRunId,
        },
        automation_run_id: automationRunId,
        agent_run_id: agentRunId,
        triggered_by: "onFailure",
      });
      if (insErr) {
        console.error(
          `[onFailure] pipeline_events insert (${stageLabel}): ${insErr.message}`,
        );
      }
    } catch (e) {
      console.error(`[onFailure] pipeline_events insert threw (${stageLabel}):`, e);
    }

    // 2a. Surface on the automation_run — don't clobber a clean completion.
    if (automationRunId) {
      try {
        await admin
          .from("automation_runs")
          .update({ status: "failed", error_message: errorMessage })
          .eq("id", automationRunId)
          .neq("status", "completed");
      } catch (e) {
        console.error(`[onFailure] automation_runs mark-failed (${stageLabel}):`, e);
      }
    }

    // 2b. Surface on the agent_run — 'failed' is in the status CHECK
    //     (20260506_phase74). Don't clobber a finished run.
    if (agentRunId) {
      try {
        await admin
          .from("agent_runs")
          .update({ status: "failed", error_message: errorMessage })
          .eq("id", agentRunId)
          .neq("status", "done");
      } catch (e) {
        console.error(`[onFailure] agent_runs mark-failed (${stageLabel}):`, e);
      }
    }
  } catch (e) {
    // Last-resort guard — onFailure must never throw.
    console.error(`[onFailure] recordWorkerFailure unexpected (${stageLabel}):`, e);
  }
}
