// Phase 82 Plan 02 — Stage 0 page on the unified `_shell/` library.
//
// Stage 0 = safety / prompt-injection filter. Per the locked RFC
// (docs/agentic-pipeline/README.md) Stage 0 is upstream of and orthogonal to
// the Stage 1 noise / Stage 3 intent hard-separation split: it touches NEITHER
// swarm_noise_categories NOR swarm_intents. Categories and intents are passed
// to the unified detail pane as empty arrays.
//
// Wave 2 scope:
//   - Render the same shell as Stages 1/3/4 even with zero row data (D-15/D-16).
//   - Info banner preserved verbatim above the row list (D-16).
//   - Empty-state copy "No rows yet — Stage 0 awaits backend wiring..." (D-15).
//   - Mailbox filter visible (no-op when no rows; D-12 multi-select still works).
//   - Empty detail pane copy ("Select a row to inspect...").
//   - NO AutomationRealtimeProvider — Stage 0 has no realtime channel today
//     (RESEARCH §Realtime). Phase 82 explicitly does NOT unify channels.
//
// Phase 999.x will wire the backend data source (pipeline_events with
// stage=0 / decision='injection_suspected'). Until then this surface stays
// empty by design — UX consistency wins over hiding the surface.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { RowList } from "../_shell/row-list";
import { MailboxFilter } from "../_shell/mailbox-filter";
import {
  OptionZDetailPane,
  type FullTimelineEvent,
} from "../_shell/option-z-detail-pane";
import { SelectionProvider } from "../_shell/selection-context";
import { StageListChips } from "../_shell/stage-list-chips";
import { getSwarmMailboxes } from "../_shell/_lib/get-swarm-mailboxes";
import { loadMailboxLabels } from "../_shell/_lib/load-mailbox-labels";
import { buildStageAuditMap } from "../_shell/_lib/build-stage-audit-map";
import {
  loadStageFeedbackList,
  type FeedbackListRow,
} from "../_shell/_lib/feedback-list-loader";
import { loadFeedbackMap } from "@/lib/automations/debtor-email/feedback/load-feedback-map";
import type { FeedbackMap } from "@/lib/automations/debtor-email/feedback/types";
import type { Row } from "../_shell/_lib/types";

export const dynamic = "force-dynamic";

// Phase 82.5 Plan 06 — Stage 0 hardcoded ACTIVE_STAGE literal. Stage 0 (safety)
// reads feedback bucketed by stage=0 only; never crosses Stage 1 (noise) or
// Stage 3 (intent) registries — hard-separation contract preserved.
const ACTIVE_STAGE = 0 as const;

// D-16: Stage 0 info banner copy. Preserved verbatim from the Phase 76 Plan 08
// placeholder so operators see continuity through the unified-shell migration.
// Wording locked — change only when the backend wiring lands and the banner
// needs to reference live data shape.
const STAGE_0_INFO_BANNER =
  "Stage 0 (Safety) — prompt-injection filter. The dedicated safety-review " +
  "surface is out of scope for Phase 76 and will be built in a follow-up " +
  "phase. Stage 0 today emits to pipeline_events with stage=0 and " +
  "decision='injection_suspected' for any email that fails the safety " +
  "filter; those rows surface in the existing queue (stage 1) for now.";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{
    mailbox?: string | string[];
    selected?: string;
    needs_action?: string;
    mine_only?: string;
    before?: string;
  }>;
}

// Phase 82.4 Plan 06: map a FeedbackListRow → unified Row. Stage 0 (safety) is
// upstream of Stage 1 / Stage 3 — the badge variant is "safety" and the label
// surfaces the decision (e.g. "injection_suspected" / "ok"). This page never
// surfaces a noise or intent code on the row strip.
function toUnifiedRow(r: FeedbackListRow): Row {
  return {
    id: r.email_id,
    from_name: r.sender_name,
    from_email: r.sender_email,
    subject: r.subject,
    timestamp: r.received_at,
    mailbox_id: r.mailbox_id,
    stage_badge: { label: r.stage_state, variant: "safety" },
  };
}

