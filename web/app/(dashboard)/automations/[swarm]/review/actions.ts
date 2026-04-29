"use server";

// Phase 56.7-03 (D-15, Pitfall 5). Generic verdict-write server action for
// the dynamic-segment queue route. Was originally
// debtor-email-review/actions.ts (Phase 60-06 / 61-01).
//
// What this file does (synchronous write path):
//   1. flip automation_runs.status: predicted -> feedback (D-17)
//   2. write public.agent_runs telemetry row (D-01)
//   3. fire the verdict-recorded Inngest event — the registry-driven
//      classifier-verdict-worker (Phase 56.7-02) does the slow side-effects
//      based on the swarm_categories row (action='categorize_archive' |
//      'reject' | 'manual_review' | 'swarm_dispatch'). No swarm-specific
//      branching here.
//   4. emit single broadcast for the queue-UI invalidation
//
// override_category is validated as a free-form string at the schema level
// (Pitfall 5) and post-validated against `loadSwarmCategories(admin,
// swarm_type)` so unknown values for the active swarm are rejected without
// re-deploying the route when a new category is seeded.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { inngest } from "@/lib/inngest/client";
import { fetchMessageBody } from "@/lib/outlook";
import { loadSwarmCategories } from "@/lib/swarms/registry";
import type { ReviewEmailBodyResult, VerdictInput } from "./categories";

// IMPORTANT: this file MUST export only async functions. Next 15 /
// Turbopack's "use server" codegen scans every export name and emits a
// runtime `module.exports.X = X` line — even for `export type`
// declarations. A type-only export therefore produces
// `ReferenceError: X is not defined` at module-evaluation time. All
// types live in ./categories.

const verdictSchema = z.object({
  swarm_type: z.string().min(1),
  automation_run_id: z.string().min(1),
  rule_key: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  message_id: z.string(),
  source_mailbox: z.string(),
  entity: z.string(),
  predicted_category: z.string(),
  // D-15 / Pitfall 5: register-driven validation, not z.enum on a static
  // OVERRIDE_CATEGORIES const. The registry is the source of truth.
  override_category: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordVerdict(input: VerdictInput): Promise<{ ok: true }> {
  const parsed = verdictSchema.parse(input);
  const admin = createAdminClient();

  // Pitfall 5: post-validate override_category against the registry's live
  // category list for this swarm. Allows new categories without code change.
  if (parsed.override_category != null && parsed.override_category !== "") {
    const cats = await loadSwarmCategories(admin, parsed.swarm_type);
    const known = cats.find((c) => c.category_key === parsed.override_category);
    if (!known) {
      throw new Error(
        `unknown override_category: ${parsed.override_category} for swarm ${parsed.swarm_type}`,
      );
    }
  }

  // Phase 61-01 (preserved): route the effective decision before writing.
  //   - override_category='unknown' → label-only skip → decision='reject'
  //   - override_category differing from predicted_category and not 'unknown'
  //     → reviewer is approving the override target → decision='approve'.
  //   - override_category equal to predicted_category, or no override at all
  //     → preserve the reviewer's raw decision.
  // The 'unknown' literal is the convention shared by all swarms for the
  // skip / label-only path (debtor-email seed has it; Sales would seed it
  // identically). It is NOT a hardcoded debtor-email category.
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
  let reviewerEmail: string | null = null;
  try {
    const sb = await createClient();
    const { data: userRes } = await sb.auth.getUser();
    reviewerEmail = userRes?.user?.email ?? null;
  } catch {
    // No request context (tests, server-job invocation) → leave null.
  }
  const verdictTimestamp = new Date().toISOString();

  const { data: ar, error: arErr } = await admin
    .from("agent_runs")
    .insert({
      swarm_type: parsed.swarm_type,
      automation_run_id: parsed.automation_run_id,
      email_id: parsed.automation_run_id,
      entity: parsed.entity,
      rule_key: parsed.rule_key,
      human_verdict: effectiveDecision === "approve" ? "approved" : "rejected_other",
      human_notes: parsed.notes ?? null,
      corrected_category: parsed.override_category ?? null,
      verdict_set_at: verdictTimestamp,
      verdict_set_by: reviewerEmail,
    })
    .select("id")
    .single();
  if (arErr || !ar) {
    throw new Error(`agent_runs insert failed: ${arErr?.message ?? "no row returned"}`);
  }

  // 3. Async side-effects (D-16/D-29). Worker dispatches per registry
  //    action — Wave 2 made this swarm-agnostic.
  await inngest.send({
    name: "classifier/verdict.recorded",
    data: {
      automation_run_id: parsed.automation_run_id,
      agent_run_id: ar.id,
      swarm_type: parsed.swarm_type,
      rule_key: parsed.rule_key,
      decision: effectiveDecision,
      message_id: parsed.message_id,
      source_mailbox: parsed.source_mailbox,
      entity: parsed.entity,
      predicted_category: parsed.predicted_category,
      override_category: parsed.override_category ?? undefined,
      notes: parsed.notes,
    },
  });

  // 4. Broadcast invalidate so the queue-UI re-fetches and the row vanishes.
  await emitAutomationRunStale(admin, `${parsed.swarm_type}-review`);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 61-01 (D-FETCH-EMAIL-BODY): re-introduce the body fetch action that
// powers the detail-pane "Show full email" expander. Lazy-fetch only — never
// bulk pre-fetch. Reads message_id + source_mailbox out of
// automation_runs.result jsonb so the caller only has to pass the run id.
//
// Note: today this path is Outlook-only. When a non-Outlook swarm (e.g.
// Sales talking to a different inbox source) ships, the swarm registry's
// side_effects jsonb is the natural extension point for routing the body
// fetcher. Out of scope for 56.7.
// ---------------------------------------------------------------------------

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
