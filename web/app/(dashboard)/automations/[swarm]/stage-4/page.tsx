// Phase 82 Plan 04 — Stage 4 RSC entry point on the unified _shell/ library.
//
// Loads Kanban rows filtered to result.kanban_reason === 'handler_error'.
// Mounts the registry-driven shell + AutomationRealtimeProvider for the
// `${swarmType}-kanban` channel. Stage 3 count is computed in the same query
// so the tab strip can show a live badge for that tab too.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Stage 4 surfaces handler-error rows ONLY (Stage 4 dispatch failures).
//   - Reclassify-as-noise dropdown source: swarm_noise_categories minus 'unknown' (Stage 1).
//   - Stage 4 has NO Replay-edit path (no intents loaded) — handler-errors
//     are either Reclassified to noise or Closed manually.
//   - Hard separation: Stage 1 noise registry vs Stage 3 intent registry —
//     never blurred. This page only needs the noise registry.
//
// W3 single-field rule (web/lib/swarms/types.ts:86): the canonical noise
// field is `category_key`. No legacy fallback.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadKanbanRows, type KanbanRow } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "../_shell/selection-context";
import { getSwarmMailboxes } from "../_shell/_lib/get-swarm-mailboxes";
import type { Row } from "../_shell/_lib/types";
import type { PipelineTimelineEvent } from "../_shell/detail-pane";
import { Stage4ClientShell } from "./client-shell";
import { buildStageAuditMap } from "../_shell/_lib/build-stage-audit-map";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{
    mailbox?: string | string[];
    selected?: string;
  }>;
}

// KanbanRow → unified Row. mailbox_id MUST be threaded through from the
// email_pipeline.emails JOIN so the V6 mailbox filter works (NOT a TODO).
function toUnifiedRow(k: KanbanRow): Row {
  return {
    id: k.id,
    from_name: k.email_metadata?.sender_name ?? null,
    from_email: k.email_metadata?.sender_email ?? null,
    subject: k.email_metadata?.subject ?? null,
    timestamp: k.email_metadata?.received_at ?? k.created_at,
    mailbox_id: k.email_metadata?.mailbox_id ?? null,
    stage_badge: { label: "handler_error", variant: "handler" },
  };
}

function parseSelectedMailboxes(p: string | string[] | undefined): number[] {
  const arr = Array.isArray(p) ? p : p ? [p] : [];
  return arr
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

export default async function Stage4Page({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Spoofing gate (T-76-07-01): unknown or disabled swarm → 404.
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  const [allRows, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);

  const stage4Rows = allRows.filter(
    (r) => r.result.kanban_reason === "handler_error",
  );
  const stage3Count = allRows.filter(
    (r) =>
      r.result.kanban_reason === "no_handler" ||
      r.result.kanban_reason === "low_confidence",
  ).length;

  // W3 single-field rule: canonical field is `category_key`.
  const reclassifyNoiseCategories = noiseCategories.filter(
    (c) => c.category_key !== "unknown",
  );

  const unifiedRows = stage4Rows.map(toUnifiedRow);
  const mailboxes = getSwarmMailboxes(swarmType, unifiedRows);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  const selectedId = sp.selected ?? null;

  // Body + timeline pre-fetch (Pitfall 3 — MANDATORY). Mirrors stage-1/page.tsx
  // lines 696-727 pattern: parallel SELECT against email_pipeline.emails
  // (body_text/body_html) and pipeline_events (timeline). V8 requires the
  // email body to render in the detail pane without a separate roundtrip.
  const bodyMap: Record<string, { bodyText: string; bodyHtml: string | null }> = {};
  const timelineMap: Record<string, PipelineTimelineEvent[]> = {};
  const emailIds = Array.from(
    new Set(
      stage4Rows
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
        currentStage={4}
        counts={{ 3: stage3Count, 4: stage4Rows.length }}
      />
      <AutomationRealtimeProvider
        automations={[`${swarmType}-kanban`]}
        initialLimit={500}
      >
        <SelectionProvider
          rowIds={stage4Rows.map((r) => r.id)}
          initialSelectedId={selectedId}
        >
          <Stage4ClientShell
            swarmType={swarmType}
            rows={stage4Rows}
            unifiedRows={unifiedRows}
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
