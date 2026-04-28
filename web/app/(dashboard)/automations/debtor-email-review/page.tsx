// Phase 60-05 (D-10/D-13/D-14/D-21). Queue-driven Bulk Review page.
//
// This page reads ONLY from `public.automation_runs WHERE status='predicted'`
// (D-10). The previous Outlook live-fetch + 5×300 window walk is gone.
//
// Counts come from the `public.classifier_queue_counts` RPC (D-13). Row
// pagination is cursor-based on `created_at` with a page size of 100 (D-14).
// The race-cohort banner (D-21) renders only for rules promoted today with
// remaining predicted rows.

import { createAdminClient } from "@/lib/supabase/admin";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { QueueTree } from "./queue-tree";
import { PredictedRowList } from "./predicted-row-list";

export const dynamic = "force-dynamic";

export interface PageSearchParams {
  topic?: string;
  entity?: string;
  mailbox?: string;
  rule?: string;
  tab?: string;
  before?: string;
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

  // 4. Pending-promotion tab — classifier_rules.status='candidate' (D-15).
  let candidates: ClassifierCandidate[] = [];
  if (params.tab === "pending") {
    const candRes = await admin
      .from("classifier_rules")
      .select("rule_key, status, n, ci_lo")
      .eq("swarm_type", "debtor-email")
      .eq("status", "candidate");
    candidates = (candRes.data as ClassifierCandidate[] | null) ?? [];
  }

  return { counts, rows, promotedToday, candidates };
}

interface PageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function DebtorEmailReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const admin = createAdminClient();
  const data = await loadPageData(params, admin);

  return (
    <AutomationRealtimeProvider automations={["debtor-email-review"]}>
      <div className="px-8 pt-16 pb-12 max-w-[1280px] mx-auto">
        <h1 className="text-[28px] font-semibold leading-[1.2] font-[family-name:var(--font-cabinet)]">
          Bulk Review
        </h1>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2 mb-6">
          Review predicted classifications. Approved rows trigger Outlook
          categorize+archive and iController delete in the background.
        </p>
        <div className="grid grid-cols-[320px_1fr] gap-6">
          <QueueTree counts={data.counts} selection={params} />
          <PredictedRowList
            rows={data.rows}
            promotedToday={data.promotedToday}
            candidates={data.candidates}
            selection={params}
          />
        </div>
      </div>
    </AutomationRealtimeProvider>
  );
}
