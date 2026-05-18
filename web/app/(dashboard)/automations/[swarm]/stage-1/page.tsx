// Phase 82 Plan 06 — Stage 1 RSC entry point on the unified _shell/ library.
//
// Lineage:
//   - Phase 56.7-03 (D-08/D-13/D-14/D-15): generic queue page mounted at
//     /automations/[swarm]/stage-1. Reads the swarm registry so adding a new
//     swarm is a `swarms` row INSERT, not a new route.
//   - Phase 60-05: originated from debtor-email-review/page.tsx.
//   - Phase 81-03 (Sketch 005 lock): PageHeader + StageTabStrip envelope +
//     NoiseCategoryChipStrip + 2-col body grid + Pending Promotion sub-view.
//   - Phase 82 Plan 06: page-level row-list + detail-pane composition replaced
//     by the unified _shell/ shell (RowList, MailboxFilter, UnifiedDetailPane,
//     SelectionProvider, KeyboardShortcuts). Stage 1 override picker logic
//     preserved as an inline cell widget inside UnifiedDetailPane's
//     PipelineFlow (Phase 82.1 Plan 04 ports the picker into
//     _shell/components/stage-1-widget.tsx). Mailbox filter loader extended
//     from .eq to .in (CONTEXT D-12).
//
// Hard-separation contract (RFC docs/agentic-pipeline/README.md):
//   - This page surface reads `swarm_noise_categories` for Stage 1's chip
//     strip + override dropdown (Stage 1 = noise filter).
//   - `swarm_intents` is loaded for the EMBEDDED Stage 3 widget inside the
//     unified detail pane's 5-cell PipelineFlow (the only Stage 3-aware
//     surface here). Categories and intents are NEVER blurred — separate
//     props all the way down (UnifiedDetailPane API enforces this at the
//     type level).
//
// Phase 81 D-18 forward-carry: zero "Bulk Review" copy in any user-visible
// surface — this comment block is a historical reference, not UI text.
//
// Phase 81 D-19 channel-name lock: AutomationRealtimeProvider mounts the
// `${swarmType}-review` channel (NOT `-kanban`). DO NOT change.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadFeedbackMap } from "@/lib/automations/debtor-email/feedback/load-feedback-map";
import type { FeedbackMap } from "@/lib/automations/debtor-email/feedback/types";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import {
  loadSwarm,
  loadSwarmNoiseCategories,
  loadSwarmIntents,
} from "@/lib/swarms/registry";
import { loadEmailMailboxes } from "../_shell/_lib/load-email-mailboxes";
import type {
  SwarmNoiseCategoryRow,
  SwarmIntentRow,
  SwarmRow,
} from "@/lib/swarms/types";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "../_shell/selection-context";
import { Cheatsheet } from "../_shell/keyboard-shortcuts";
import { getSwarmMailboxes } from "../_shell/_lib/get-swarm-mailboxes";
import { loadMailboxLabels } from "../_shell/_lib/load-mailbox-labels";
import { MailboxFilter } from "../_shell/mailbox-filter";
import type { Row } from "../_shell/_lib/types";
import { loadStage2WeeklyCount } from "../stage-2/_lib/load-stage-2-weekly-count";
import { NoiseCategoryChipStrip } from "./noise-category-chip-strip";
import { PredictorConfidenceChipStrip } from "./predictor-confidence-chip-strip";
import { CandidateRuleList } from "./candidate-rule-list";
import {
  PendingPromotionDetailPane,
  type RuleSample,
} from "./pending-promotion-detail-pane";
import { loadRuleSamples } from "./actions";
import { Stage1ClientShell } from "./client-shell";
import { buildStageAuditMap } from "../_shell/_lib/build-stage-audit-map";
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

// Phase 82.5 Plan 06 — Stage 1 hardcoded ACTIVE_STAGE literal. Stage 1 (noise
// filter, swarm_noise_categories) reads feedback bucketed by stage=1 only.
const ACTIVE_STAGE = 1 as const;

