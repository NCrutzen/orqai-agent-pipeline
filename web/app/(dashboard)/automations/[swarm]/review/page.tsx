// Phase 56.7-03 (D-08, D-13, D-14, D-15). Generic queue page mounted at
// /automations/[swarm]/review. Reads the swarm registry (Wave 1) so adding
// a new swarm is a `swarms` row INSERT, not a new route.
//
// Original: web/app/(dashboard)/automations/debtor-email-review/page.tsx
// (Phase 60-05). Behaviour is unchanged for the debtor-email seed; the
// hardcoded 'debtor-email' literals are now sourced from `params.swarm`
// and the registry's per-swarm config.
//
// Phase 60-05 / 61-02 layout retained:
//   3-column grid [clamp(220px,18vw,280px) minmax(380px,460px) 1fr],
//   max-w-[1600px], min-w-0 hygiene on every child. ?selected=<row-id>
//   loads a single row server-side and feeds the right-column DetailPane.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMessageBody } from "@/lib/outlook";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import {
  loadSwarm,
  loadSwarmCategories,
  loadSwarmIntents,
} from "@/lib/swarms/registry";
import type {
  SwarmCategoryRow,
  SwarmIntentRow,
  SwarmRow,
} from "@/lib/swarms/types";
import { QueueTree } from "./queue-tree";
import { RowList } from "./row-list";
import { DetailPane } from "./detail-pane";
import { KeyboardShortcuts, Cheatsheet } from "./keyboard-shortcuts";
import { SelectionProvider } from "./selection-context";
// Phase 65-05 (CORD-03 surface). Debtor-email-only enrichment for now;
// when Phase 71 broadens the loader to cross-swarm coordinator_runs the
// import path moves under a generic _lib here. Server-side only.
import {
  loadCoordinatorRunsForReview,
  type CoordinatorRunSummary,
} from "../../debtor-email/_lib/coordinator-runs-loader";
// Phase 67-06 (D-08, R-03, TAG-03 surface). Debtor-email-only enrichment for
// iController tagging failures. Mirrors the coordinator-runs-loader shape.
import {
  loadTaggingFailuresForReview,
  type TaggingFailureSummary,
} from "../../debtor-email/_lib/tagging-failures-loader";

export const dynamic = "force-dynamic";

export interface PageSearchParams {
  topic?: string;
  entity?: string;
  mailbox?: string;
  rule?: string;
  tab?: string;
  before?: string;
  selected?: string;
}

export interface QueueCountRow {
  swarm_type: string;
  topic: string | null;
  entity: string | null;
  mailbox_id: number | null;
  count: number;
}

export interface PromotedRule {
  rule_key: string;
  promoted_at: string;
}

export interface ClassifierCandidate {
  rule_key: string;
  status: string;
  n: number;
  ci_lo: number | null;
}

export interface PredictedRow {
  id: string;
  automation: string;
  status: string;
  swarm_type: string | null;
  topic: string | null;
  entity: string | null;
  mailbox_id: number | null;
  result: unknown;
  created_at: string;
  /**
   * Phase 71-03 D-10. Per-stage decisions sourced from
   * public.pipeline_events_email_summary (view-driven feed). Plan 04 UI
   * renders these as per-stage cells in the row strip. Stage 0 is included
   * (safety) for completeness; downstream UI may choose to ignore it.
   */
  stage_decisions?: {
    0?: string | null;
    1?: string | null;
    2?: string | null;
    3?: string | null;
    4?: string | null;
  };
  /**
   * Phase 71-03 D-10. Per-stage override flags for stages 1..4. True when
   * any pipeline_events row at that stage carries a non-null override
   * jsonb. Sourced from the view's bool_or aggregate.
   */
  stage_overridden?: {
    1?: boolean | null;
    2?: boolean | null;
    3?: boolean | null;
    4?: boolean | null;
  };
  /**
   * Phase 71-03 D-10. View-derived rollups. total_cost_cents SUMs all
   * pipeline_events rows for the email (cross-stage). tool_call_count
   * counts Stage-4 events with decision_details ? 'tool_calls'.
   */
  total_cost_cents?: number | null;
  tool_call_count?: number | null;
  first_event_at?: string | null;
  last_event_at?: string | null;
  /**
   * Phase 64-05 (BUDG-03 / D-17). Computed at read time by the
   * `automation_runs_with_outlier` RPC. False when the 7-day sample
   * window has <100 entries (Pitfall 6 bootstrap guard) or when the
   * row is not part of any outlier query.
   */
  is_cost_outlier?: boolean;
  /** Phase 64-05 (BUDG-03). Per-row median/sample window metadata
   *  threaded from the same RPC so the AXIS 4 card can render the
   *  human readout ("N cents — Mx rolling 7-day median") without a
   *  second roundtrip. */
  median_cost_cents?: number | null;
  sample_count?: number;
  cost_cents?: number;
  /**
   * Phase 65-05 (CORD-03 surface). Joined from public.coordinator_runs by
   * automation_run_id. Present only for swarms that write coordinator_runs
   * (debtor-email today; cross-swarm in Phase 71).
   */
  coordinator?: CoordinatorRunSummary;
  /**
   * Phase 67-06 (D-08, R-03, TAG-03 surface). Joined from debtor.email_labels
   * by email_id (extracted from result.email_id). Present only when the row's
   * iController tagging side-effect failed; successful and skipped statuses
   * are not enriched. debtor-email swarm only today.
   */
  tagging?: TaggingFailureSummary;
}

