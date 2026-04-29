// Phase 60-05 (D-10/D-13/D-14/D-21). Queue-driven Bulk Review page.
//
// This page reads ONLY from `public.automation_runs WHERE status='predicted'`
// (D-10). The previous Outlook live-fetch + 5×300 window walk is gone.
//
// Counts come from the `public.classifier_queue_counts` RPC (D-13). Row
// pagination is cursor-based on `created_at` with a page size of 100 (D-14).
// The race-cohort banner (D-21) renders only for rules promoted today with
// remaining predicted rows.
//
// Phase 61-02 layout:
//   3-column grid [clamp(220px,18vw,280px) minmax(380px,460px) 1fr],
//   max-w-[1600px], min-w-0 hygiene on every child. ?selected=<row-id>
//   loads a single row server-side and feeds the right-column DetailPane.
//   Pending promotion is now a sibling node in QueueTree, so we always
//   fetch the candidate list (small table, cheap).

import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
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
 * Each filter is conditionally applied. Supabase JS treats successive
 * `.eq()` calls as additive AND filters on the same builder. We mutate
 * the same query reference (rather than reassigning) so the recorded
 * call list in the unit test reflects every applied filter.
 */
export async function loadPageData(
  params: PageSearchParams,
  admin: ReturnType<typeof createAdminClient>,
): Promise<PageData> {
  // 1. Counts: single RPC, GROUP BY (swarm_type, topic, entity, mailbox_id).
  const countsRes = await admin.rpc("classifier_queue_counts", {
    p_swarm_type: "debtor-email",
  });
  const counts = (countsRes.data as QueueCountRow[] | null) ?? [];

  // 2. Predicted rows: cursor pagination, page-size 100.
  const listQuery = admin
    .from("automation_runs")
    .select("*")
    .eq("status", "predicted")
    .eq("swarm_type", "debtor-email")
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
    .eq("swarm_type", "debtor-email")
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
      .eq("swarm_type", "debtor-email")
      .eq("status", "candidate");
    candidates = (candRes.data as ClassifierCandidate[] | null) ?? [];
  } else {
    // Tree-badge count only — fetch the rule_key list (cheap).
    const candRes = await admin
      .from("classifier_rules")
      .select("rule_key, status, n, ci_lo")
      .eq("swarm_type", "debtor-email")
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
  searchParams: Promise<PageSearchParams>;
}

export default async function DebtorEmailReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const admin = createAdminClient();
  const data = await loadPageData(params, admin);
  const rowIds = data.rows.map((r) => r.id);

  return (
    <AutomationRealtimeProvider automations={["debtor-email-review"]}>
      <SelectionProvider
        initialSelectedId={params.selected ?? null}
        rowIds={rowIds}
      >
        <div className="px-6 pt-12 pb-12 max-w-[1600px] mx-auto">
          <h1 className="text-[28px] font-semibold leading-[1.2] font-[family-name:var(--font-cabinet)]">
            Bulk Review
          </h1>
          <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2 mb-6">
            Review predicted classifications. Approved rows trigger Outlook
            categorize+archive and iController delete in the background.
          </p>
          <div className="grid grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr] gap-4 min-w-0">
            <QueueTree
              counts={data.counts}
              selection={params}
              candidates={data.candidates}
              promotedTodayCount={data.promotedToday.length}
            />
            <RowList
              rows={data.rows}
              promotedToday={data.promotedToday}
              candidates={data.candidates}
              selection={params}
            />
            <DetailPane
              rows={data.rows}
              initialSelectedRow={data.selectedRow}
            />
          </div>
          <KeyboardShortcuts rowIds={rowIds} />
          <Cheatsheet />
        </div>
      </SelectionProvider>
    </AutomationRealtimeProvider>
  );
}