export interface PageSearchParams {
  topic?: string;
  entity?: string;
  /**
   * Phase 82 Plan 06 (CONTEXT D-12). Multi-mailbox filter. Next 15 surfaces
   * repeated `?mailbox=` URL params as a string array; single-select callers
   * still pass a string. Loader normalises to number[] and uses `.in()`.
   */
  mailbox?: string | string[];
  rule?: string;
  // Phase 81-03 D-09/D-10/D-11: ?sub=pending swaps the surface to the
  // Pending Promotion sub-view (candidate-rule-list + rule-evidence pane).
  sub?: string;
  // `tab` kept in the type for defensive parsing — middleware rewrites
  // legacy ?tab=pending → ?sub=pending; loader no longer branches on it
  // for Pending Promotion. ?tab=safety (Stage 0 safety-review) still
  // routes to its dedicated branch.
  tab?: string;
  before?: string;
  selected?: string;
  // Phase 999.8 Plan 07 (D-05, D-06, D-11). Predictor + confidence chip
  // filters. Server-side validated against enum allowlists in loadPageData;
  // invalid values silently ignored (no 400). Filter on Stage 1
  // pipeline_events.decision_details->>predictor (denormalized by Plan 02)
  // and decision_details->>llm_confidence. Default: unfiltered (D-06).
  predictor?: string;
  confidence?: string;
  /**
   * Phase 82.4 Plan 06. Option Z chips: "Needs action" + "My feedback only".
   * Default OFF on every tab (audit-first culture per 82.4-CONTEXT.md);
   * only `=== "1"` enables them. Both reset `before` on toggle to keep
   * pagination consistent with the active filter.
   */
  needs_action?: string;
  mine_only?: string;
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
  /**
   * Stable client-side row identifier. Phase 71-08 switched this from
   * automation_runs.id to email_pipeline.emails.id so the row strip,
   * URL ?selected=, and timeline lookup all key off the same value.
   *
   * For verdict writes (recordVerdict / agent_runs FK) the loader resolves
   * and threads `automation_run_id` separately — see below.
   */
  id: string;
  /**
   * Real automation_runs.id for the predicted row. Required by the
   * recordVerdict server action: it UPDATEs automation_runs.status and
   * INSERTs an FK-constrained row into agent_runs. Resolved server-side
   * by joining email_pipeline.emails.source_id ↔ automation_runs.result.message_id.
   */
  automation_run_id?: string | null;
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
  /**
   * Phase 999.8 Plan 08 (D-08, D-12). Stage 1 predictor attribution: which
   * predictor decided this row's Stage 1 noise classification. Sourced from
   * pipeline_events.decision_details.predictor (denormalized by Plan 02 on
   * the classifier-screen-worker emit). 'regex' = Pass 1 hit;
   * 'llm_2nd_pass' = Pass 2 LLM gated through the high-confidence gate.
   * NULL on rows predating cutover (D-09 forward-only) — PredictorChip
   * renders nothing in that case.
   *
   * Hard-separation: this field exists ONLY on the Stage 1 surface and is
   * derived from Stage 1 pipeline_events. It does not cross into Stage 3
   * (swarm_intents) — that classifier wave is gated to a separate surface.
   */
  predictor?: "regex" | "llm_2nd_pass" | null;
  /**
   * Phase 999.8 Plan 08. LLM 2nd-pass confidence bucket sourced from
   * pipeline_events.decision_details.llm_confidence. Only meaningful when
   * predictor === 'llm_2nd_pass'; rendered inside the PredictorChip as
   * `LLM · <confidence>`. NULL otherwise.
   */
  llmConfidence?: "low" | "medium" | "high" | null;
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
  /** Pre-fetched per-stage timelines for all visible rows, keyed by email_id.
   *  Same rationale as bodyMap: client-side row selection updates the URL via
   *  history.replaceState and does not re-render the server component, so the
   *  per-row timeline must be available for every visible row up front.
   *  Without this, clicking any non-initial row leaves DetailPane with an
   *  empty selectedTimeline → every stage card renders "Stage didn't run". */
  timelineMap: Record<string, PipelineTimelineEvent[]>;
}

/**
 * Initial page size for the predicted-row list.
 *
 * Sized to roughly fit one viewport plus a small scroll buffer. The detail
 * pane preloads bodies, timeline, coordinator runs, and tagging failures
 * for every row in the list — those are O(rows.length) round-trips, so
 * keeping the initial fetch viewport-sized is the dominant lever on first
 * paint. Older revs returned 100 rows by default which paid the enrichment
 * cost on rows the operator never scrolled to.
 *
 * Cursor pagination via `?before=<last_event_at>` is unchanged; the row
 * list grows as the operator scrolls / paginates.
 */
