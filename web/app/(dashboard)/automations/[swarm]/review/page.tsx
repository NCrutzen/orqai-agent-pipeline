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
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadSwarm, loadSwarmCategories } from "@/lib/swarms/registry";
import type { SwarmCategoryRow, SwarmRow } from "@/lib/swarms/types";
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

export interface PageData {
  counts: QueueCountRow[];
  rows: PredictedRow[];
  promotedToday: PromotedRule[];
  candidates: ClassifierCandidate[];
  selectedRow: PredictedRow | null;
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
  // 1. Counts: single RPC, GROUP BY (swarm_type, topic, entity, mailbox_id).
  const countsRes = await admin.rpc("classifier_queue_counts", {
    p_swarm_type: swarmType,
  });
  const counts = (countsRes.data as QueueCountRow[] | null) ?? [];

  // 2. Predicted rows: cursor pagination, page-size 100.
  //
  // Phase 64-05 (SAFE-02 / SAFE-04): when params.tab==='safety', filter on
  // topic='safety_review' so the Safety Review tab only shows Stage 0
  // injection-suspected rows. Existing topic/entity/mailbox/rule filters
  // are not applied in the safety branch — Stage 0 rows aren't categorised
  // by the regex classifier, so those filters have no meaning here.
  let rows: PredictedRow[];
  if (params.tab === "safety") {
    const safetyQuery = admin
      .from("automation_runs")
      .select("*")
      .eq("status", "predicted")
      .eq("swarm_type", swarmType)
      .eq("topic", "safety_review")
      .order("created_at", { ascending: false })
      .limit(100);
    if (params.before) safetyQuery.lt("created_at", params.before);
    const safetyRes = await safetyQuery;
    const safetyRows = (safetyRes.data as PredictedRow[] | null) ?? [];

    // BUDG-03 / D-17 — enrich with cost-outlier flag at read time.
    // The RPC carries the Pitfall-6 bootstrap guard internally
    // (sample_count<100 → is_cost_outlier=false for every id).
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
    rows = safetyRows.map((r) => {
      const o = outlierMap.get(r.id);
      return {
        ...r,
        is_cost_outlier: o?.is_cost_outlier ?? false,
        cost_cents: o?.cost_cents ?? 0,
        median_cost_cents: o?.median_cost_cents ?? null,
        sample_count: o?.sample_count ?? 0,
      };
    });
  } else {
    const listQuery = admin
      .from("automation_runs")
      .select("*")
      .eq("status", "predicted")
      .eq("swarm_type", swarmType)
      .order("created_at", { ascending: false })
      .limit(100);
    if (params.before) listQuery.lt("created_at", params.before);
    if (params.topic) listQuery.eq("topic", params.topic);
    if (params.entity) listQuery.eq("entity", params.entity);
    if (params.mailbox) {
      const mb = parseInt(params.mailbox, 10);
      if (!Number.isNaN(mb)) listQuery.eq("mailbox_id", mb);
    }
    if (params.rule) {
      listQuery.eq("result->predicted->>rule", params.rule);
    }
    const listRes = await listQuery;
    rows = (listRes.data as PredictedRow[] | null) ?? [];
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
  let selectedRow: PredictedRow | null = null;
  if (params.selected) {
    const selRes = await admin
      .from("automation_runs")
      .select("*")
      .eq("id", params.selected)
      .single();
    selectedRow = (selRes.data as PredictedRow | null) ?? null;
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

  return { counts, rows, promotedToday, candidates, selectedRow };
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

  const data = await loadPageData(sp, admin, swarmType);
  const rowIds = data.rows.map((r) => r.id);

  return (
    <AutomationRealtimeProvider automations={[`${swarmType}-review`]}>
      <SelectionProvider
        initialSelectedId={sp.selected ?? null}
        rowIds={rowIds}
      >
        <div className="px-6 pt-12 pb-12 max-w-[1600px] mx-auto">
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
            />
            <DetailPane
              rows={data.rows}
              initialSelectedRow={data.selectedRow}
              swarmType={swarmType}
              categories={categories}
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
