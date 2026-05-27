// Plan 02-02 Task 2 — Stage 2 baseline enrichment.
//
// Listens on `support-tickets/stage-2.requested` (emitted by the ingest route
// after Stage 0/1 telemetry is persisted). Loads the support_tickets row,
// writes ONE pipeline_events stage=2 row carrying the v1 empty
// PipelineStageContext, and sets support_tickets.stage2_completed_at.
//
// This is the BASELINE slice: it proves the trigger + worker plumbing + output
// contract end-to-end. Plans 02-03 (transcript/PII), 02-04 (system-detect +
// prior tickets), and 02-05 (embeddings + similar tickets) UPDATE individual
// PipelineStageContext fields — they MUST NOT change the trigger or the row
// shape.
//
// Replay safety (docs/inngest-patterns.md):
//   - All side-effects inside step.run().
//   - The non-deterministic ISO timestamp used as decision_details payload AND
//     as the support_tickets.stage2_completed_at value is memoized in a
//     `compute-now` step so replays don't drift the value across writes.
//
// .error guards (Phase 1 lesson b7266f21): supabase-js v2 returns { data,
// error } and does NOT throw. We inspect .error on both the pipeline_events
// insert and the support_tickets UPDATE; surfacing the error as a thrown
// Error makes Inngest retry (retries: 3) and surfaces failures in the
// dashboard rather than silently no-op'ing.
//
// retries: 3 — the worst-case duplicate is one extra stage=2 row. No
// irreversible side-effects in this plan (no LLM, no external API). Plans
// 02-03..02-05 will need to revisit (Whisper/ffmpeg cost considerations).
//
// Inngest binding-safety: `inngest.createFunction` is used directly (not
// destructured). Future event sends from this file MUST follow the
// CLAUDE.md "never destructure inngest.send" rule.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emptyPipelineStageContext,
  type PipelineStageContext,
} from "./pipeline-stage-context";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type Stage2RequestedEvent = {
  support_ticket_id: string;
  submission_id: string;
  external_task_id: string;
  attempt: number;
};

export type Stage2BaselineResult =
  | {
      ok: true;
      context: PipelineStageContext;
      pipeline_event_decision: "stage_2_baseline";
    }
  | {
      ok: false;
      reason: string;
    };

const TRIGGERED_BY = "support-tickets:stage-2-enrichment";

/**
 * Pure handler — testable in isolation without an Inngest runtime. The
 * Inngest wrapper below is a thin orchestrator that calls into this function
 * through step.run boundaries for replay safety.
 */
export async function runStage2BaselineEnrichment(
  event: Stage2RequestedEvent,
  deps: { supabase: SupabaseAdmin; now: () => Date },
): Promise<Stage2BaselineResult> {
  const { supabase, now } = deps;
  const startedAt = now();

  // (1) Load the support_tickets row by id. submission_id, external_task_id,
  //     and attempt come from the DB row — NOT from event.data — so a crafted
  //     event payload can't forge what we write (T-02-12 mitigation).
  const ticketRes = await supabase
    .from("support_tickets")
    .select("id, submission_id, external_task_id, attempt")
    .eq("id", event.support_ticket_id)
    .maybeSingle();

  if (ticketRes.error) {
    throw new Error(
      `support_tickets lookup failed: ${(ticketRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }
  const ticket = ticketRes.data as
    | {
        id: string;
        submission_id: string;
        external_task_id: string;
        attempt: number;
      }
    | null;
  if (!ticket) {
    return { ok: false, reason: "ticket_not_found" };
  }

  // (2) Build the v1 empty PipelineStageContext baseline.
  const context = emptyPipelineStageContext();

  // (3) Insert the canonical stage=2 telemetry row. decision_details carries
  //     the full PipelineStageContext (4 empty arrays + context_version) plus
  //     external_task_id + attempt audit fields. duration_ms is Math.round-ed
  //     (Phase 1 lesson 69c75ebf — pipeline_events.duration_ms is integer).
  const completedAt = now();
  const duration_ms = Math.round(
    completedAt.getTime() - startedAt.getTime(),
  );

  const piRes = await supabase.from("pipeline_events").insert({
    swarm_type: "support-tickets",
    stage: 2,
    decision: "stage_2_baseline",
    decision_details: {
      ...context,
      external_task_id: ticket.external_task_id,
      attempt: ticket.attempt,
    },
    duration_ms,
    triggered_by: TRIGGERED_BY,
    automation_run_id: ticket.id,
    // email_id is UUID-typed; the support-tickets handle is submission_id
    // (NOT the PK id, NOT the external_task_id text).
    email_id: ticket.submission_id,
  });
  if (piRes.error) {
    throw new Error(
      `pipeline_events insert failed: ${(piRes.error as { message?: string }).message ?? "unknown"}`,
    );
  }

  // (4) Mark stage2 complete on the support_tickets row. Phase 2 plans
  //     02-03..02-05 will UPDATE additional Stage-2 columns on the same row
  //     (frame_urls, proposed_system_status, pii_quarantine, stage2_cost_cents).
  const updRes = await supabase
    .from("support_tickets")
    .update({ stage2_completed_at: completedAt.toISOString() })
    .eq("id", ticket.id);
  if ((updRes as { error?: unknown } | null)?.error) {
    const err = (updRes as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets update stage2_completed_at failed: ${err?.message ?? "unknown"}`,
    );
  }

  return {
    ok: true,
    context,
    pipeline_event_decision: "stage_2_baseline",
  };
}

/**
 * Inngest wrapper. Function-id is LOCKED — see Plan 02-02 W-3 follow-up:
 * never rename across runs (in-flight runs would orphan). If a v2 schema
 * becomes necessary, bump to `stage-2-support-tickets-enrichment-v2` AND
 * keep this v1 listener registered for a deprecation window.
 */
export const stage2SupportTicketsEnrichment = inngest.createFunction(
  { id: "stage-2-support-tickets-enrichment", retries: 3 },
  { event: "support-tickets/stage-2.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();

    // Memoize the timestamp across replays (docs/inngest-patterns.md §
    // "Non-Deterministic Values Used as DB Keys"). The ISO string flows into
    // both pipeline_events.decision_details (indirectly via duration_ms) and
    // support_tickets.stage2_completed_at — drift across replays would
    // produce mismatched values between the two rows.
    const baselineNowIso = await step.run("compute-now", async () =>
      new Date().toISOString(),
    );
    const fixedNow = new Date(baselineNowIso);

    return await step.run("run-stage-2-baseline", async () =>
      runStage2BaselineEnrichment(event.data as Stage2RequestedEvent, {
        supabase: admin,
        now: () => fixedNow,
      }),
    );
  },
);
