// Phase 82.4 Plan 05 — Per-stage Option Z list loader.
//
// must_haves (from 82.4-05-PLAN.md):
//   - Loader returns every email that has a verdict at the requested stage
//     (Option Z semantics).
//   - Stage 0 tab shows all incoming emails (depends on Phase 82.2 stage-0
//     coverage backfill).
//   - Pagination: cursor-based on pipeline_events.created_at — same column
//     for the .lt filter AND the returned nextBefore (no drift).
//   - Returns { rows, nextBefore } so the page can offer "load more".
//   - Sort order: needs-action-at-this-stage first, auto-handled second,
//     own-already-reviewed third — within each bucket, received_at desc.
//   - Optional filters: needsActionOnly:boolean, mineOnly:boolean (joins
//     email_feedback on operator_id when true).
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   The loader queries pipeline_events filtered by an explicit `stage`
//   parameter. Stage-1 (noise) vs Stage-3 (intent) hard separation is
//   preserved by the caller passing a different stage value per tab —
//   this module never blurs the two.
//
// Cross-swarm: zero literal swarm-name branches. Sales-email tabs reuse
// the same loader with swarmType='sales-email'.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Closed needs-action decision set used by `needsActionOnly` and by the
 * `sort_bucket` derivation. Values mirror the stage-specific decision
 * vocabulary actually emitted into pipeline_events today:
 *   - Stage 0 ("injection_suspected", "unknown_legacy") — Phase 82.2 backfill
 *     (web/lib/inngest/functions/stage-0-backfill.ts L63, L200).
 *   - Stage 1 ("unknown") — closed-list category classifier fall-through
 *     (docs/agentic-pipeline/stage-1-regex.md, RFC).
 *   - Stage 3 ("low_confidence") — Kanban-reason wiring
 *     (web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx L101).
 *   - "needs_review" — generic 82.x audit flag carried through several
 *     surfaces.
 * If a new stage introduces a different needs-action token, extend this
 * list with a code comment naming the source file + line.
 */
const NEEDS_ACTION_DECISIONS: readonly string[] = [
  "needs_review",
  "unknown",
  "low_confidence",
  "injection_suspected",
  "unknown_legacy",
] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface FeedbackListParams {
  stage: 0 | 1 | 2 | 3;
  swarmType: string;
  /** ISO timestamp cursor: only return rows with pipeline_events.created_at < before. */
  before?: string;
  /** Restrict to rows whose pipeline_events.decision is in the needs-action set. */
  needsActionOnly?: boolean;
  /** Restrict to emails where the current operator has at least one email_feedback row. */
  mineOnly?: boolean;
  /** Server-stamped operator_id; required when mineOnly=true. */
  operatorId?: string;
  /** Page size. Default 50, capped at 100. */
  limit?: number;
}

export interface FeedbackListRow {
  email_id: string;
  pipeline_event_id: string;
  stage: 0 | 1 | 2 | 3;
  stage_state: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string;
  mailbox_id: number | null;
  sort_bucket: "needs_action" | "auto_handled" | "own_reviewed";
  own_latest_verdict: "confirm" | "override" | "unclear" | null;
  own_latest_at: string | null;
}

export interface FeedbackListPage {
  rows: FeedbackListRow[];
  /** ISO timestamp to feed back as `before` for next page; null when no more rows. */
  nextBefore: string | null;
}

interface PipelineEventRow {
  id: string;
  email_id: string;
  stage: number;
  decision: string;
  created_at: string;
}

interface EmailMetaRow {
  id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string | null;
  mailbox_id: number | null;
}

interface FeedbackRow {
  email_id: string;
  stage: number;
  verdict: "confirm" | "override" | "unclear";
  operator_id: string;
  created_at: string;
}