/**
 * Phase 71-05. Raw pipeline_events row used to drive the detail-pane's
 * N-stage PipelineFlow. We expose the full timeline (all stages for the
 * selected email) rather than just the single ?selected= row so the
 * detail-pane can mark stages as ok / dirty / skipped per UI-SPEC.
 */
export interface PipelineTimelineEvent {
  id: string;
  created_at: string;
  swarm_type: string;
  stage: number;
  email_id: string | null;
  decision: string;
  confidence: number | null;
  decision_details: Record<string, unknown> | null;
  override: Record<string, unknown> | null;
  eval_type: "capability" | "regression" | null;
  triggered_by: string | null;
}

/**
 * Phase 71-05 (UI-SPEC §Recipient chip strip). One chip per recipient
 * inbox in the predicted-row feed. brand drives the deterministic
 * brand-dot colour via brandColorToken.
 */
export interface RecipientChip {
  inbox: string;
  brand: string;
  rowCount: number;
}

export interface PageData {
  counts: QueueCountRow[];
  rows: PredictedRow[];
  promotedToday: PromotedRule[];
  candidates: ClassifierCandidate[];
  selectedRow: PredictedRow | null;
  /** Phase 71-05. Full pipeline_events timeline for the selected email. */
  selectedTimeline: PipelineTimelineEvent[];
  /** Phase 71-05. Recipient chip strip data. */
  recipientChips: RecipientChip[];
  /** Phase 71-08. Pre-fetched body for the selected email. */
  selectedBody: { bodyText: string; bodyHtml: string | null } | null;
  /** Phase 71-08. Pre-fetched bodies for all visible rows, keyed by email_id.
   *  Used to seed the client-side bodyCache so clicking any row paints
   *  synchronously (selection-context updates don't re-render the server). */
  bodyMap: Record<string, { bodyText: string; bodyHtml: string | null }>;
}

/**
 * Test-friendly data loader. Pure function over an admin-client-shaped
 * dependency. Used by the React server component below and by the
 * vitest queue tests directly (no need to render the JSX shell).
 *
 * `swarmType` threads the dynamic-segment value through every Supabase
 * call so the same loader serves any swarm row in the registry (D-08).
 */