export const PAGE_SIZE = 25;

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

  // Upper-half parallel group: counts (RPC), promoted-rules, and candidate
  // rules are independent of each other and of the row-list pipeline. Was
  // three sequential awaits totalling ~150-300ms; now bounded by the slowest.
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const [countsRes, promotedRes, candRes] = await Promise.all([
    admin.rpc("classifier_queue_counts", { p_swarm_type: swarmType }),
    admin
      .from("classifier_rules")
      .select("rule_key, promoted_at")
      .eq("swarm_type", swarmType)
      .eq("status", "promoted")
      .gte("promoted_at", todayMidnight.toISOString()),
    admin
      .from("classifier_rules")
      .select("rule_key, status, n, ci_lo")
      .eq("swarm_type", swarmType)
      .eq("status", "candidate"),
  ]);
  const counts = (countsRes.data as QueueCountRow[] | null) ?? [];
  const promotedToday = (promotedRes.data as PromotedRule[] | null) ?? [];
  const candidates = (candRes.data as ClassifierCandidate[] | null) ?? [];

  // Phase 81-03 D-09/D-10/D-11. Pending Promotion sub-view short-circuit.
  // When ?sub=pending is active the surface renders the candidate-rule list
  // instead of the predicted-row pipeline; skip the entire row-list +
  // body/timeline/coordinator/tagging waterfall below.
  if (params.sub === "pending") {
    return {
      counts,
      rows: [],
      promotedToday,
      candidates,
      selectedRow: null,
      selectedTimeline: [],
      recipientChips: [],
      selectedBody: null,
      bodyMap: {},
      timelineMap: {},
    };
  }

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

    // Phase 999.8 Plan 07 (D-05, T-9998-13): server-side enum allowlist for
    // predictor + confidence filter chips. Invalid values are silently
    // ignored (no throw, no 400) — broken URLs degrade to the default
    // unfiltered view (D-06). Supabase's `.eq()` parametrises the value so
    // there is no SQL injection vector even on validated input.
    const validatedPredictor =
      params.predictor === "regex" || params.predictor === "llm_2nd_pass"
        ? params.predictor
        : undefined;
    const validatedConfidence =
      params.confidence === "high" ||
      params.confidence === "medium" ||
      params.confidence === "low"
        ? params.confidence
        : undefined;
    const hasFilters = !!(
      params.topic ||
      params.entity ||
      // params.mailbox intentionally excluded — mailbox filtering happens
      // client-side via hydrated PredictedRow.mailbox_id (decision_details
      // doesn't carry mailbox_id today). Including it here would force the
      // server JOIN-back path and zero the row list.
      params.rule ||
      validatedPredictor ||
      validatedConfidence
    );
    // JOIN-back filter (only when query params filter the queue): collect
    // email_ids from raw pipeline_events that match. Built as a promise so
    // it can run alongside predictedRunsRes + listQuery below.
    const filterPromise: Promise<string[] | null> = (async () => {
      if (!hasFilters) return null;
      const q = admin
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
      if (params.topic) q.eq("decision", params.topic);
      if (params.entity) q.eq("decision_details->>entity", params.entity);
      // Phase 82.4 follow-up: the server-side mailbox filter used to query
      // .in("decision_details->>mailbox_id", ids) but that JSON field is
      // always null in production (verified 2026-05-13). Mailbox filtering
      // now happens entirely client-side in Stage1ClientShell against
      // PredictedRow.mailbox_id, which is hydrated below from automation_runs.
      // (Skipping the server-side filter is intentional — keeping it would
      // zero the row list before client-side filtering can run.)
      if (params.rule) q.eq("decision_details->>regex_rule_id", params.rule);
      // Phase 999.8 Plan 07 (D-05, D-11). Predictor + confidence filters
      // read denormalized fields on pipeline_events.decision_details
      // (predictor added by Plan 02 Task 3; llm_confidence pre-existing).
      // Stage 1 only — already constrained by .eq("stage", 1) above.
      if (validatedPredictor) {
        q.eq("decision_details->>predictor", validatedPredictor);
      }
      if (validatedConfidence) {
        q.eq("decision_details->>llm_confidence", validatedConfidence);
      }
      const r = await q;
      const rs = (r.data as Array<{ email_id: string | null }> | null) ?? [];
      return Array.from(
        new Set(rs.map((x) => x.email_id).filter((id): id is string => !!id)),
      );
    })();

    function mapSummaryToPredictedRow(row: SummaryRow): PredictedRow {
      return {
        id: row.email_id,
        automation_run_id: emailIdToAutomationRunId.get(row.email_id) ?? null,
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
    // Build the summary view query (independent of predictedRunsRes /
    // filterPromise — those just constrain the in-memory filter that runs
    // after both resolve).
    const listQuery = (admin.from("pipeline_events_email_summary") as unknown as SummaryQuery)
      .select(
        "email_id, swarm_type, subject, sender_email, sender_name, recipient_mailbox, email_received_at, " +
          "stage_0_decision, stage_1_decision, stage_2_decision, stage_3_decision, stage_4_decision, " +
          "stage_1_overridden, stage_2_overridden, stage_3_overridden, stage_4_overridden, " +
          "total_cost_cents, tool_call_count, first_event_at, last_event_at",
      )
      .eq("swarm_type", swarmType)
      .order("last_event_at", { ascending: false })
      // Buffer = 4× page size so the post-filter slice (predicted-status
      // whitelist) still has enough rows to cover a viewport even on swarms
      // with high auto-action throughput. View is small; 4×PAGE_SIZE is cheap.
      .limit(PAGE_SIZE * 4);
    if (params.before) listQuery.lt("last_event_at", params.before);

    // Phase 71-08: filter to emails awaiting operator review. The view aggregates
    // every email with a Stage 1 emit — including auto-actioned ones whose
    // automation_runs row is already 'completed'. Resolve the predicted-status
    // email_ids via automation_runs.result.message_id → email_pipeline.emails.id.
    // predictedRuns + listRes + filterEmailIds run in parallel; peRes runs
    // after predictedRunsRes since it depends on the message_ids it returns.
    const [predictedRunsRes, listRes, filterEmailIds] = await Promise.all([
      admin
        .from("automation_runs")
        .select("id, result")
        .eq("swarm_type", swarmType)
        .eq("status", "predicted"),
      listQuery,
      filterPromise,
    ]);
    // Build message_id → automation_run_id index. Used twice below: to
    // resolve the predicted-status email_id whitelist (via the matching
    // emails.source_id), AND to thread the real automation_runs.id onto
    // each PredictedRow so recordVerdict can UPDATE the right row + insert
    // a valid agent_runs FK.
    const predictedRunsByMessageId = new Map<string, string>();
    for (const r of (predictedRunsRes.data ?? []) as Array<{
      id: string;
      result: { message_id?: string } | null;
    }>) {
      const mid = r.result?.message_id;
      if (typeof mid === "string" && mid.length > 0) {
        predictedRunsByMessageId.set(mid, r.id);
      }
    }
    const predictedMessageIds = Array.from(predictedRunsByMessageId.keys());
    const emailIdToAutomationRunId = new Map<string, string>();
    let predictedEmailIds: string[] = [];
    if (predictedMessageIds.length > 0) {
      // Outlook EwsId base64 strings are ~150 chars each. A single .in() call
      // with 250+ of them produces a PostgREST URL >8KB which gateways drop
      // silently (data=[] with no error). Chunk into batches of 50 — keeps
      // each URL well under the limit while staying parallelizable.
      const CHUNK = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < predictedMessageIds.length; i += CHUNK) {
        chunks.push(predictedMessageIds.slice(i, i + CHUNK));
      }
      const chunkResults = await Promise.all(
        chunks.map((c) =>
          admin
            .schema("email_pipeline")
            .from("emails")
            .select("id, source_id")
            .in("source_id", c),
        ),
      );
      const emailRows: Array<{ id: string; source_id: string | null }> = [];
      for (const r of chunkResults) {
        for (const row of (r.data ?? []) as Array<{ id: string; source_id: string | null }>) {
          emailRows.push(row);
        }
      }
      for (const e of emailRows) {
        if (!e.source_id) continue;
        const arId = predictedRunsByMessageId.get(e.source_id);
        if (arId) emailIdToAutomationRunId.set(e.id, arId);
      }
      predictedEmailIds = emailRows.map((e) => e.id);
    }

    // Phase 71-08: filter via in-memory JS rather than .in() with 80+ uuids,
    // which can produce a PostgREST URL >8KB and time out / fail silently.
    const effectiveFilterSet = new Set<string>(
      filterEmailIds === null
        ? predictedEmailIds
        : predictedEmailIds.filter((id) => filterEmailIds.includes(id)),
    );
    const summaryRows = (
      ((listRes.data as SummaryRow[] | null) ?? []).filter((r) =>
        effectiveFilterSet.has(r.email_id),
      )
    ).slice(0, PAGE_SIZE);
    rows = summaryRows.map(mapSummaryToPredictedRow);

    // Phase 82.7.2-02 (F-02 Branch B): hydrate `entity` from raw
    // pipeline_events.decision_details->>entity. The summary view
    // (pipeline_events_email_summary) does NOT project entity or
    // entity_brand (see findings 82.7.2-F-02-FINDINGS.md Q4), so the
    // noise-tab mapper sets entity=null at L614 by default. The safety
    // mapper mapEventToPredictedRow at L442 already reads entity from
    // decision_details — this hydration brings the noise-tab to parity.
    //
    // Coverage: 7-day audit (F-02 findings Q2) showed 274/275 = 99.6 %
    // of Stage 1 emits carry decision_details.entity, so the JOIN-back
    // is high-yield. Query is bounded to the current page's email_ids
    // (rows.length ≤ PAGE_SIZE).
    //
    // NOTE: entity_brand stays untouched on the PredictedRow shape.
    // The brand-swatch in predicted-row.tsx reads row.entity_brand, not
    // row.entity — wiring the swatch is intentionally deferred because
    // the 5-brand registry (web/lib/swarms/brand-color.ts) does not
    // include `fire-control` (40 % of debtor-email Stage 1 rows). A
    // partial wiring would surface the lime/pink/amber dots for smeba/
    // smeba-fire/berki but leave fire-control on the muted fallback,
    // which would still read as "broken" to operators. Out-of-scope
    // flag tracked in F-02 findings; awaits Nick's registry-expansion
    // decision per CONTEXT G-03 / project_brand_scope.md.
    if (rows.length > 0) {
      const entityRowIds = rows.map((r) => r.id);
      const entityRes = await admin
        .from("pipeline_events")
        .select("email_id, decision_details")
        .eq("swarm_type", swarmType)
        .eq("stage", 1)
        .in("email_id", entityRowIds);
      const entityByEmail = new Map<string, string>();
      for (const row of (entityRes.data ?? []) as Array<{
        email_id: string | null;
        decision_details: Record<string, unknown> | null;
      }>) {
        if (!row.email_id) continue;
        const ent = row.decision_details?.entity;
        if (typeof ent === "string" && ent.length > 0 && !entityByEmail.has(row.email_id)) {
          entityByEmail.set(row.email_id, ent);
        }
      }
      rows = rows.map((r) => ({
        ...r,
        entity: entityByEmail.get(r.id) ?? r.entity,
      }));
    }

    // Phase 82.4 follow-up: hydrate mailbox_id from automation_runs so the
    // V6 MailboxFilter actually filters. decision_details->>mailbox_id is
    // always null in production (verified 2026-05-13); the canonical numeric
    // mailbox_id lives on automation_runs.
    if (rows.length > 0) {
      const mailboxes = await loadEmailMailboxes(
        admin,
        rows.map((r) => r.id),
        swarmType,
      );
      rows = rows.map((r) => ({
        ...r,
        mailbox_id: mailboxes.get(r.id) ?? r.mailbox_id,
      }));
    }
  }

  // promoted-rules + candidates were already extracted above (so the
  // sub=pending short-circuit could return them too).

  // 5. Selected row for the detail pane (?selected=<id>). Separate query
  //    so the list query is not widened by an OR clause. Returns null when
  //    no selection or the id is no longer in the predicted set.
  //
  // Phase 70 TELE-03 (D-14, D-16): reads from pipeline_events; the row id in
  // the URL is now the pipeline_events.id, since the row list comes from
  // pipeline_events.
  let selectedRow: PredictedRow | null = null;
  // Phase 71-08: Stage 1 row id is now an email_id (uuid in
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

  // Body preload — single SELECT against email_pipeline.emails for all visible
  // rows. Rows whose body_text is empty paint with metadata only; the detail
  // pane lazy-fetches missing bodies on row click via fetchReviewEmailBody
  // (which itself falls back to Outlook Graph and persists the result).
  // Doing the Graph backfill here on SSR previously blocked page render
  // for 1-3s on backlogs where bodies weren't populated yet; it's now off
  // the critical path.
  //
  // The four row-keyed loaders below (bodies, timeline, coordinator, tagging)
  // are independent and run in parallel. Previously each was its own awaited
  // round-trip, which serialized 4 × ~50-150ms of latency for no reason.
  const initialBodyMap: Record<string, { bodyText: string; bodyHtml: string | null }> = {};
  let initialSelectedBody: { bodyText: string; bodyHtml: string | null } | null = null;
  const timelineMap: Record<string, PipelineTimelineEvent[]> = {};
  let coordinatorMap: Awaited<ReturnType<typeof loadCoordinatorRunsForReview>> | null = null;
  let taggingMap: Awaited<ReturnType<typeof loadTaggingFailuresForReview>> | null = null;
  if (rows.length > 0) {
    const emailIds = rows.map((r) => r.id).filter(Boolean);
    const taggingPairs = rows
      .map((r) => {
        const eid = (r.result as { email_id?: string } | null)?.email_id ?? null;
        return eid ? { automation_run_id: r.id, email_id: eid } : null;
      })
      .filter((p): p is { automation_run_id: string; email_id: string } => p !== null);

    const bodiesPromise = admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, body_text, body_html")
      .in("id", emailIds);

    const timelinePromise = admin
      .from("pipeline_events")
      .select(
        "id, created_at, swarm_type, stage, email_id, decision, confidence, decision_details, override, eval_type, triggered_by",
      )
      .eq("swarm_type", swarmType)
      .in("email_id", emailIds)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true });

    const coordinatorPromise =
      swarmType === "debtor-email"
        ? loadCoordinatorRunsForReview(rows.map((r) => r.id))
        : Promise.resolve(null as Awaited<ReturnType<typeof loadCoordinatorRunsForReview>> | null);

    const taggingPromise =
      swarmType === "debtor-email" && taggingPairs.length > 0
        ? loadTaggingFailuresForReview(taggingPairs)
        : Promise.resolve(null as Awaited<ReturnType<typeof loadTaggingFailuresForReview>> | null);

    const [bodiesRes, timelineRes, coord, tag] = await Promise.all([
      bodiesPromise,
      timelinePromise,
      coordinatorPromise,
      taggingPromise,
    ]);

    for (const e of (bodiesRes.data as Array<{
      id: string;
      body_text: string | null;
      body_html: string | null;
    }> | null) ?? []) {
      initialBodyMap[e.id] = {
        bodyText: e.body_text ?? "",
        bodyHtml: e.body_html || null,
      };
    }
    for (const ev of (timelineRes.data as PipelineTimelineEvent[] | null) ?? []) {
      const key = ev.email_id;
      if (!key) continue;
      (timelineMap[key] ??= []).push(ev);
    }
    coordinatorMap = coord;
    taggingMap = tag;

    if (selectedRow && initialBodyMap[selectedRow.id]) {
      initialSelectedBody = initialBodyMap[selectedRow.id];
    }
  }

  // Phase 999.8 Plan 08 (D-08). Derive per-row predictor + llm_confidence from
  // the Stage 1 timeline event (decision_details denormalized by Plan 02 on
  // the classifier-screen-worker emit). Cheap pass over timelineMap — no
  // extra DB round-trip. Forward-only (D-09): pre-cutover rows have null
  // decision_details.predictor → PredictedRow.predictor stays undefined →
  // PredictorChip renders nothing.
  //
  // Hard-separation: filters strictly on stage===1; never reads Stage 3
  // events (swarm_intents) even though the timeline holds them.
  if (rows.length > 0) {
    rows = rows.map((r) => {
      const stage1 = (timelineMap[r.id] ?? []).find((ev) => ev.stage === 1);
      if (!stage1) return r;
      const d = (stage1.decision_details ?? {}) as Record<string, unknown>;
      const rawPred = d.predictor;
      const predictor: PredictedRow["predictor"] =
        rawPred === "regex" || rawPred === "llm_2nd_pass" ? rawPred : null;
      const rawConf = d.llm_confidence;
      const llmConfidence: PredictedRow["llmConfidence"] =
        rawConf === "low" || rawConf === "medium" || rawConf === "high"
          ? rawConf
          : null;
      return { ...r, predictor, llmConfidence };
    });
    const sel = selectedRow;
    if (sel) {
      const enriched = rows.find((r) => r.id === sel.id);
      if (enriched) selectedRow = enriched;
    }
  }

  // Apply coordinator + tagging enrichments (loaded in parallel above).
  if (coordinatorMap && coordinatorMap.size > 0) {
    rows = rows.map((r) => {
      const coord = coordinatorMap!.get(r.id);
      return coord ? { ...r, coordinator: coord } : r;
    });
    if (selectedRow) {
      const coord = coordinatorMap.get(selectedRow.id);
      if (coord) selectedRow = { ...selectedRow, coordinator: coord };
    }
  }
  if (taggingMap && taggingMap.size > 0) {
    rows = rows.map((r) => {
      const t = taggingMap!.get(r.id);
      return t ? { ...r, tagging: t } : r;
    });
    if (selectedRow) {
      const t = taggingMap.get(selectedRow.id);
      if (t) selectedRow = { ...selectedRow, tagging: t };
    }
  }
  const selectedTimeline: PipelineTimelineEvent[] = selectedRow
    ? timelineMap[selectedRow.id] ?? []
    : [];

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
    timelineMap,
  };
}

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<PageSearchParams>;
}

