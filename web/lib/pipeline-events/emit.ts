import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipelineEventInput } from "./types";

/**
 * Phase 70 — TELE-01. Emit a single row into `public.pipeline_events`.
 *
 * Caller contract (CONTEXT D-06 / D-09):
 *   - For Inngest functions: invoke this from inside the SAME `step.run`
 *     that writes the legacy table (e.g. `automation_runs`, `email_labels`,
 *     `coordinator_runs`). Both INSERTs share one replay boundary, so on
 *     replay neither is duplicated.
 *   - For the Stage 1 ingest API route
 *     (`web/app/api/automations/debtor-email/ingest/route.ts`): a plain
 *     awaited call is sufficient — the route is a single-pass synchronous
 *     handler and Vercel never replays a 200/500 response (RESEARCH
 *     §Pattern 2).
 *
 * Failure semantics:
 *   - On Supabase error this throws. NEVER swallow — the explicit goal of
 *     TELE-01 is one row per stage decision; silent loss defeats the
 *     contract. Propagating the error makes the surrounding `step.run`
 *     fail and Inngest replays the whole atomic unit (legacy write +
 *     emit) together.
 *
 * The helper is intentionally a thin INSERT wrapper: no caching, no
 * batching, no retries. Its sole value is enforcing `PipelineEventInput`
 * at the type-system boundary so call sites can't forget required columns.
 */
export async function emitPipelineEvent(
  admin: SupabaseClient,
  payload: PipelineEventInput,
): Promise<void> {
  const { error } = await admin.from("pipeline_events").insert(payload);
  if (error) {
    throw new Error(`pipeline_events insert failed: ${error.message}`);
  }
}