export async function loadPageData(
  params: PageSearchParams,
  admin: ReturnType<typeof createAdminClient>,
  swarmType: string,
): Promise<PageData> {
  // ---------------------------------------------------------------------
  // Phase 70 TELE-03 scope (per RESEARCH Pitfall 5)
  //
  // The 8 sub-queries inside loadPageData and their disposition:
  //   (1) RPC classifier_queue_counts             — OUT-OF-SCOPE (line ~163)
  //   (2) predicted-row feed (was automation_runs)— IN-SCOPE: now reads
  //                                                 public.pipeline_events
  //                                                 (line ~177)
  //   (3) RPC automation_runs_with_outlier        — IN-SCOPE per Pitfall 5
  //                                                 BUT pragmatically left
  //                                                 on automation_runs in
  //                                                 v1 — the RPC encapsulates
  //                                                 join logic. Phase 72 may
  //                                                 move to pipeline_events.
  //                                                 cost_cents aggregations.
  //                                                 (line ~205)
  //   (4) classifier_rules promoted-today         — OUT-OF-SCOPE (line ~245)
  //   (5) classifier_rules pending-promotions     — OUT-OF-SCOPE (line ~257)
  //   (6) selected-row detail (was automation_runs)— IN-SCOPE: now reads
  //                                                  public.pipeline_events
  //                                                  (line ~277)
  //   (7) loadCoordinatorRunsForReview            — OUT-OF-SCOPE side-loader
  //   (8) loadTaggingFailuresForReview            — OUT-OF-SCOPE side-loader
  //
  // D-16 atomic replacement — old automation_runs SELECTs at (2) and (6)
  // are REMOVED, not commented-out; revert is via git.
  // ---------------------------------------------------------------------

  // 1. Counts: single RPC, GROUP BY (swarm_type, topic, entity, mailbox_id).
  const countsRes = await admin.rpc("classifier_queue_counts", {
    p_swarm_type: swarmType,
  });
  const counts = (countsRes.data as QueueCountRow[] | null) ?? [];

  // 2. Predicted rows: cursor pagination, page-size 100.
  //
  // Phase 70 TELE-03 (D-14): reads from public.pipeline_events filtered by
  // swarm_type AND stage=1 (Stage 1 regex decisions) — this is the
  // canonical predicted-row feed. The shape is mapped to PredictedRow so
  // downstream RowList / DetailPane components see the same fields they
  // saw under automation_runs (id, swarm_type, topic via decision_details,
  // result via decision_details, created_at).
  //
  // Phase 64-05 (SAFE-02 / SAFE-04): when params.tab==='safety', filter on
  // topic='safety_review' so the Safety Review tab only shows Stage 0
  // injection-suspected rows. Under the pipeline_events feed this maps to
  // stage=0 + decision='injection_suspected'.
  let rows: PredictedRow[];
  interface PipelineEventRow {
    id: string;
    created_at: string;
    swarm_type: string;
    stage: number;
    email_id: string | null;
    decision: string;
    confidence: number | null;
    decision_details: Record<string, unknown> | null;
    automation_run_id: string | null;
    agent_run_id: string | null;
  }
  function mapEventToPredictedRow(e: PipelineEventRow): PredictedRow {
    const details = (e.decision_details ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      automation: `${e.swarm_type}-review`,
      status: "predicted",
      swarm_type: e.swarm_type,
      topic: (details.topic as string | undefined) ?? e.decision ?? null,
      entity: (details.entity as string | undefined) ?? null,
      mailbox_id: (details.mailbox_id as number | undefined) ?? null,
      // Preserve the entire decision_details as `result` so DetailPane and
      // existing consumers (which read fields like result.email_id,
      // result.stage, result.regex_matched, etc.) keep working without
      // touching their code. Also stamp email_id at the top level for the
      // tagging-failure side-loader (sub-query 8) which reads
      // result.email_id.
      result: { ...details, email_id: e.email_id },
      created_at: e.created_at,
    };
  }

  if (params.tab === "safety") {
    const safetyQuery = admin
      .from("pipeline_events")
      .select(
        "id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, automation_run_id, agent_run_id",
      )
      .eq("swarm_type", swarmType)
      .eq("stage", 0)
      .eq("decision", "injection_suspected")
      .order("created_at", { ascending: false })
      .limit(100);
    if (params.before) safetyQuery.lt("created_at", params.before);
    const safetyRes = await safetyQuery;
    const safetyEvents =
      (safetyRes.data as PipelineEventRow[] | null) ?? [];
    const safetyRows = safetyEvents.map(mapEventToPredictedRow);

    // Phase 70 TELE-03: outlier RPC stays on automation_runs for v1 —
    // Phase 72 may move to pipeline_events.cost_cents aggregations.
    // The RPC keys by automation_runs.id; we map by automation_run_id
    // on the event so the outlier flag still lights up the correct row.
    const outlierRes = await admin.rpc("automation_runs_with_outlier", {
      p_swarm_type: swarmType,
    });
    interface OutlierRow {
      id: string;
      is_cost_outlier: boolean;
      cost_cents: number;
      median_cost_cents: number | null;
      sample_count: number;
    }
    const outlierMap = new Map<string, OutlierRow>();
    for (const o of (outlierRes.data as OutlierRow[] | null) ?? []) {
      outlierMap.set(o.id, o);
    }
    rows = safetyRows.map((r, idx) => {
      const ev = safetyEvents[idx];
      const lookupId = ev.automation_run_id ?? r.id;
      const o = outlierMap.get(lookupId);
      return {
        ...r,
        is_cost_outlier: o?.is_cost_outlier ?? false,
        cost_cents: o?.cost_cents ?? 0,
        median_cost_cents: o?.median_cost_cents ?? null,
        sample_count: o?.sample_count ?? 0,
      };
    });
  } else {
    // Phase 71-03 D-10. Predicted-row feed reads from the per-email
    // aggregate view (one row per email). Selected-row detail (sub-query 5
    // below) STAYS on raw public.pipeline_events for the per-stage timeline.
    //
    // Filter handling (decision_details->>topic / entity / mailbox_id / rule):
    // the view does not denormalise decision_details. v1 simplification —
    // when filters are active, JOIN-back to raw pipeline_events to find
    // matching email_ids first, then constrain the view query to that set.
    // Promote the filter into the view (or a new RPC) if perf becomes an
    // issue (RESEARCH §Pitfall 7).
    interface SummaryRow {
      email_id: string;
      swarm_type: string;
      // Phase 71-08: email metadata joined from email_pipeline.emails.
      subject: string | null;
      sender_email: string | null;
      sender_name: string | null;
      recipient_mailbox: string | null;
      email_received_at: string | null;
      stage_0_decision: string | null;
      stage_1_decision: string | null;
      stage_2_decision: string | null;
      stage_3_decision: string | null;
      stage_4_decision: string | null;
      stage_1_overridden: boolean | null;
      stage_2_overridden: boolean | null;
      stage_3_overridden: boolean | null;
      stage_4_overridden: boolean | null;
      total_cost_cents: number | null;
      tool_call_count: number | null;
      first_event_at: string | null;
      last_event_at: string | null;
    }

    let filterEmailIds: string[] | null = null;
    const hasFilters = !!(
      params.topic ||
      params.entity ||
      params.mailbox ||
      params.rule
    );
    if (hasFilters) {
      // JOIN-back: collect email_ids from raw pipeline_events that match the
      // active filter (Stage-1 events; matches the Phase 70-06 semantics).
      const filterQuery = admin
        .from("pipeline_events")
        .select("email_id")
        .eq("swarm_type", swarmType)
        .eq("stage", 1)
        .order("created_at", { ascending: false })
        .limit(500);
      // Phase 71-08 fix: the legacy automation_runs.topic column held the
      // matched category (e.g. "unknown" / "payment_admittance"). For the
      // view-driven feed the equivalent lives on pipeline_events.decision
      // for Stage 1 emits. ?topic=unknown therefore maps to decision='unknown'.
      if (params.topic) filterQuery.eq("decision", params.topic);
      if (params.entity) filterQuery.eq("decision_details->>entity", params.entity);
      if (params.mailbox) {
        const mb = parseInt(params.mailbox, 10);
        if (!Number.isNaN(mb)) {
          filterQuery.eq("decision_details->>mailbox_id", String(mb));
        }
      }
      // Stage 1 emit stores the regex rule_key at decision_details.regex_rule_id
      // (not decision_details.predicted.rule).
      if (params.rule) {
        filterQuery.eq("decision_details->>regex_rule_id", params.rule);
      }
      const filterRes = await filterQuery;
      const filterRows =
        (filterRes.data as Array<{ email_id: string | null }> | null) ?? [];
      filterEmailIds = Array.from(
        new Set(
          filterRows
            .map((r) => r.email_id)
            .filter((id): id is string => !!id),
        ),
      );
    }

    function mapSummaryToPredictedRow(row: SummaryRow): PredictedRow {
      return {
        id: row.email_id,
        automation: `${row.swarm_type}-review`,
        status: "predicted",
        swarm_type: row.swarm_type,
        topic: row.stage_1_decision ?? null,
        entity: null,
        mailbox_id: null,
        // Phase 71-08: surface email metadata from the view JOIN to email_pipeline.emails
        // so the row strip and detail pane render real subject + sender + recipient
        // instead of "(no subject)" / "unknown sender".
        result: {
          email_id: row.email_id,
          subject: row.subject ?? undefined,
          from: row.sender_email ?? undefined,
          fromName: row.sender_name ?? undefined,
          source_mailbox: row.recipient_mailbox ?? undefined,
          predicted: row.stage_1_decision
            ? { category: row.stage_1_decision }
            : undefined,
        },
        created_at: row.email_received_at ?? row.last_event_at ?? new Date(0).toISOString(),
        stage_decisions: {
          0: row.stage_0_decision,
          1: row.stage_1_decision,
          2: row.stage_2_decision,
          3: row.stage_3_decision,
          4: row.stage_4_decision,
        },
        stage_overridden: {
          1: row.stage_1_overridden,
          2: row.stage_2_overridden,
          3: row.stage_3_overridden,
          4: row.stage_4_overridden,
        },
        total_cost_cents: row.total_cost_cents,
        tool_call_count: row.tool_call_count,
        first_event_at: row.first_event_at,
        last_event_at: row.last_event_at,
      };
    }

    interface SummaryQuery {
      select: (cols: string) => SummaryQuery;
      eq: (col: string, val: unknown) => SummaryQuery;
      lt: (col: string, val: unknown) => SummaryQuery;
      in: (col: string, vals: unknown[]) => SummaryQuery;
      order: (col: string, opts?: unknown) => SummaryQuery;
      limit: (n: number) => SummaryQuery;
      then: <T>(cb: (v: { data: SummaryRow[] | null; error: unknown }) => T) => Promise<T>;
    }
    // Phase 71-08: filter to emails awaiting operator review. The view aggregates
    // every email with a Stage 1 emit — including auto-actioned ones whose
    // automation_runs row is already 'completed'. Resolve the predicted-status
    // email_ids via automation_runs.result.message_id → email_pipeline.emails.id.
    const predictedRunsRes = await admin
      .from("automation_runs")
      .select("result")
      .eq("swarm_type", swarmType)
      .eq("status", "predicted");
    const predictedMessageIds = ((predictedRunsRes.data ?? []) as Array<{ result: { message_id?: string } | null }>)
      .map((r) => r.result?.message_id)
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    let predictedEmailIds: string[] = [];
    if (predictedMessageIds.length > 0) {
      const peRes = await admin
        .schema("email_pipeline")
        .from("emails")
        .select("id")
        .in("source_id", predictedMessageIds);
      predictedEmailIds = ((peRes.data ?? []) as Array<{ id: string }>).map((e) => e.id);
    }
    console.log(
      "[bulk-review.diag]",
      JSON.stringify({
        swarmType,
        predictedRunsCount: predictedRunsRes.data?.length ?? 0,
        predictedMessageIdsCount: predictedMessageIds.length,
        predictedEmailIdsCount: predictedEmailIds.length,
        predictedRunsErr: (predictedRunsRes as { error?: { message?: string } }).error?.message ?? null,
      }),
    );

    // Phase 71-08: filter via in-memory JS rather than .in() with 80+ uuids,
    // which can produce a PostgREST URL >8KB and time out / fail silently.
    // Fetch the most-recent 200 view rows for this swarm, then filter to the
    // predicted whitelist and slice to 100. Cheap because the view is small.
    const effectiveFilterSet = new Set<string>(
      filterEmailIds === null
        ? predictedEmailIds
        : predictedEmailIds.filter((id) => filterEmailIds!.includes(id)),
    );
    const listQuery = (admin.from("pipeline_events_email_summary") as unknown as SummaryQuery)
      .select(
        "email_id, swarm_type, subject, sender_email, sender_name, recipient_mailbox, email_received_at, " +
          "stage_0_decision, stage_1_decision, stage_2_decision, stage_3_decision, stage_4_decision, " +
          "stage_1_overridden, stage_2_overridden, stage_3_overridden, stage_4_overridden, " +
          "total_cost_cents, tool_call_count, first_event_at, last_event_at",
      )
      .eq("swarm_type", swarmType)
      .order("last_event_at", { ascending: false })
      .limit(200);
    if (params.before) listQuery.lt("last_event_at", params.before);
    const listRes = await listQuery;
    console.log(
      "[bulk-review.diag] listRes",
      JSON.stringify({
        dataCount: (listRes.data as SummaryRow[] | null)?.length ?? 0,
        err: (listRes as { error?: { message?: string } }).error?.message ?? null,
        effectiveFilterCount: effectiveFilterSet.size,
      }),
    );
    const summaryRows = (
      ((listRes.data as SummaryRow[] | null) ?? []).filter((r) =>
        effectiveFilterSet.has(r.email_id),
      )
    ).slice(0, 100);
    rows = summaryRows.map(mapSummaryToPredictedRow);
  }

  // 3. Today's promoted rules — race-cohort surfacing (D-21).
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const promotedRes = await admin
    .from("classifier_rules")
    .select("rule_key, promoted_at")
    .eq("swarm_type", swarmType)
    .eq("status", "promoted")
    .gte("promoted_at", todayMidnight.toISOString());
  const promotedToday = (promotedRes.data as PromotedRule[] | null) ?? [];

  // 4. Pending-promotion candidates. In Phase 61-02 the Pending node lives
  //    in the queue tree as a sibling, so we always fetch the count.
  //    classifier_rules is small; the added cost is negligible.
  let candidates: ClassifierCandidate[] = [];
  if (params.tab === "pending") {
    // Full payload only when the pending pane is rendered.
    const candRes = await admin
      .from("classifier_rules")
      .select("rule_key, status, n, ci_lo")
      .eq("swarm_type", swarmType)
      .eq("status", "candidate");
    candidates = (candRes.data as ClassifierCandidate[] | null) ?? [];
  } else {
    // Tree-badge count only — fetch the rule_key list (cheap).
    const candRes = await admin
      .from("classifier_rules")
      .select("rule_key, status, n, ci_lo")
      .eq("swarm_type", swarmType)
      .eq("status", "candidate");
    candidates = (candRes.data as ClassifierCandidate[] | null) ?? [];
  }

  // 5. Selected row for the detail pane (?selected=<id>). Separate query
  //    so the list query is not widened by an OR clause. Returns null when
  //    no selection or the id is no longer in the predicted set.
  //
  // Phase 70 TELE-03 (D-14, D-16): reads from pipeline_events; the row id in
  // the URL is now the pipeline_events.id, since the row list comes from
  // pipeline_events.
  let selectedRow: PredictedRow | null = null;
  // Phase 71-08: Bulk Review row id is now an email_id (uuid in
  // email_pipeline.emails). Resolve the selected row directly from rows[]
  // so the detail pane gets the same metadata the row strip already shows.
  if (params.selected) {
    const fromRows = rows.find((r) => r.id === params.selected) ?? null;
    if (fromRows) {
      selectedRow = fromRows;
    } else {
      // Legacy fallback for callers that still pass a pipeline_events.id.
      const selRes = await admin
        .from("pipeline_events")
        .select(
          "id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, automation_run_id, agent_run_id",
        )
        .eq("id", params.selected)
        .single();
      const selEvent = (selRes.data as PipelineEventRow | null) ?? null;
      selectedRow = selEvent ? mapEventToPredictedRow(selEvent) : null;
    }
  }

  // Phase 71-08 body preload: fetch bodies for ALL rows server-side and
  // pass to DetailPane via initialBodyMap. Client-side row selection updates
  // selection-context without re-rendering this server component, so seeding
  // only the initial selected row's body wasn't enough — clicking a different
  // row would fall through to the (hanging) fetchReviewEmailBody Server Action.
  // Bulk preload is cheap: ~30 rows × ~500 char body = ~15KB payload.
  let initialBodyMap: Record<string, { bodyText: string; bodyHtml: string | null }> = {};
  let initialSelectedBody: { bodyText: string; bodyHtml: string | null } | null = null;
  if (rows.length > 0) {
    const allEmailIds = rows.map((r) => r.id).filter(Boolean);
    const { data: emailBodies } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, source_id, mailbox, body_text, body_html")
      .in("id", allEmailIds);
    const bodyRowsByEmailId = new Map<
      string,
      { source_id: string | null; mailbox: string | null; body_text: string | null; body_html: string | null }
    >();
    for (const e of (emailBodies as Array<{
      id: string;
      source_id: string | null;
      mailbox: string | null;
      body_text: string | null;
      body_html: string | null;
    }> | null) ?? []) {
      bodyRowsByEmailId.set(e.id, e);
      initialBodyMap[e.id] = {
        bodyText: e.body_text ?? "",
        bodyHtml: e.body_html || null,
      };
    }
    // Phase 71-08: Outlook fallback for the selected row only. Historical
    // emails backfilled by SQL have body_text=NULL because the Phase 70
    // dual-write didn't capture them. Fetch from Microsoft Graph as a one-off
    // for the row the operator is actually looking at, so the detail pane
    // doesn't render an empty blob.
    if (selectedRow) {
      const stored = bodyRowsByEmailId.get(selectedRow.id);
      if (stored && (stored.body_text ?? "").trim().length === 0 && stored.source_id && stored.mailbox) {
        try {
          const fetched = await fetchMessageBody(stored.mailbox, stored.source_id);
          if (fetched.bodyText || fetched.bodyHtml) {
            initialBodyMap[selectedRow.id] = {
              bodyText: fetched.bodyText ?? "",
              bodyHtml: fetched.bodyHtml || null,
            };
            // Persist for next time so we don't re-hit Graph.
            await admin
              .schema("email_pipeline")
              .from("emails")
              .update({
                body_text: fetched.bodyText ?? null,
                body_html: fetched.bodyHtml ?? null,
              })
              .eq("id", selectedRow.id);
          }
        } catch {
          // Outlook fetch failed (deleted message, auth issue, etc). Leave
          // the empty body in place so the operator sees the metadata at least.
        }
      }
      if (initialBodyMap[selectedRow.id]) {
        initialSelectedBody = initialBodyMap[selectedRow.id];
      }
    }
  }

  // 6. Phase 65-05 (CORD-03 surface) — coordinator_runs join for debtor-email.
  //    Server-side, single bulk query keyed on the predicted-page row ids;
  //    rows without a coordinator_runs entry stay un-enriched (loader returns
  //    a sparse Map). Phase 71 broadens this to cross-swarm.
  if (swarmType === "debtor-email" && rows.length > 0) {
    const coordinatorMap = await loadCoordinatorRunsForReview(
      rows.map((r) => r.id),
    );
    if (coordinatorMap.size > 0) {
      rows = rows.map((r) => {
        const coord = coordinatorMap.get(r.id);
        return coord ? { ...r, coordinator: coord } : r;
      });
      if (selectedRow) {
        const coord = coordinatorMap.get(selectedRow.id);
        if (coord) selectedRow = { ...selectedRow, coordinator: coord };
      }
    }
  }

  // 7. Phase 67-06 (D-08, R-03, TAG-03 surface) — debtor-email tagging-failure
  //    enrichment. Same pattern as the coordinator_runs JOIN above; surfaces
  //    rows where the iController tagging side-effect failed so Bulk Review
  //    can render a deferred-run badge + screenshot links. The loader joins
  //    debtor.email_labels via the email_id extracted from result.email_id.
  if (swarmType === "debtor-email" && rows.length > 0) {
    const pairs = rows
      .map((r) => {
        const emailId =
          (r.result as { email_id?: string } | null)?.email_id ?? null;
        return emailId
          ? { automation_run_id: r.id, email_id: emailId }
          : null;
      })
      .filter(
        (p): p is { automation_run_id: string; email_id: string } =>
          p !== null,
      );
    if (pairs.length > 0) {
      const taggingMap = await loadTaggingFailuresForReview(pairs);
      if (taggingMap.size > 0) {
        rows = rows.map((r) => {
          const t = taggingMap.get(r.id);
          return t ? { ...r, tagging: t } : r;
        });
        if (selectedRow) {
          const t = taggingMap.get(selectedRow.id);
          if (t) selectedRow = { ...selectedRow, tagging: t };
        }
      }
    }
  }

  // 8. Phase 71-05. Full pipeline_events timeline for the selected email.
  //    Detail pane renders this as the N-stage PipelineFlow. We key on
  //    email_id (not the single selected pipeline_events.id) so all stages
  //    appear, not just the one referenced by ?selected=.
  let selectedTimeline: PipelineTimelineEvent[] = [];
  if (selectedRow) {
    const emailId =
      (selectedRow.result as { email_id?: string } | null)?.email_id ?? null;
    if (emailId) {
      const tlRes = await admin
        .from("pipeline_events")
        .select(
          "id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, override, eval_type, triggered_by",
        )
        .eq("swarm_type", swarmType)
        .eq("email_id", emailId)
        .order("stage", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50);
      selectedTimeline =
        (tlRes.data as PipelineTimelineEvent[] | null) ?? [];
    }
  }

  // 9. Phase 71-05 (UI-SPEC §Recipient chip strip). Recipient chip data.
  //    The pipeline_events_email_summary view does NOT expose recipient
  //    inbox today; computing chips would require a per-page JOIN to
  //    email_pipeline.emails (sender/recipient mailbox). Out-of-scope for
  //    Plan 71-05's "minimal precise additions" envelope. Strip renders
  //    with the "All" chip only; per-recipient filtering is wired via
  //    the ?inbox= URL parameter pattern but yields no chips today.
  //    Promoted to a follow-up plan if operators need per-recipient counts.
  const recipientChips: RecipientChip[] = [];

  return {
    counts,
    rows,
    promotedToday,
    candidates,
    selectedRow,
    selectedTimeline,
    recipientChips,
    selectedBody: initialSelectedBody,
    bodyMap: initialBodyMap,
  };
}

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<PageSearchParams>;
}

