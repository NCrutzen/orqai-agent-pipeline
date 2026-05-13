// Phase 82 Plan 05 — Stage 3 RSC entry point on the unified _shell/ library.
//
// Loads Kanban rows filtered to result.kanban_reason ∈ {no_handler, low_confidence}.
// Mounts the registry-driven shell + AutomationRealtimeProvider for the
// `${swarmType}-kanban` channel. Stage 4 count is computed in the same query
// so the tab strip can show a live badge for that tab too (handler_error).
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Replay dropdown source: swarm_intents.handler_status='registered' (Stage 3).
//   - Reclassify-as-noise dropdown source: swarm_noise_categories minus 'unknown' (Stage 1).
//   - Hard separation: this page consumes BOTH registries but never blurs
//     them — `intents` and `categories` flow as SEPARATE props into the
//     unified detail pane, consumed by DISTINCT widgets (Stage3Widget /
//     Stage1Widget). A row exists in EXACTLY ONE of swarm_noise_categories
//     or swarm_intents — never both.
//
// V9 / D-18 bug fix is structural: the unified Row carries ONE `stage_badge`
// slot. The previous stage-3 row rendered the intent code TWICE (mid-row +
// right-aligned mono); this page maps KanbanRow → Row with the kanban_reason
// as the single badge label, and the intent code never appears on the row
// strip itself.
//
// W3 single-field rule (web/lib/swarms/types.ts:86): canonical noise field
// is `category_key`. No legacy fallback to a non-existent secondary field.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  loadSwarm,
  loadSwarmIntents,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadKanbanRows, type KanbanRow } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "../_shell/selection-context";
import { StageListChips } from "../_shell/stage-list-chips";
import { RowList } from "../_shell/row-list";
import { getSwarmMailboxes } from "../_shell/_lib/get-swarm-mailboxes";
import type { Row } from "../_shell/_lib/types";
import type { PipelineTimelineEvent } from "../_shell/detail-pane";
import { Stage3ClientShell } from "./client-shell";
import { buildStageAuditMap } from "../_shell/_lib/build-stage-audit-map";
import {
  loadStageFeedbackList,
  type FeedbackListRow,
} from "../_shell/_lib/feedback-list-loader";

export const dynamic = "force-dynamic";

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

// Phase 82.4 Plan 06 — map FeedbackListRow → unified Row for the Option Z
// audit list rendered ABOVE the live Kanban shell. Stage 3 client shell
// (Kanban) is left intact; Option Z is additive per Plan 06 Task 2 step 7,
// because Stage 3's existing surface is feature-rich (replay + reclassify
// dropdowns, internal chip filter) and the audit list serves a different
// role (training / spot-check across auto-handled rows).
//
// Hard-separation (RFC): the badge label echoes pipeline_events.decision for
// stage=3. Variant "intent" matches the existing Stage 3 surface — the loader
// guarantees these rows are Stage 3 verdicts, not Stage 1 noise emits.
function toUnifiedFeedbackRow(r: FeedbackListRow): Row {
  return {
    id: r.email_id,
    from_name: r.sender_name,
    from_email: r.sender_email,
    subject: r.subject,
    timestamp: r.received_at,
    mailbox_id: r.mailbox_id,
    stage_badge: { label: r.stage_state, variant: "intent" },
  };
}

// KanbanRow → unified Row. mailbox_id MUST be threaded through from the
// email_pipeline.emails JOIN so the V6 mailbox filter works. The badge
// label is the kanban_reason — never the intent code (V9 / D-18 lock).
function toUnifiedRow(k: KanbanRow): Row {
  const reason = k.result.kanban_reason;
  return {
    id: k.id,
    from_name: k.email_metadata?.sender_name ?? null,
    from_email: k.email_metadata?.sender_email ?? null,
    subject: k.email_metadata?.subject ?? null,
    timestamp: k.email_metadata?.received_at ?? k.created_at,
    mailbox_id: k.email_metadata?.mailbox_id ?? null,
    stage_badge: { label: reason, variant: "intent" },
  };
}

