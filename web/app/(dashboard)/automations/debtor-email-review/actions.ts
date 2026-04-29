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
//
// Phase 61-01 extends recordVerdict with:
//   - override_category enum (D-PERSIST-OVERRIDE / D-LABEL-ONLY-SKIP)
//   - notes (≤2000 chars, D-PERSIST-NOTES)
//   - jsonb merge of {review_override, review_note} into automation_runs.result
//   - decision routing: override='unknown' → reject; override≠predicted → approve
// And re-introduces fetchReviewEmailBody (D-FETCH-EMAIL-BODY) for the
// detail-pane body expander built in Plan 02.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { inngest } from "@/lib/inngest/client";
import { fetchMessageBody } from "@/lib/outlook";
import {
  OVERRIDE_CATEGORIES,
  type ReviewEmailBodyResult,
  type VerdictInput,
} from "./categories";

// IMPORTANT: this file MUST export only async functions. Next 15 /
// Turbopack's "use server" codegen scans every export name and emits a
// runtime `module.exports.X = X` line — even for `export type`
// declarations. A type-only export therefore produces
// `ReferenceError: X is not defined` at module-evaluation time. All
// types and constants live in ./categories.

const verdictSchema = z.object({
  automation_run_id: z.string().min(1),
  rule_key: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  message_id: z.string(),
  source_mailbox: z.string(),
  entity: z.string(),
  predicted_category: z.string(),
  override_category: z.enum(OVERRIDE_CATEGORIES).optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordVerdict(input: VerdictInput): Promise<{ ok: true }> {
  const parsed = verdictSchema.parse(input);
  const admin = createAdminClient();

  // Phase 61-01: route the effective decision before writing anything.
  //   - override_category='unknown' → label-only skip → decision='reject'
  //     (matches the prior `labelOnly` semantic from commit a1033f4 — the
  //     worker sees override_category='unknown' and skips Outlook side-effects).
  //   - override_category differing from predicted_category and not 'unknown'
  //     → reviewer is approving the override target → decision='approve'.
  //   - override_category equal to predicted_category, or no override at all
  //     → preserve the reviewer's raw decision.
  let effectiveDecision = parsed.decision;
  const isSkip = parsed.override_category === "unknown";
  const isDifferingOverride =
    !!parsed.override_category &&
    parsed.override_category !== "unknown" &&
    parsed.override_category !== parsed.predicted_category;
  if (isSkip) {
    effectiveDecision = "reject";
  } else if (isDifferingOverride) {
    effectiveDecision = "approve";
  }

  // 0. Fetch existing automation_runs.result so we can jsonb-merge the
  //    reviewer's override + note without dropping any keys the queue
  //    pipeline previously stored (message_id, source_mailbox, predicted, …).
  //    Done via fetch-then-update because postgrest does not expose `||`.
  const { data: existing } = await admin
    .from("automation_runs")
    .select("result")
    .eq("id", parsed.automation_run_id)
    .single();

  const mergedResult = {
    ...((existing?.result as Record<string, unknown>) ?? {}),
    ...(parsed.override_category ? { review_override: parsed.override_category } : {}),
    ...(parsed.notes ? { review_note: parsed.notes } : {}),
  };

  // 1. Flip predicted -> feedback. Row leaves queue on broadcast (D-17).
  const { error: updErr } = await admin
    .from("automation_runs")
    .update({
      status: "feedback",
      completed_at: new Date().toISOString(),
      result: mergedResult,
    })
    .eq("id", parsed.automation_run_id);
  if (updErr) {
    throw new Error(`automation_runs update failed: ${updErr.message}`);
  }

  // 2. Telemetry — public.agent_runs (D-01).
  // Schema notes (verified against live Supabase):
  //   - agent_runs has NO `context` column. Reviewer notes live in
  //     `human_notes`; message_id/source_mailbox/entity/predicted_category
  //     already travel via the Inngest event payload + automation_runs.result
  //     jsonb merge above, so we don't duplicate them here.
  //   - agent_runs.email_id is NOT NULL (uuid) but has no FK. The triage
  //     flow populates it from the inbound event's email uuid; the
  //     bulk-review flow has no equivalent — the underlying record is the
  //     automation_run itself. Reuse automation_run_id as email_id so the
  //     constraint is satisfied and the row remains joinable.
  const { data: ar, error: arErr } = await admin
    .from("agent_runs")
    .insert({
      swarm_type: "debtor-email",
      automation_run_id: parsed.automation_run_id,
      email_id: parsed.automation_run_id,
      entity: parsed.entity,
      rule_key: parsed.rule_key,
      human_verdict: effectiveDecision === "approve" ? "approved" : "rejected_other",
      human_notes: parsed.notes ?? null,
      corrected_category: parsed.override_category ?? null,
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
      automation_run_id: parsed.automation_run_id,
      agent_run_id: ar.id,
      swarm_type: "debtor-email",
      rule_key: parsed.rule_key,
      decision: effectiveDecision,
      message_id: parsed.message_id,
      source_mailbox: parsed.source_mailbox,
      entity: parsed.entity,
      predicted_category: parsed.predicted_category,
      override_category: parsed.override_category,
      notes: parsed.notes,
    },
  });

  // 4. Broadcast invalidate so the queue-UI re-fetches and the row vanishes.
  await emitAutomationRunStale(admin, "debtor-email-review");

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 61-01 (D-FETCH-EMAIL-BODY): re-introduce the body fetch action that
// powers the detail-pane "Show full email" expander in Plan 02. Lazy-fetch
// only — never bulk pre-fetch (anti-pattern #3 in 61-CONTEXT.md).
// Reads message_id + source_mailbox out of automation_runs.result jsonb so
// the caller only has to pass the run id.
// ---------------------------------------------------------------------------

// ReviewEmailBodyResult is a typed envelope (defined in ./categories) so
// the real error message survives Next's production server-action masking.
export async function fetchReviewEmailBody(
  automationRunId: string,
): Promise<ReviewEmailBodyResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("automation_runs")
      .select("result")
      .eq("id", automationRunId)
      .single();
    if (error || !data) {
      return { ok: false, error: "automation_run not found" };
    }
    const result = (data.result ?? {}) as {
      message_id?: string;
      source_mailbox?: string;
    };
    if (!result.message_id || !result.source_mailbox) {
      return {
        ok: false,
        error: "automation_run missing message_id or source_mailbox",
      };
    }
    const body = await fetchMessageBody(result.source_mailbox, result.message_id);
    return {
      ok: true,
      bodyText: body.bodyText ?? "",
      bodyHtml: body.bodyHtml ? body.bodyHtml : null,
    };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error("[fetchReviewEmailBody]", automationRunId, msg);
    return { ok: false, error: `outlook fetch failed: ${msg}` };
  }
}
