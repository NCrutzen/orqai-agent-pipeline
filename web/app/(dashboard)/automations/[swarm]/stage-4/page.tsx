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
import { loadMailboxLabels } from "../_shell/_lib/load-mailbox-labels";
import type { Row } from "../_shell/_lib/types";
import type { PipelineTimelineEvent } from "../_shell/detail-pane";
import { Stage4ClientShell } from "./client-shell";
import { buildStageAuditMap } from "../_shell/_lib/build-stage-audit-map";
import {
  loadAutoArchivedNoiseRows,
  type AutoArchivedNoiseRow,
} from "./_lib/load-auto-archived-noise-rows";

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
function toUnifiedRow(
  k: KanbanRow,
  badgeLabel: string = "handler_error",
): Row {
  return {
    id: k.id,
    from_name: k.email_metadata?.sender_name ?? null,
    from_email: k.email_metadata?.sender_email ?? null,
    subject: k.email_metadata?.subject ?? null,
    timestamp: k.email_metadata?.received_at ?? k.created_at,
    mailbox_id: k.email_metadata?.mailbox_id ?? null,
    stage_badge: { label: badgeLabel, variant: "handler" },
  };
}

// AutoArchivedNoiseRow → unified Row. Selection key is the pipeline_events.id
// (`row.id`) to disambiguate from handler-error rows; bodyMap is keyed on
// `email_id` so the detail-pane lookup chain still resolves. mailbox_id from
// email_pipeline.emails is a string in this schema — parse to int for the
// V6 mailbox filter (null on parse failure).
function autoArchivedToUnifiedRow(a: AutoArchivedNoiseRow): Row {
  const mbRaw = a.email_metadata?.mailbox_id ?? null;
  const mb = mbRaw != null ? Number.parseInt(mbRaw, 10) : null;
  return {
    id: a.id,
    from_name: a.email_metadata?.sender_name ?? null,
    from_email: a.email_metadata?.sender_email ?? null,
    subject: a.email_metadata?.subject ?? null,
    timestamp: a.email_metadata?.received_at ?? a.created_at,
    mailbox_id: mb !== null && !Number.isNaN(mb) ? mb : null,
    stage_badge: { label: "auto_archived", variant: "handler" },
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

  const [allRows, noiseCategories, autoArchivedRows] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
    loadAutoArchivedNoiseRows(admin, swarmType, { limit: 500 }),
  ]);

  // Phase 82.8-05 D-02 — three sections on Stage 4:
  //   1. Handler error  → kanban_reason === 'handler_error'   (red, default OPEN)
  //   2. Needs review   → kanban_reason === 'handler_needs_review' (amber, COLLAPSED, empty today)
  //   3. Auto-archived  → pipeline_events stage=4 auto_archived_noise (lime, COLLAPSED)
  const handlerErrorRows = allRows.filter(
    (r) => r.result.kanban_reason === "handler_error",
  );
  const needsReviewRows = allRows.filter(
    (r) => r.result.kanban_reason === "handler_needs_review",
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

  const handlerErrorUnified = handlerErrorRows.map((r) => toUnifiedRow(r, "handler_error"));
  const needsReviewUnified = needsReviewRows.map((r) => toUnifiedRow(r, "handler_needs_review"));
  const autoArchivedUnified = autoArchivedRows.map(autoArchivedToUnifiedRow);
  // Combined for mailbox filter / selection registration. Handler-error first
  // (default-open section) so its rows are reachable by keyboard nav before
  // collapsed-section rows.
  const unifiedRows = [
    ...handlerErrorUnified,
    ...needsReviewUnified,
    ...autoArchivedUnified,
  ];
  const mailboxLabels = await loadMailboxLabels(admin, swarmType);
  const mailboxes = getSwarmMailboxes(unifiedRows, mailboxLabels);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  const selectedId = sp.selected ?? null;

  // Body + timeline pre-fetch (Pitfall 3 — MANDATORY). Mirrors stage-1/page.tsx
  // lines 696-727 pattern: parallel SELECT against email_pipeline.emails
  // (body_text/body_html) and pipeline_events (timeline). V8 requires the
  // email body to render in the detail pane without a separate roundtrip.
  const bodyMap: Record<string, { bodyText: string; bodyHtml: string | null }> = {};
  const timelineMap: Record<string, PipelineTimelineEvent[]> = {};
  // Phase 82.8-05 — pre-fetch covers handler-error + needs-review kanban rows
  // (have `result.email_id`) PLUS auto-archived rows (have direct `email_id`).
  // Auto-archived loader already returns body_text/body_html inline, so we
  // short-circuit those into bodyMap below and skip them in the SELECT.
  const kanbanEmailIds = [
    ...handlerErrorRows.map((r) => r.result?.email_id ?? null),
    ...needsReviewRows.map((r) => r.result?.email_id ?? null),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const autoArchivedEmailIds = autoArchivedRows.map((r) => r.email_id);
  const emailIds = Array.from(new Set([...kanbanEmailIds, ...autoArchivedEmailIds]));

  // Inline-fill bodyMap for auto-archived rows: the loader already fetched
  // body_text/body_html as part of its Pass 2 SELECT. No second round-trip.
  for (const r of autoArchivedRows) {
    if (r.body_text != null || r.body_html != null) {
      bodyMap[r.email_id] = {
        bodyText: r.body_text ?? "",
        bodyHtml: r.body_html ?? null,
      };
    }
  }
  // Phase 82.8-07 D-03 — preload iController before/after screenshot paths
  // for every visible email_id. Single SELECT against debtor.email_labels;
  // the detail-pane mounts <StageScreenshotStrip> in the Stage 1 audit
  // expander (re-used by Auto-archived rows). Non-debtor-email swarms have
  // no email_labels rows → empty map → strip renders empty state.
  const screenshotPathsByEmailId: Record<
    string,
    { before: string | null; after: string | null }
  > = {};
  if (emailIds.length > 0) {
    const bodiesPromise = admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, body_text, body_html, source_id")
      .in("id", emailIds);
    const timelinePromise = admin
      .from("pipeline_events")
      .select("id, stage, email_id, decision, confidence, decision_details, created_at")
      .eq("swarm_type", swarmType)
      .in("email_id", emailIds)
      .order("stage", { ascending: true })
      .order("created_at", { ascending: true });
    const labelsPromise = admin
      .schema("debtor")
      .from("email_labels")
      .select("email_id, screenshot_before_path, screenshot_after_path")
      .in("email_id", emailIds);

    const [bodiesRes, timelineRes, labelsRes] = await Promise.all([
      bodiesPromise,
      timelinePromise,
      labelsPromise,
    ]);
    for (const row of (labelsRes.data as Array<{
      email_id: string;
      screenshot_before_path: string | null;
      screenshot_after_path: string | null;
    }> | null) ?? []) {
      screenshotPathsByEmailId[row.email_id] = {
        before: row.screenshot_before_path ?? null,
        after: row.screenshot_after_path ?? null,
      };
    }

    // source_id → email_id map for the cleanup-worker lookup below.
    // cleanup-worker stores Outlook message_id in result.message_id;
    // emails.source_id is the same identifier (debtor-email/ingest/route.ts:215).
    const sourceIdToEmailId = new Map<string, string>();
    for (const e of (bodiesRes.data as Array<{
      id: string;
      body_text: string | null;
      body_html: string | null;
      source_id: string | null;
    }> | null) ?? []) {
      bodyMap[e.id] = {
        bodyText: e.body_text ?? "",
        bodyHtml: e.body_html || null,
      };
      if (e.source_id) sourceIdToEmailId.set(e.source_id, e.id);
    }
    for (const ev of (timelineRes.data as Array<
      PipelineTimelineEvent & { email_id: string | null }
    > | null) ?? []) {
      const key = ev.email_id;
      if (!key) continue;
      (timelineMap[key] ??= []).push({
        stage: ev.stage,
        decision: ev.decision ?? null,
        decision_details: ev.decision_details ?? null,
        confidence: ev.confidence ?? null,
      });
    }

    // Phase 82.8-12 — fill screenshot paths for Auto-archived rows from
    // automation_runs.result.screenshots. The noise-cleanup pipeline
    // (debtor-email-icontroller-cleanup-worker.ts:146) stores screenshots
    // here, not on debtor.email_labels. email_labels paths (above) win for
    // the intent-labeled subset; this pass fills in the rest.
    const sourceIds = Array.from(sourceIdToEmailId.keys());
    if (sourceIds.length > 0) {
      // PostgREST URL length safety: chunk into 50, mirroring loadEmailMailboxes.
      // Outlook message_ids are ~70 chars each; a 241-row .in(...) easily
      // exceeds PostgREST's default ~8KB URL cap and returns empty silently.
      const CHUNK = 50;
      const cleanupRows: Array<{
        result: {
          message_id?: string;
          screenshots?: {
            before?: { path?: string | null } | null;
            after?:  { path?: string | null } | null;
          } | null;
        } | null;
      }> = [];
      for (let i = 0; i < sourceIds.length; i += CHUNK) {
        const slice = sourceIds.slice(i, i + CHUNK);
        const { data, error } = await admin
          .from("automation_runs")
          .select("result, created_at")
          .eq("automation", "debtor-email-cleanup")
          .in("result->>message_id", slice)
          .order("created_at", { ascending: false });
        if (error) {
          // eslint-disable-next-line no-console
          console.warn(
            `stage-4 cleanup-runs lookup failed (chunk ${i}): ${error.message}`,
          );
          continue;
        }
        if (data) cleanupRows.push(...(data as typeof cleanupRows));
      }
      for (const r of cleanupRows) {
        const msgId = r.result?.message_id;
        if (!msgId) continue;
        const eid = sourceIdToEmailId.get(msgId);
        if (!eid) continue;
        if (screenshotPathsByEmailId[eid]) continue; // email_labels paths win
        const before = r.result?.screenshots?.before?.path ?? null;
        const after = r.result?.screenshots?.after?.path ?? null;
        if (before == null && after == null) continue;
        screenshotPathsByEmailId[eid] = { before, after };
      }
    }
  }

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={4}
        counts={{
          3: stage3Count,
          // Stage 4 tab badge = handler_error count only (the active-needs-attention
          // bucket). needs-review (empty) and auto-archived (informational) are NOT
          // counted in the tab badge to keep operator focus on the action lane.
          4: handlerErrorRows.length,
        }}
      />
      <AutomationRealtimeProvider
        automations={[`${swarmType}-kanban`]}
        initialLimit={500}
      >
        <SelectionProvider
          // Phase 82.8-05 — selection rowIds span all three sections.
          // Handler-error first (default-open) for keyboard nav priority.
          rowIds={[
            ...handlerErrorRows.map((r) => r.id),
            ...needsReviewRows.map((r) => r.id),
            ...autoArchivedRows.map((r) => r.id),
          ]}
          initialSelectedId={selectedId}
        >
          <Stage4ClientShell
            swarmType={swarmType}
            rows={handlerErrorRows}
            unifiedRows={handlerErrorUnified}
            needsReviewRows={needsReviewRows}
            needsReviewUnified={needsReviewUnified}
            autoArchivedRows={autoArchivedRows}
            autoArchivedUnified={autoArchivedUnified}
            handlerErrorCount={handlerErrorRows.length}
            needsReviewCount={needsReviewRows.length}
            autoArchivedCount={autoArchivedRows.length}
            noiseCategories={reclassifyNoiseCategories}
            mailboxes={mailboxes}
            selectedMailboxes={selectedMailboxes}
            bodyMap={bodyMap}
            timelineMap={timelineMap}
            stageAudit={buildStageAuditMap({ timeline: [], agentRuns: [], automationRun: null })}
            mailboxLabels={mailboxLabels}
            screenshotPathsByEmailId={screenshotPathsByEmailId}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