export async function loadStageFeedbackList(
  admin: SupabaseClient,
  params: FeedbackListParams,
): Promise<FeedbackListPage> {
  const limit = Math.min(
    Math.max(1, params.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  // Defensive: mineOnly without operatorId returns empty rather than leaking
  // cross-operator history. V10.0 multi-operator handling will replace this
  // with proper RLS scoping (CONTEXT <out_of_scope>).
  if (params.mineOnly && !params.operatorId) {
    return { rows: [], nextBefore: null };
  }

  // Query 1: pipeline_events for this (swarm, stage).
  // Fetch limit*2 so the bucket-sort + drop-missing-email passes have room
  // before we truncate to `limit`.
  let peQuery = admin
    .from("pipeline_events")
    .select("id, email_id, stage, decision, created_at")
    .eq("swarm_type", params.swarmType)
    .eq("stage", params.stage);

  if (params.needsActionOnly) {
    peQuery = peQuery.in("decision", NEEDS_ACTION_DECISIONS as unknown as string[]);
  }
  if (params.before) {
    peQuery = peQuery.lt("created_at", params.before);
  }

  const peRes = await peQuery
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  if (peRes.error) {
    throw new Error(`loadStageFeedbackList: ${peRes.error.message}`);
  }
  const peRows = (peRes.data ?? []) as PipelineEventRow[];
  if (peRows.length === 0) {
    return { rows: [], nextBefore: null };
  }

  const emailIds = Array.from(new Set(peRows.map((r) => r.email_id)));

  // Queries 2 + 3 run in parallel (mirror kanban-loader pattern).
  const emailsPromise = admin
    .schema("email_pipeline")
    .from("emails")
    .select("id, subject, sender_email, sender_name, received_at, mailbox_id")
    .in("id", emailIds);

  let feedbackQuery = admin
    .from("email_feedback")
    .select("email_id, stage, verdict, operator_id, created_at")
    .eq("stage", params.stage)
    .in("email_id", emailIds);
  if (params.operatorId) {
    feedbackQuery = feedbackQuery.eq("operator_id", params.operatorId);
  }
  const feedbackPromise = feedbackQuery.order("created_at", {
    ascending: false,
  });

  const [emailsRes, feedbackRes] = await Promise.all([
    emailsPromise,
    feedbackPromise,
  ]);

  if (emailsRes.error) {
    throw new Error(
      `loadStageFeedbackList: emails join failed: ${emailsRes.error.message}`,
    );
  }
  if (feedbackRes.error) {
    throw new Error(
      `loadStageFeedbackList: email_feedback join failed: ${feedbackRes.error.message}`,
    );
  }

  const emailMap = new Map<string, EmailMetaRow>();
  for (const e of ((emailsRes.data ?? []) as EmailMetaRow[])) {
    emailMap.set(e.id, e);
  }

  // First-write-wins on email_feedback: rows arrive newest-first (ORDER BY
  // created_at DESC), so the FIRST hit per email_id is the latest verdict.
  const feedbackMap = new Map<
    string,
    { verdict: "confirm" | "override" | "unclear"; created_at: string }
  >();
  for (const f of ((feedbackRes.data ?? []) as FeedbackRow[])) {
    if (!feedbackMap.has(f.email_id)) {
      feedbackMap.set(f.email_id, {
        verdict: f.verdict,
        created_at: f.created_at,
      });
    }
  }

  // Merge — drop rows whose email row is missing (deleted upstream).
  interface InternalRow extends FeedbackListRow {
    _pe_created_at: string;
  }
  const merged: InternalRow[] = [];
  for (const pe of peRows) {
    const email = emailMap.get(pe.email_id);
    if (!email) continue; // Drop: upstream email row gone.

    const ownFeedback = feedbackMap.get(pe.email_id) ?? null;
    const isNeedsAction = NEEDS_ACTION_DECISIONS.includes(pe.decision);

    let sort_bucket: FeedbackListRow["sort_bucket"];
    if (isNeedsAction) {
      sort_bucket = "needs_action";
    } else if (ownFeedback !== null) {
      sort_bucket = "own_reviewed";
    } else {
      sort_bucket = "auto_handled";
    }

    merged.push({
      email_id: pe.email_id,
      pipeline_event_id: pe.id,
      stage: params.stage,
      stage_state: pe.decision,
      subject: email.subject,
      sender_email: email.sender_email,
      sender_name: email.sender_name,
      received_at: email.received_at ?? pe.created_at,
      mailbox_id: email.mailbox_id,
      sort_bucket,
      own_latest_verdict: ownFeedback ? ownFeedback.verdict : null,
      own_latest_at: ownFeedback ? ownFeedback.created_at : null,
      _pe_created_at: pe.created_at,
    });
  }

  // Apply mineOnly AFTER merge: keep only rows where the operator already
  // has a feedback row at this stage.
  const filtered = params.mineOnly
    ? merged.filter((r) => r.own_latest_verdict !== null)
    : merged;

  // Sort: bucket priority (needs_action < auto_handled < own_reviewed),
  // then received_at desc.
  const BUCKET_PRIORITY: Record<FeedbackListRow["sort_bucket"], number> = {
    needs_action: 0,
    auto_handled: 1,
    own_reviewed: 2,
  };
  filtered.sort((a, b) => {
    const ba = BUCKET_PRIORITY[a.sort_bucket];
    const bb = BUCKET_PRIORITY[b.sort_bucket];
    if (ba !== bb) return ba - bb;
    // received_at desc — string ISO compare works.
    if (a.received_at > b.received_at) return -1;
    if (a.received_at < b.received_at) return 1;
    return 0;
  });

  const truncated = filtered.slice(0, limit);
  // nextBefore = pipeline_events.created_at of the last surfaced row
  // (SAME column as the .lt filter on pipeline_events — no drift across pages).
  const nextBefore =
    truncated.length === limit
      ? truncated[truncated.length - 1]._pe_created_at
      : null;

  // Strip the internal cursor field from the public shape.
  const rows: FeedbackListRow[] = truncated.map((r) => {
    const { _pe_created_at: _omit, ...rest } = r;
    void _omit;
    return rest;
  });

  return { rows, nextBefore };
}