// PredictedRow → unified Row. Stage 1 row mapper. The stage_badge variant is
// "noise" (Stage 1 = swarm_noise_categories per hard-separation lock); the
// label is the predicted noise category (or "uncategorized" when missing).
//
// timestamp prefers email_received_at via the view JOIN (already wired into
// mapSummaryToPredictedRow) and falls back to created_at. mailbox_id flows
// through from result.source_mailbox isn't a number — we use row.mailbox_id
// directly (the view JOIN doesn't surface a numeric mailbox_id today, so this
// is null for most Stage 1 rows; the MailboxFilter dropdown still renders the
// canonical labels via getSwarmMailboxes' static fallback).
function toUnifiedRow(p: PredictedRow): Row {
  const result = (p.result as { from?: string; fromName?: string; subject?: string } | null) ?? {};
  const predicted = (p.result as { predicted?: { category?: string } } | null)?.predicted;
  return {
    id: p.id,
    from_name: result.fromName ?? null,
    from_email: result.from ?? null,
    subject: result.subject ?? null,
    timestamp: p.created_at,
    mailbox_id: p.mailbox_id ?? null,
    stage_badge: {
      label: predicted?.category ?? p.topic ?? "uncategorized",
      variant: "noise",
    },
  };
}

function parseSelectedMailboxes(p: string | string[] | undefined): number[] {
  const arr = Array.isArray(p) ? p : p ? [p] : [];
  return arr
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
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
  // Phase 82.5 Plan 06: resolve viewerId for feedback bucketing. Null when
  // unauthenticated — loadFeedbackMap handles that case (everything flows to
  // `others`, nothing marked as `own_latest`).
  const supabaseSrv = await createClient();
  const { data: { user: viewerUser } } = await supabaseSrv.auth.getUser();
  const viewerId = viewerUser?.id ?? null;

  // Phase 81-03 D-04/D-05: parallel-fetch the shell's data dependencies.
  // Stage 2 weekly count is debtor-only today (Plan 02); other swarms
  // resolve to 0 so the StageTabStrip badge renders muted.
  // Phase 82.5 Plan 06: feedbackMap prefetched in the same Promise.all block
  // so additive latency stays bounded by the slowest sibling, not stacked.
  // emailIds are known only after loadPageData resolves; we therefore do a
  // sequential follow-up SELECT against email_feedback inside a tiny second
  // Promise.all (data needed first). To keep parallelism with the four-tuple
  // above we'd need email ids up-front — but the loader paginates server-side
  // off cursor/filter state, so the ids set is unknown at this point.
  // Compromise: keep the existing 4-tuple for shell deps; run loadFeedbackMap
  // in a separate await with the resolved emailIds (single round-trip; under
  // the 100ms budget per Plan 01 measurements).
  const [data, noiseCategories, intents, stage2Count] = await Promise.all([
    loadPageData(sp, admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    swarmType === "debtor-email"
      ? loadStage2WeeklyCount(admin)
      : Promise.resolve(0),
  ]);
  const feedbackMap: FeedbackMap = await loadFeedbackMap(
    admin,
    data.rows.map((r) => r.id),
    ACTIVE_STAGE,
    viewerId,
  );
  const categories: SwarmNoiseCategoryRow[] = noiseCategories;
  const intentRows: SwarmIntentRow[] = intents;
  const rowIds = data.rows.map((r) => r.id);

  // Phase 81-03 D-09: when sub=pending && rule is selected, plumb sample
  // matched emails server-side so the right-pane evidence view can render.
  let ruleSamples: RuleSample[] = [];
  if (sp.sub === "pending" && sp.rule) {
    ruleSamples = await loadRuleSamples(admin, swarmType, sp.rule, 5);
  }

  // Phase 82 Plan 06: unified Row[] for _shell/RowList + MailboxFilter.
  // PredictedRow[] is still passed to Stage1ClientShell so the inline Stage 1
  // cell widget (Phase 82.1 Plan 04) can read .automation_run_id + .result
  // fields for the override POST + recordVerdict server-action args.
  const unifiedRows: Row[] = data.rows.map(toUnifiedRow);
  const mailboxLabels = await loadMailboxLabels(admin, swarmType);
  const mailboxes = getSwarmMailboxes(unifiedRows, mailboxLabels);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={1}
        counts={{ 1: data.rows.length, 2: stage2Count }}
      />
      {/* Phase 81 D-19 channel-name lock: `${swarmType}-review` (NOT -kanban). */}
      <AutomationRealtimeProvider
        automations={[`${swarmType}-review`]}
        initialLimit={500}
      >
        <SelectionProvider
          initialSelectedId={sp.selected ?? null}
          rowIds={rowIds}
        >
          <div className="px-6 pt-6 pb-12 w-full">
            {/* Phase 82.1 Plan 02 (D-02, D-03): MailboxFilter hoisted out of
                Stage1ClientShell onto the chip-strip row so it sits right of
                NoiseCategoryChipStrip via justifyContent: space-between. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                marginBottom: "var(--space-3)",
              }}
            >
              <NoiseCategoryChipStrip
                categories={categories}
                counts={data.counts}
                activeTopic={sp.topic ?? "all"}
                candidateCount={data.candidates.length}
                activeSub={sp.sub ?? null}
              />
              <MailboxFilter mailboxes={mailboxes} selected={selectedMailboxes} />
            </div>
            {/* Phase 999.8 Plan 07 (D-05, D-06, D-11). Predictor + confidence
                filter chips. Only render on the predicted-row branch — the
                Pending Promotion sub-view (?sub=pending) does not gain these
                filters (those are predicted-row concepts, not rule concepts). */}
            {sp.sub !== "pending" && (
              <div style={{ marginBottom: "var(--space-3)" }}>
                <PredictorConfidenceChipStrip
                  activePredictor={sp.predictor ?? null}
                  activeConfidence={sp.confidence ?? null}
                />
              </div>
            )}
            {sp.sub === "pending" ? (
              <div className="grid grid-cols-[minmax(380px,460px)_1fr] gap-4 min-w-0">
                {/* Phase 81-03 Pending Promotion sub-view — PRESERVED.
                    DO NOT route through the unified shell — this branch is
                    structurally a candidate-rule list, not a predicted-row
                    feed. */}
                <CandidateRuleList
                  rules={data.candidates}
                  selectedRuleKey={sp.rule ?? null}
                  swarmType={swarmType}
                />
                <PendingPromotionDetailPane
                  rules={data.candidates}
                  selectedRuleKey={sp.rule ?? null}
                  samples={ruleSamples}
                  swarmType={swarmType}
                />
              </div>
            ) : (
              // Phase 82 Plan 06: unified shell composition. The client shell
              // mounts _shell/RowList + UnifiedDetailPane. Phase 82.1 Plan 04:
              // the Stage 1 cell widget renders the override picker inline;
              // tagging-failure artifacts move to UnifiedDetailPane's
              // extrasBelowPipeline slot.
              <Stage1ClientShell
                swarmType={swarmType}
                predictedRows={data.rows}
                unifiedRows={unifiedRows}
                initialSelectedRow={data.selectedRow}
                categories={categories}
                intents={intentRows}
                selectedMailboxes={selectedMailboxes}
                bodyMap={data.bodyMap}
                timelineMap={data.timelineMap}
                initialSelectedBody={data.selectedBody}
                selectedTimeline={data.selectedTimeline}
                drawerFields={swarm.ui_config.drawer_fields}
                stageAudit={buildStageAuditMap({ timeline: data.selectedTimeline ?? [], agentRuns: [], automationRun: null })}
                mailboxLabels={mailboxLabels}
                feedbackMap={feedbackMap}
              />
            )}
            <Cheatsheet />
          </div>
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
