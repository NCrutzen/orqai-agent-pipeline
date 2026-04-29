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
  const rows = (listRes.data as PredictedRow[] | null) ?? [];

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
