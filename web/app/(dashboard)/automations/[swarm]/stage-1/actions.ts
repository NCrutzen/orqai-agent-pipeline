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
//      based on the swarm_noise_categories row (action='categorize_archive' |
//      'reject' | 'manual_review' | 'swarm_dispatch'). No swarm-specific
//      branching here.
//   4. emit single broadcast for the queue-UI invalidation
//
// override_category is validated as a free-form string at the schema level
// (Pitfall 5) and post-validated against `loadSwarmNoiseCategories(admin,
// swarm_type)` so unknown values for the active swarm are rejected without
// re-deploying the route when a new category is seeded. The static
// per-swarm enum that used to live in ./categories is gone — registry is
// the source of truth.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { inngest } from "@/lib/inngest/client";
import { fetchMessageBody } from "@/lib/outlook";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";
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
  // Phase 999.8 Plan 05 / Pitfall 9 (RESEARCH §7): the caller MUST pass a
  // real email_id. Pre-Phase-999.8 code aliased email_id := automation_run_id
  // on the agent_runs insert, which would make the new pipeline_events
  // predictor lookup query against the wrong key. Schema-level required.
  email_id: z.string().min(1),
  rule_key: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  message_id: z.string(),
  source_mailbox: z.string(),
  entity: z.string(),
  predicted_category: z.string(),
  // D-15 / Pitfall 5: registry-driven validation, not z.enum on a static
  // per-swarm const. The swarm_noise_categories table is the source of truth.
  override_category: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export async function recordVerdict(input: VerdictInput): Promise<{ ok: true }> {
  const parsed = verdictSchema.parse(input);
  const admin = createAdminClient();

  // Pitfall 5: post-validate override_category against the registry's live
  // category list for this swarm. Allows new categories without code change.
  if (parsed.override_category != null && parsed.override_category !== "") {
    const cats = await loadSwarmNoiseCategories(admin, parsed.swarm_type);
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

  // Phase 999.8 Plan 05 (D-07 / D-08) — predictor attribution.
  // Read predictor from the Stage 1 pipeline_events row for this email.
  // CRITICAL (RESEARCH §7, Pitfall 2): derive from llm_invoked, NEVER from
  // regex.matchedRule (which is "no_match" when regex abstained and the
  // LLM 2nd-pass made the prediction — treating that as predictor='regex'
  // would mis-attribute every LLM row).
  //
  // Forward-only cutover (D-09): if no Stage 1 pipeline_events row exists
  // for this email (pre-cutover history or race), predictor falls back to
  // NULL. labeling-flip-cron filters predictor IS NOT NULL so NULL rows
  // never enter the per-predictor Wilson-CI stream.
  const { data: stage1Event } = await admin
    .from("pipeline_events")
    .select("decision_details")
    .eq("email_id", parsed.email_id)
    .eq("stage", 1)
    .eq("swarm_type", parsed.swarm_type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const details = ((stage1Event?.decision_details ?? {}) as {
    llm_invoked?: boolean;
    regex?: { invoked?: boolean; matchedRule?: string | null };
  });
  const predictor: "regex" | "llm_2nd_pass" | null =
    details.llm_invoked === true
      ? "llm_2nd_pass"
      : details.regex?.invoked === true
        ? "regex"
        : null;

  const { data: ar, error: arErr } = await admin
    .from("agent_runs")
    .insert({
      swarm_type: parsed.swarm_type,
      automation_run_id: parsed.automation_run_id,
      // Phase 999.8 Plan 05 / Pitfall 9 fix: write the REAL email_id, not
      // the aliased automation_run_id. Historical rows (pre-cutover) have
      // a misaligned email_id column; labeling-flip-cron filters
      // predictor IS NOT NULL so those rows are excluded from the new
      // per-predictor Wilson-CI streams. Any UI consumer that reads
      // agent_runs.email_id directly on historical rows is out of scope —
      // documented in 999.8-05-SUMMARY.md.
      email_id: parsed.email_id,
      entity: parsed.entity,
      rule_key: parsed.rule_key,
      predictor,
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

// ---------------------------------------------------------------------------
// Phase 64-05 (SAFE-02 / SAFE-04). Stage 0 safety-review operator actions.
//
// Three actions, mutually exclusive per email (see 64-UI-SPEC.md):
//   1. markSafeAndReprocess  — re-emits stage-0/email.received with
//                              safety_overridden=true; the worker's Pitfall-5
//                              short-circuit then forwards directly to the
//                              classifier without paying for another LLM call.
//   2. dismissSafetyReview   — records a dismissed_at timestamp and marks
//                              the source row completed. No re-emit.
//   3. escalateToKanban      — files a NEW automation_runs row in the
//                              human-review lane (topic='safety_escalation',
//                              triggered_by='safety-review-escalation'),
//                              mirroring the budget-breach-handler pattern
//                              (D-11: reuse the existing Kanban surface).
//
// All three read the source row first to fetch the original event payload
// fields stored in result jsonb (email_id, message_id, source_mailbox)
// so the re-emit / linkage shape stays intact. Subject + body_text aren't
// in the safety row's result (the worker doesn't persist them); for
// markSafeAndReprocess we re-fetch the body via fetchMessageBody so the
// downstream classifier still sees the email content.
//
// Threat T-64-14 (repudiation): every mutation timestamps result.* with
// the action name + reviewer email so the audit chain in automation_runs
// records who did what when. status='completed' is irreversible.
// ---------------------------------------------------------------------------

/** Phase 64.1: precision/recall signal stamped on every operator action.
 *  Future analytics queries derive TP/FP rates from this field without
 *  needing a separate labelling pipeline. */
type SafetyOutcome =
  | "false_positive"          // Mark safe & reprocess — Stage 0 was wrong
  | "true_positive_archived"  // Correct & Dismiss     — Stage 0 was right, archive
  | "true_positive_escalated";// Escalate              — Stage 0 was right, needs follow-up

interface SafetyResultShape {
  stage?: string;
  email_id?: string;
  message_id?: string;
  source_mailbox?: string;
  subject?: string;
  verdict?: "safe" | "injection_suspected";
  regex_matched?: string | null;
  llm_reason?: string;
  matched_span?: string | null;
  cost_cents?: number;
  token_count?: number;
  safety_overridden?: boolean;
  dismissed_at?: string;
  escalated_at?: string;
  marked_safe_at?: string;
  marked_safe_by?: string | null;
  dismissed_by?: string | null;
  escalated_by?: string | null;
  /** Phase 64.1 outcome label — see SafetyOutcome type. */
  safety_outcome?: SafetyOutcome;
}

async function loadSafetyRow(
  admin: ReturnType<typeof createAdminClient>,
  automation_run_id: string,
): Promise<{
  result: SafetyResultShape;
  entity: string | null;
  mailbox_id: number | null;
  status: string | null;
  swarm_type: string | null;
}> {
  const { data, error } = await admin
    .from("automation_runs")
    .select("result, entity, mailbox_id, status, swarm_type")
    .eq("id", automation_run_id)
    .single();
  if (error || !data) {
    throw new Error(`safety row not found: ${error?.message ?? automation_run_id}`);
  }
  const result = (data.result ?? {}) as SafetyResultShape;
  return {
    result,
    entity: data.entity ?? null,
    mailbox_id: data.mailbox_id ?? null,
    status: data.status ?? null,
    swarm_type: (data as { swarm_type?: string | null }).swarm_type ?? null,
  };
}

/** Phase 64.1: stale-tab guard. Prevents double-action when an operator
 *  re-clicks an already-acted-on row from a stale browser tab. */
function assertActionable(status: string | null, action: string): void {
  if (status !== "predicted") {
    throw new Error(
      `${action}: row is no longer actionable (status=${status ?? "unknown"}). ` +
      "Another action may have completed already — refresh the page.",
    );
  }
}

async function reviewerEmail(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data: userRes } = await sb.auth.getUser();
    return userRes?.user?.email ?? null;
  } catch {
    return null;
  }
}

const SAFETY_STALE_CHANNEL = "debtor-email-review";

export async function markSafeAndReprocess(
  automation_run_id: string,
): Promise<{ ok: true }> {
  if (!automation_run_id) {
    throw new Error("markSafeAndReprocess: automation_run_id required");
  }
  const admin = createAdminClient();
  const { result, status, swarm_type, entity } = await loadSafetyRow(
    admin,
    automation_run_id,
  );
  assertActionable(status, "markSafeAndReprocess");
  if (!result.message_id || !result.source_mailbox || !result.email_id) {
    throw new Error(
      "markSafeAndReprocess: source row missing message_id/source_mailbox/email_id",
    );
  }

  // Re-fetch body so the downstream classifier sees the same content the
  // operator just inspected. The Stage 0 worker won't re-evaluate (Pitfall 5
  // short-circuit), but the forwarded classifier/screen.requested event
  // carries body_text by design.
  let bodyText = "";
  let subject = result.subject ?? "";
  try {
    const body = await fetchMessageBody(result.source_mailbox, result.message_id);
    bodyText = body.bodyText ?? "";
    // fetchMessageBody also returns the subject in some implementations;
    // fall back to whatever the source row had.
    subject = subject || (body as { subject?: string }).subject || "";
  } catch (e) {
    // Outlook fetch fail is recoverable: the override re-emit only needs
    // the IDs to short-circuit Stage 0; the classifier event payload still
    // requires body_text so we surface a clean error.
    throw new Error(
      `markSafeAndReprocess: outlook fetch failed: ${(e as Error).message}`,
    );
  }

  const operator = await reviewerEmail();
  const nowIso = new Date().toISOString();

  // Mutate the source row first so the optimistic UI removal sticks.
  const merged: SafetyResultShape = {
    ...result,
    safety_overridden: true,
    marked_safe_at: nowIso,
    marked_safe_by: operator,
    safety_outcome: "false_positive", // Phase 64.1
  };
  const { error: updErr } = await admin
    .from("automation_runs")
    .update({
      status: "completed",
      completed_at: nowIso,
      result: merged,
    })
    .eq("id", automation_run_id);
  if (updErr) {
    throw new Error(`automation_runs update failed: ${updErr.message}`);
  }

  // Re-emit Stage 0 with safety_overridden=true (Pitfall 5 short-circuit).
  // Phase 74 D-01 — swarm_type threaded from the source automation_runs
  // row; falls back to "debtor-email" only for legacy rows persisted
  // before Phase 74 (this surface predates the column migration).
  await inngest.send({
    name: "stage-0/email.received",
    data: {
      automation_run_id,
      email_id: result.email_id,
      message_id: result.message_id,
      source_mailbox: result.source_mailbox,
      subject,
      body_text: bodyText,
      swarm_type: swarm_type ?? "debtor-email",
      entity: entity ?? null,
      safety_overridden: true,
    },
  });

  await emitAutomationRunStale(admin, SAFETY_STALE_CHANNEL);
  return { ok: true };
}

export async function dismissSafetyReview(
  automation_run_id: string,
): Promise<{ ok: true }> {
  if (!automation_run_id) {
    throw new Error("dismissSafetyReview: automation_run_id required");
  }
  const admin = createAdminClient();
  const { result, status } = await loadSafetyRow(admin, automation_run_id);
  assertActionable(status, "dismissSafetyReview");

  const operator = await reviewerEmail();
  const nowIso = new Date().toISOString();
  const merged: SafetyResultShape = {
    ...result,
    dismissed_at: nowIso,
    dismissed_by: operator,
    safety_outcome: "true_positive_archived", // Phase 64.1
  };
  const { error: updErr } = await admin
    .from("automation_runs")
    .update({
      status: "completed",
      completed_at: nowIso,
      result: merged,
    })
    .eq("id", automation_run_id);
  if (updErr) {
    throw new Error(`automation_runs update failed: ${updErr.message}`);
  }

  await emitAutomationRunStale(admin, SAFETY_STALE_CHANNEL);
  return { ok: true };
}

export async function escalateToKanban(
  automation_run_id: string,
): Promise<{ ok: true }> {
  if (!automation_run_id) {
    throw new Error("escalateToKanban: automation_run_id required");
  }
  const admin = createAdminClient();
  const { result, entity, mailbox_id, status } = await loadSafetyRow(
    admin,
    automation_run_id,
  );
  assertActionable(status, "escalateToKanban");

  const operator = await reviewerEmail();
  const nowIso = new Date().toISOString();

  // D-11 — reuse the existing Kanban human-review lane. The lane is
  // surfaced by automation_runs rows with status='pending'. Mirrors the
  // budget-breach-handler shape so both Stage 0 escalations land in the
  // same operator surface.
  const { error: insErr } = await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: "pending",
    swarm_type: "debtor-email",
    topic: "safety_escalation",
    entity,
    mailbox_id,
    result: {
      source_automation_run_id: automation_run_id,
      reason: "stage_0_safety_escalation",
      stage: "stage_0_safety",
      escalated_at: nowIso,
      escalated_by: operator,
      safety_outcome: "true_positive_escalated", // Phase 64.1
      // Forward the original verdict context so the Kanban card has
      // everything the operator needs to act without re-querying.
      original_email_id: result.email_id,
      original_message_id: result.message_id,
      source_mailbox: result.source_mailbox,
      regex_matched: result.regex_matched ?? null,
      llm_reason: result.llm_reason ?? null,
      matched_span: result.matched_span ?? null,
    },
    triggered_by: "safety-review-escalation",
  });
  if (insErr) {
    throw new Error(`Kanban escalation insert failed: ${insErr.message}`);
  }

  // Mark the source safety_review row completed so it leaves the queue.
  const merged: SafetyResultShape = {
    ...result,
    escalated_at: nowIso,
    escalated_by: operator,
    safety_outcome: "true_positive_escalated", // Phase 64.1
  };
  const { error: updErr } = await admin
    .from("automation_runs")
    .update({
      status: "completed",
      completed_at: nowIso,
      result: merged,
    })
    .eq("id", automation_run_id);
  if (updErr) {
    throw new Error(`automation_runs update failed: ${updErr.message}`);
  }

  await emitAutomationRunStale(admin, SAFETY_STALE_CHANNEL);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 81 Plan 03 Task 2. Pending Promotion sub-view server actions.
//
// promoteRule / rejectRule are form-action server actions invoked from
// pending-promotion-detail-pane.tsx. Each takes a FormData with rule_key +
// swarm_type and mutates classifier_rules.status accordingly.
//
// Wave 0 Open Q4 grep (rg -n "promoteRule|rejectRule|ci_lo|Wilson"
// web/app/(dashboard)/swarm/) returned no existing UI — actions are
// plumbed fresh here.
//
// loadRuleSamples is a server-side helper invoked from page.tsx when
// sp.sub==="pending" && sp.rule != null. It returns up to N sample emails
// (subject, sender, created_at) that matched the given rule_key, by querying
// pipeline_events.decision_details->>rule_key joined with
// email_pipeline.emails for the metadata. Stage-1 only (no swarm_intents).
// ---------------------------------------------------------------------------

const ruleMutationSchema = z.object({
  rule_key: z.string().min(1),
  swarm_type: z.string().min(1),
});

async function mutateRuleStatus(
  formData: FormData,
  nextStatus: "promoted" | "rejected",
): Promise<void> {
  const parsed = ruleMutationSchema.parse({
    rule_key: formData.get("rule_key"),
    swarm_type: formData.get("swarm_type"),
  });
  const admin = createAdminClient();

  // Verify the rule exists in candidate status before mutating — guards
  // against tampered form submissions promoting arbitrary rule_keys.
  const { data: existing, error: selErr } = await admin
    .from("classifier_rules")
    .select("rule_key, status")
    .eq("swarm_type", parsed.swarm_type)
    .eq("rule_key", parsed.rule_key)
    .single();
  if (selErr || !existing) {
    throw new Error(
      `classifier_rules lookup failed: ${selErr?.message ?? "not found"}`,
    );
  }
  if (existing.status !== "candidate") {
    throw new Error(
      `rule ${parsed.rule_key} is not in candidate status (current=${existing.status})`,
    );
  }

  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "promoted") {
    patch.promoted_at = new Date().toISOString();
  }
  const { error: updErr } = await admin
    .from("classifier_rules")
    .update(patch)
    .eq("swarm_type", parsed.swarm_type)
    .eq("rule_key", parsed.rule_key);
  if (updErr) {
    throw new Error(`classifier_rules update failed: ${updErr.message}`);
  }

  await emitAutomationRunStale(admin, `${parsed.swarm_type}-review`);
}

export async function promoteRule(formData: FormData): Promise<void> {
  await mutateRuleStatus(formData, "promoted");
}

export async function rejectRule(formData: FormData): Promise<void> {
  await mutateRuleStatus(formData, "rejected");
}

export interface RuleSampleRow {
  email_id: string;
  subject: string;
  sender: string;
  created_at: string;
}

/**
 * Fetch up to `limit` sample emails that matched a given rule_key.
 *
 * Reads pipeline_events filtered by swarm_type + decision_details->>rule_key,
 * then joins email_pipeline.emails for the metadata.
 */
export async function loadRuleSamples(
  admin: ReturnType<typeof createAdminClient>,
  swarm_type: string,
  rule_key: string,
  limit = 5,
): Promise<RuleSampleRow[]> {
  // Step 1: collect email_ids from Stage 1 events that matched this rule.
  const { data: evRows, error: evErr } = await admin
    .from("pipeline_events")
    .select("email_id, created_at")
    .eq("swarm_type", swarm_type)
    .eq("stage", 1)
    .eq("decision_details->>rule_key", rule_key)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (evErr) {
    throw new Error(`loadRuleSamples: pipeline_events query failed: ${evErr.message}`);
  }
  const events =
    (evRows as Array<{ email_id: string | null; created_at: string }> | null) ??
    [];
  const emailIds = Array.from(
    new Set(events.map((e) => e.email_id).filter((id): id is string => !!id)),
  );
  if (emailIds.length === 0) return [];

  // Step 2: join email_pipeline.emails for subject + sender.
  const { data: emailRows, error: emErr } = await admin
    .schema("email_pipeline")
    .from("emails")
    .select("id, subject, sender_email, sender_name")
    .in("id", emailIds);
  if (emErr) {
    throw new Error(`loadRuleSamples: emails query failed: ${emErr.message}`);
  }
  const byId = new Map<
    string,
    { subject: string | null; sender_email: string | null; sender_name: string | null }
  >();
  for (const e of (emailRows as Array<{
    id: string;
    subject: string | null;
    sender_email: string | null;
    sender_name: string | null;
  }> | null) ?? []) {
    byId.set(e.id, e);
  }

  // Step 3: assemble in the original Stage-1 event order.
  const out: RuleSampleRow[] = [];
  for (const ev of events) {
    if (!ev.email_id) continue;
    const meta = byId.get(ev.email_id);
    out.push({
      email_id: ev.email_id,
      subject: meta?.subject ?? "",
      sender: meta?.sender_name ?? meta?.sender_email ?? "",
      created_at: ev.created_at,
    });
  }
  return out;
}

export async function fetchReviewEmailBody(
  rowId: string,
): Promise<ReviewEmailBodyResult> {
  console.log("[fetchReviewEmailBody.diag] start", rowId);
  try {
    const admin = createAdminClient();

    // Phase 71-07: Bulk Review rows are now keyed on email_pipeline.emails.id
    // (the new pipeline_events_email_summary view aggregates per email). Try
    // email_pipeline first; fall back to automation_runs for legacy callers.
    {
      const { data: emailRow, error: epErr } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("body_text, body_html")
        .eq("id", rowId)
        .maybeSingle();
      console.log(
        "[fetchReviewEmailBody.diag] email_pipeline lookup",
        JSON.stringify({
          rowId,
          hit: !!emailRow,
          err: epErr?.message ?? null,
          bodyLen: emailRow?.body_text?.length ?? null,
        }),
      );
      if (emailRow) {
        return {
          ok: true,
          bodyText: emailRow.body_text ?? "",
          bodyHtml: emailRow.body_html || null,
        };
      }
    }

    const { data, error } = await admin
      .from("automation_runs")
      .select("result, triggered_by")
      .eq("id", rowId)
      .single();
    if (error || !data) {
      return { ok: false, error: "automation_run not found" };
    }
    const result = (data.result ?? {}) as {
      message_id?: string;
      source_mailbox?: string;
      email_id?: string;
    };

    // Phase 60-08 spot-check rows store the corpus email_id (uuid) in
    // result.email_id and the RFC 5322 internet_message_id in result.message_id.
    // Outlook Graph doesn't accept the RFC ID and the historical corpus is
    // probably no longer in any mailbox anyway — read the body from
    // email_pipeline.emails directly.
    if (data.triggered_by === "corpus-backfill-spotcheck" && result.email_id) {
      const { data: emailRow, error: eErr } = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("body_text, body_html")
        .eq("id", result.email_id)
        .single();
      if (eErr || !emailRow) {
        return { ok: false, error: `email_pipeline lookup failed: ${eErr?.message ?? "not found"}` };
      }
      return {
        ok: true,
        bodyText: emailRow.body_text ?? "",
        bodyHtml: emailRow.body_html || null,
      };
    }

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
    console.error("[fetchReviewEmailBody]", rowId, msg);
    return { ok: false, error: `outlook fetch failed: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Phase 82.6 — Footer Approve wrapper (D-01).
//
// The detail-pane footer "✓ Approve (Stages X+Y)" needs a minimal-arg
// approve surface. The shared _shell/detail-pane.tsx does not carry
// rule_key / predicted_category / message_id / source_mailbox / entity
// on its row prop — those live in automation_runs.result + the joined
// email_pipeline.emails row. This wrapper hydrates the full VerdictInput
// server-side from (row_id, swarm_type) and delegates to recordVerdict.
//
// Stage 1 only. Hard-separation lock: this path reads automation_runs +
// email_pipeline.emails, never swarm_intents. recordVerdict itself is
// Stage-1-pure (writes status='feedback', fires classifier/verdict.recorded
// → classifier-verdict-worker reads swarm_noise_categories.action).
// ---------------------------------------------------------------------------

const approveInputSchema = z.object({
  row_id: z.string().min(1),
  swarm_type: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});

export async function approvePrediction(input: {
  row_id: string;
  swarm_type: string;
  decision: "approve" | "reject";
}): Promise<{ ok: true }> {
  const parsed = approveInputSchema.parse(input);
  const admin = createAdminClient();

  // Hydrate VerdictInput from automation_runs + email_pipeline.emails.
  // Closest precedent: recordVerdict itself at lines 100-104 (single-row
  // automation_runs select). We extend to pull email_id, entity,
  // rule_key, and merge message_id/source_mailbox out of result jsonb
  // with a fallback to the joined emails row.
  const { data: run, error: runErr } = await admin
    .from("automation_runs")
    .select("id, swarm_type, entity, rule_key, result, email_id")
    .eq("id", parsed.row_id)
    .single();

  if (runErr || !run) {
    throw new Error(
      `approvePrediction: automation_runs row not found for id=${parsed.row_id}: ${runErr?.message ?? "no row"}`,
    );
  }

  const result = (run.result as Record<string, unknown> | null) ?? {};
  const predicted_category = typeof result.predicted_category === "string"
    ? result.predicted_category
    : "";
  let message_id = typeof result.message_id === "string" ? result.message_id : "";
  let source_mailbox = typeof result.source_mailbox === "string" ? result.source_mailbox : "";

  // Fallback: if result jsonb is missing message_id / source_mailbox,
  // join email_pipeline.emails for canonical values. Defensive only —
  // Phase 60+ writes both into result jsonb; older rows may not.
  if ((!message_id || !source_mailbox) && run.email_id) {
    const { data: emailRow } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("message_id, source_mailbox")
      .eq("id", run.email_id)
      .maybeSingle();
    if (emailRow) {
      if (!message_id && typeof emailRow.message_id === "string") {
        message_id = emailRow.message_id;
      }
      if (!source_mailbox && typeof emailRow.source_mailbox === "string") {
        source_mailbox = emailRow.source_mailbox;
      }
    }
  }

  if (!predicted_category) {
    throw new Error(
      `approvePrediction: automation_runs.result.predicted_category missing for id=${parsed.row_id}`,
    );
  }
  if (!run.rule_key) {
    throw new Error(
      `approvePrediction: automation_runs.rule_key missing for id=${parsed.row_id}`,
    );
  }
  if (!run.email_id) {
    throw new Error(
      `approvePrediction: automation_runs.email_id missing for id=${parsed.row_id}`,
    );
  }

  return recordVerdict({
    swarm_type: parsed.swarm_type,
    automation_run_id: run.id,
    email_id: run.email_id,
    rule_key: run.rule_key,
    decision: parsed.decision,
    message_id,
    source_mailbox,
    entity: run.entity ?? "",
    predicted_category,
    // No override_category — Approve confirms the prediction as-is.
  });
}