function parseSelectedMailboxes(p: string | string[] | undefined): number[] {
  const arr = Array.isArray(p) ? p : p ? [p] : [];
  return arr
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

export default async function Stage3Page({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Spoofing gate: unknown or disabled swarm → 404.
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Parallel server-side fetch — RESEARCH §Pattern 7 (no chained awaits).
  // Both registries loaded here; they remain SEPARATE at every downstream
  // boundary (hard separation per RFC).
  const [allRows, intents, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);

  const stage3Rows = allRows.filter(
    (r) =>
      r.result.kanban_reason === "no_handler" ||
      r.result.kanban_reason === "low_confidence",
  );
  const stage4Count = allRows.filter(
    (r) => r.result.kanban_reason === "handler_error",
  ).length;

  // Replay dropdown (Stage 3 — swarm_intents): only registered intents.
  // R-4 mitigation: prevent operator from picking a placeholder intent and
  // triggering silent fan-out into a non-existent handler.
  const replayIntents = intents.filter(
    (i) => i.handler_status === "registered",
  );
  // Reclassify dropdown (Stage 1 — swarm_noise_categories): exclude 'unknown'
  // (CONTEXT.md deferred-ideas; 'unknown' would round-trip the email back
  // through the pipeline, overlapping with Replay's purpose).
  const reclassifyNoiseCategories = noiseCategories.filter(
    (c) => c.category_key !== "unknown",
  );

  const unifiedRows = stage3Rows.map(toUnifiedRow);
  const mailboxes = getSwarmMailboxes(swarmType, unifiedRows);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  const selectedId = sp.selected ?? null;

  // Phase 82.4 Plan 06: Option Z audit list. Stage 3 keeps its live Kanban
  // surface (replay + reclassify dropdowns); the Option Z list is rendered as
  // an ADDITIVE "All Stage 3 verdicts" section above the Kanban shell so the
  // operator can spot-check auto-handled rows too (CONTEXT.md rationale —
  // audit-first; needs-action chip defaults OFF on every tab).
  const needsAction = sp.needs_action === "1";
  const mineOnly = sp.mine_only === "1";
  const supabaseSrv = await createClient();
  const { data: { user } } = await supabaseSrv.auth.getUser();
  const feedbackPage = await loadStageFeedbackList(admin, {
    stage: 3,
    swarmType,
    needsActionOnly: needsAction,
    mineOnly,
    operatorId: user?.id,
    before: sp.before,
  });
  const auditRows: Row[] = feedbackPage.rows.map(toUnifiedFeedbackRow);

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

  // Body + timeline pre-fetch (Pitfall 3 — MANDATORY). Mirrors Stage 1/4
  // pattern: parallel SELECT against email_pipeline.emails (body_text /
  // body_html) and pipeline_events (timeline). V8 requires the email body to
  // render in the detail pane without a separate roundtrip.
  const bodyMap: Record<string, { bodyText: string; bodyHtml: string | null }> = {};
  const timelineMap: Record<string, PipelineTimelineEvent[]> = {};
  const emailIds = Array.from(
    new Set(
      stage3Rows
        .map((r) => r.result?.email_id ?? null)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (emailIds.length > 0) {
    const bodiesPromise = admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, body_text, body_html")
      .in("id", emailIds);
    const timelinePromise = admin
      .from("pipeline_events")
      .select("id, stage, email_id, decision, created_at")
      .eq("swarm_type", swarmType)
      .in("email_id", emailIds)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true });

    const [bodiesRes, timelineRes] = await Promise.all([
      bodiesPromise,
      timelinePromise,
    ]);

    for (const e of (bodiesRes.data as Array<{
      id: string;
      body_text: string | null;
      body_html: string | null;
    }> | null) ?? []) {
      bodyMap[e.id] = {
        bodyText: e.body_text ?? "",
        bodyHtml: e.body_html || null,
      };
    }
    for (const ev of (timelineRes.data as Array<
      PipelineTimelineEvent & { email_id: string | null }
    > | null) ?? []) {
      const key = ev.email_id;
      if (!key) continue;
      (timelineMap[key] ??= []).push({
        stage: ev.stage,
        decision: ev.decision ?? null,
      });
    }
  }

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={3}
        counts={{ 3: stage3Rows.length, 4: stage4Count }}
      />
      {/* Phase 82.4 Plan 06: Option Z audit list — additive section above the
          live Kanban shell. Renders every Stage 3 verdict (auto-handled + own-
          reviewed + needs-action) so the operator can spot-check across the
          full Stage 3 surface. Chips default OFF (audit-first culture). */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-4) var(--space-4) 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <h2
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--v7-muted)",
              margin: 0,
            }}
          >
            All Stage 3 verdicts
          </h2>
          <StageListChips needsAction={needsAction} mineOnly={mineOnly} />
        </div>
        <RowList
          rows={auditRows}
          emptyState={{
            title: "No Stage 3 verdicts yet",
            body: "When the intent coordinator records a verdict, it will appear here.",
          }}
        />
        {loadMoreHref && (
          <div>
            <Link
              href={loadMoreHref}
              data-testid="stage-list-load-more"
              style={{ fontSize: 13, color: "var(--v7-brand-secondary)" }}
            >
              Load more
            </Link>
          </div>
        )}
      </div>
      <AutomationRealtimeProvider
        automations={[`${swarmType}-kanban`]}
        initialLimit={500}
      >
        <SelectionProvider
          rowIds={stage3Rows.map((r) => r.id)}
          initialSelectedId={selectedId}
        >
          <Stage3ClientShell
            swarmType={swarmType}
            rows={stage3Rows}
            unifiedRows={unifiedRows}
            intents={replayIntents}
            noiseCategories={reclassifyNoiseCategories}
            mailboxes={mailboxes}
            selectedMailboxes={selectedMailboxes}
            bodyMap={bodyMap}
            timelineMap={timelineMap}
            stageAudit={buildStageAuditMap({ timeline: [], agentRuns: [], automationRun: null })}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