export default async function SwarmReviewPage({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Registry lookup. Unknown or disabled swarm → 404 (Next 15 idiom).
  const swarm: SwarmRow | null = await loadSwarm(admin, swarmType);
  if (!swarm || !swarm.enabled) {
    notFound();
  }
  const categories: SwarmCategoryRow[] = await loadSwarmCategories(
    admin,
    swarmType,
  );
  // Phase 71-05. Stage 3 widget consumes swarm_intents.
  const intents: SwarmIntentRow[] = await loadSwarmIntents(admin, swarmType);

  const data = await loadPageData(sp, admin, swarmType);
  const rowIds = data.rows.map((r) => r.id);

  return (
    <AutomationRealtimeProvider automations={[`${swarmType}-review`]}>
      <SelectionProvider
        initialSelectedId={sp.selected ?? null}
        rowIds={rowIds}
      >
        <div className="px-6 pt-12 pb-12 w-full">
          <h1 className="text-[28px] font-semibold leading-[1.2] font-[family-name:var(--font-cabinet)]">
            {swarm.display_name ? `${swarm.display_name} — Bulk Review` : "Bulk Review"}
          </h1>
          <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2 mb-6">
            Review predicted classifications. Approved rows trigger the
            registered side-effects (categorize+archive, downstream cleanup,
            or swarm dispatch) in the background.
          </p>
          <div className="grid grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr] gap-4 min-w-0">
            <QueueTree
              counts={data.counts}
              selection={sp}
              candidates={data.candidates}
              promotedTodayCount={data.promotedToday.length}
              swarmType={swarmType}
              treeLevels={swarm.ui_config.tree_levels}
            />
            <RowList
              rows={data.rows}
              promotedToday={data.promotedToday}
              candidates={data.candidates}
              selection={sp}
              swarmType={swarmType}
              columns={swarm.ui_config.row_columns}
              recipientChips={data.recipientChips}
            />
            <DetailPane
              rows={data.rows}
              initialSelectedRow={data.selectedRow}
              initialSelectedBody={data.selectedBody}
              initialBodyMap={data.bodyMap}
              selectedTimeline={data.selectedTimeline}
              swarmType={swarmType}
              categories={categories}
              intents={intents}
              drawerFields={swarm.ui_config.drawer_fields}
            />
          </div>
          <KeyboardShortcuts rowIds={rowIds} />
          <Cheatsheet />
        </div>
      </SelectionProvider>
    </AutomationRealtimeProvider>
  );
}