export default async function Stage0Page({ params, searchParams }: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Spoofing gate: unknown/disabled swarm → 404 (mirrors stage-2/page.tsx).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Phase 82.4 Plan 06: Option Z list source. Stage 0 = safety stage (upstream
  // of swarm_noise_categories and swarm_intents; hard separation preserved by
  // the loader filtering on stage=0 only).
  // Stage 0 = safety filter. Per the file banner + the RFC, this surface
  // exists for emails the safety filter flagged (injection_suspected /
  // unknown_legacy). 'safe' rows pass through silently and should NOT
  // surface here — they would otherwise drown the actionable rows in
  // thousands of noise verdicts. Force needsActionOnly regardless of URL
  // param; the chip toggle stays for `mine_only` only.
  const mineOnly = sp.mine_only === "1";
  const needsAction = true; // hardcoded for Stage 0 — see comment above
  const supabaseSrv = await createClient();
  const { data: { user } } = await supabaseSrv.auth.getUser();
  const feedbackPage = await loadStageFeedbackList(admin, {
    stage: 0,
    swarmType,
    needsActionOnly: needsAction,
    mineOnly,
    operatorId: user?.id,
    before: sp.before,
  });
  const allRows: Row[] = feedbackPage.rows.map(toUnifiedRow);
  const mailboxLabels = await loadMailboxLabels(admin, swarmType);
  const mailboxes = getSwarmMailboxes(allRows, mailboxLabels);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  // Server-side mailbox filter — MailboxFilter uses router.push so the URL
  // change triggers a server re-render. Filter the current page against
  // the selected mailbox ids; null mailbox_id rows are dropped on filter.
  const rows: Row[] = selectedMailboxes.length > 0
    ? allRows.filter((r) => r.mailbox_id !== null && selectedMailboxes.includes(r.mailbox_id))
    : allRows;
  const selectedId = sp.selected ?? null;

  // Phase 82.4 follow-up: pre-fetch body + timeline for EVERY visible row.
  // SelectionProvider syncs via history.replaceState (no server re-render),
  // so a server-side per-selection fetch would never re-run on click. Pass
  // bulk maps to the client OptionZDetailPane wrapper which picks the right
  // one from useSelection().
  const bodyMap: Record<string, string | null> = {};
  const timelineMap: Record<string, FullTimelineEvent[]> = {};
  // Phase 82.5 Plan 06: server-side feedback prefetch — parallel with body
  // + timeline so additive latency stays < 100ms (CONTEXT assumption 4).
  // viewerId reuses the existing `user` binding above; null on unauth.
  const viewerId = user?.id ?? null;
  let feedbackMap: FeedbackMap = {};
  if (rows.length > 0) {
    const emailIds = rows.map((r) => r.id);
    const [bodiesRes, timelineRes, fmap] = await Promise.all([
      admin
        .schema("email_pipeline")
        .from("emails")
        .select("id, body_text")
        .in("id", emailIds),
      admin
        .from("pipeline_events")
        .select("id, stage, decision, decision_details, created_at, email_id")
        .in("email_id", emailIds)
        .order("created_at", { ascending: true }),
      loadFeedbackMap(admin, emailIds, ACTIVE_STAGE, viewerId),
    ]);
    feedbackMap = fmap;
    for (const b of ((bodiesRes.data ?? []) as Array<{ id: string; body_text: string | null }>)) {
      bodyMap[b.id] = b.body_text;
    }
    for (const e of ((timelineRes.data ?? []) as Array<FullTimelineEvent & { email_id: string }>)) {
      const list = timelineMap[e.email_id] ?? [];
      list.push(e);
      timelineMap[e.email_id] = list;
    }
  }

  // Phase 82.5 Plan 06: server-side reduction → per-row latest verdict for
  // the RowList strip. Own latest wins; otherwise first "other" operator's
  // verdict (Pattern E, desc-ordered scan from loadFeedbackMap).
  const rowVerdictMap: Record<string, "confirm" | "override" | "unclear" | null> = {};
  for (const [id, entry] of Object.entries(feedbackMap)) {
    rowVerdictMap[id] = entry.own_latest?.verdict ?? entry.others[0]?.verdict ?? null;
  }

  // Phase 82.4 Plan 06: build "Load more" href preserving every other URL param
  // and bumping `before` to the next cursor. Pure server-side; no client hook.
  const loadMoreHref: string | null = (() => {
    if (!feedbackPage.nextBefore) return null;
    const qs = new URLSearchParams();
    if (Array.isArray(sp.mailbox)) {
      for (const m of sp.mailbox) qs.append("mailbox", m);
    } else if (sp.mailbox) {
      qs.append("mailbox", sp.mailbox);
    }
    if (needsAction) qs.set("needs_action", "1");
    if (mineOnly) qs.set("mine_only", "1");
    if (sp.selected) qs.set("selected", sp.selected);
    qs.set("before", feedbackPage.nextBefore);
    return `?${qs.toString()}`;
  })();

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip swarm={swarm} currentStage={0} />
      <SelectionProvider
        rowIds={rows.map((r) => r.id)}
        initialSelectedId={selectedId}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
          }}
        >
          {/* D-16: Stage 0 info banner sits ABOVE the row list. */}
          <div
            role="note"
            style={{
              padding: "var(--space-3)",
              borderLeft: "2px solid var(--v7-brand-secondary)",
              background: "var(--v7-panel-2)",
              color: "var(--v7-text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
              borderRadius: "var(--v7-radius-sm)",
            }}
          >
            {STAGE_0_INFO_BANNER}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
            }}
          >
            {/* Phase 82.4 Plan 06: Option Z toggle chips (default OFF). */}
            <StageListChips needsAction={needsAction} mineOnly={mineOnly} />
            <MailboxFilter
              mailboxes={mailboxes}
              selected={selectedMailboxes}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(640px, 1fr) 540px",
              gap: "var(--space-3)",
              minHeight: 320,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <RowList
                rows={rows}
                emptyState={{
                  title: "No Stage 0 verdicts yet",
                  body: "When the safety filter records a verdict, it will appear here.",
                }}
                feedbackMap={rowVerdictMap}
                mailboxLabels={mailboxLabels}
              />
              {loadMoreHref && (
                <div style={{ padding: "var(--space-3) var(--space-4)" }}>
                  <Link
                    href={loadMoreHref}
                    data-testid="stage-list-load-more"
                    style={{
                      fontSize: 13,
                      color: "var(--v7-brand-secondary)",
                    }}
                  >
                    Load more
                  </Link>
                </div>
              )}
            </div>
            {/* Hard-separation contract: Stage 0 page passes categories=[] AND
                intents=[] — Stage 0 is upstream of both registries. */}
            {/* Phase 82.4 follow-up — selection now wired through a client
                wrapper that reads useSelection() and picks from bulk-loaded
                bodyMap + timelineMap. Server pre-fetches for the visible
                page; client picks per click without a server re-render.    */}
            <OptionZDetailPane
              swarmType={swarmType}
              activeStage={0}
              rows={rows}
              bodyMap={bodyMap}
              timelineMap={timelineMap}
              mailboxLabels={mailboxLabels}
              feedbackMap={feedbackMap}
            />
          </div>
        </div>
      </SelectionProvider>
    </>
  );
}

function parseSelectedMailboxes(
  p: string | string[] | undefined,
): number[] {
  const arr = Array.isArray(p) ? p : p ? [p] : [];
  return arr
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}
