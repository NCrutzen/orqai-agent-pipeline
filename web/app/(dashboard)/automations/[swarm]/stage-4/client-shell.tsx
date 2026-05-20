"use client";

// Phase 88 Plan 04 Task 1: Width fix branch = A (NO regression per Wave 0 Q3).
// See .planning/phases/88-review-surface-cleanup/88-WAVE0-FINDINGS.md Q3.
// Sticky wrapper at ~line 435 retained unchanged.
//
// Phase 88 Plan 04 D-03 — Stage 4 outcome-state chip-strip (replaces the
// three collapsible sections from Phase 82.8 Plan 05).
//
// Outcome chips (bounded set, NOT per-handler — see CONTEXT D-03a lock):
//   1. All             — union of all three buckets
//   2. Handler error   (red)   — handler_error kanban rows
//   3. Needs review    (amber) — handler_needs_review kanban rows
//   4. Auto-archived   (lime)  — pipeline_events stage=4 auto_archived_noise
//
// URL contract: `?outcome=handler_error|needs_review|auto_archived` (omit for "all").
// Chip click → router.replace; selecting "All" deletes the param.
//
// Hard-separation contract (docs/agentic-pipeline/README.md):
//   - `categories` prop = swarm_noise_categories (Stage 1 widget — Reclassify).
//   - `intents` prop = [] (Stage 4 has NO Replay path; preserves hard
//     separation — never blurs Stage 1 noise vs Stage 3 intent).
//   - Auto-archived rows are Stage 1 noise-filter outputs surfaced as Stage 4
//     telemetry events for the "handled" overview; they remain rooted in
//     the noise registry (NEVER the intent registry).
//   - activeStage = 4 so the Stage 4 cell is pre-expanded.
//
// Selection model: a single selectedId spans all three sections (now: all
// chip buckets). For the Auto-archived bucket the row id is the
// pipeline_events.id; detail-pane body/timeline lookups still key off
// email_id (resolved via the relevant row source — bodyMap is keyed on
// email_id and was filled inline by the page-side loader). Handler-error
// widget only renders for KanbanRow selections — not for auto-archived
// selections. The chip filter narrows what's *visible*; selectedId may
// point to a row that's currently hidden, and the existing resolution
// logic (selectedRow visibility guard) decides whether the widget renders.

import { useCallback, useMemo } from "react";

import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type {
  FeedbackMap,
  FeedbackReadBack,
} from "@/lib/automations/debtor-email/feedback/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import type { AutoArchivedNoiseRow } from "./_lib/load-auto-archived-noise-rows";
import { RowList } from "../_shell/row-list";
import { MailboxFilter } from "../_shell/mailbox-filter";
import {
  UnifiedDetailPane,
  type PipelineTimelineEvent,
} from "../_shell/detail-pane";
import type { StageAuditMap } from "../_shell/_lib/audit-types";
import { useSelection } from "../_shell/selection-context";
import { StageScreenshotStrip } from "@/components/automations/bulk-review/audit/StageScreenshotStrip";
import { KeyboardShortcuts } from "../_shell/keyboard-shortcuts";
import type { MailboxOption } from "../_shell/_lib/get-swarm-mailboxes";
import type { Row } from "../_shell/_lib/types";
import { ChipStrip, type ChipStripChip } from "../_shell/chip-strip";
import { useRouter, useSearchParams } from "next/navigation";

interface BodyEntry {
  bodyText: string;
  bodyHtml: string | null;
}

export interface Stage4ClientShellProps {
  swarmType: string;
  // Handler-error (section 1, default-open) — drives the detail-pane.
  rows: KanbanRow[];
  unifiedRows: Row[];
  // Needs-review (section 2, COLLAPSED; empty today).
  needsReviewRows: KanbanRow[];
  needsReviewUnified: Row[];
  // Auto-archived (section 3, COLLAPSED).
  autoArchivedRows: AutoArchivedNoiseRow[];
  autoArchivedUnified: Row[];
  // Section header counts (rendered in the trigger badge).
  handlerErrorCount: number;
  needsReviewCount: number;
  autoArchivedCount: number;

  noiseCategories: SwarmNoiseCategoryRow[];
  mailboxes: MailboxOption[];
  selectedMailboxes: number[];
  bodyMap: Record<string, BodyEntry>;
  timelineMap: Record<string, PipelineTimelineEvent[]>;
  stageAudit?: StageAuditMap;
  mailboxLabels?: Record<number, string>;
  /** Phase 82.5 Plan 06 — Stage 4 has no panel surface (paneFeedbackMap is
   *  always undefined here per ACTIVE_STAGE > 3 guard). Stage 4 still receives
   *  a verdict dot in the row strip (R3) for symmetry; the feedbackMap is
   *  optional so callers can omit it until the Stage 4 page wires the loader. */
  feedbackMap?: FeedbackMap;
  /** Phase 82.8-07 D-03 — iController before/after screenshot paths keyed by
   *  email_id. Used by Auto-archived rows whose detail-pane reuses the same
   *  Stage 1 audit expander mount-point. Handler-error rows usually have NULL
   *  paths (the failure aborted before the after-screenshot) → empty state. */
  screenshotPathsByEmailId?: Record<string, { before: string | null; after: string | null }>;
  /** Phase 88 Plan 04 D-03 — outcome-state chip filter (URL `?outcome=`).
   *  Drives which subset of rows is rendered in the unified RowList. */
  activeOutcome: "all" | "handler_error" | "needs_review" | "auto_archived";
}

// Phase 82.5 Plan 06: ACTIVE_STAGE literal — Stage 4 (handler-error). Note
// paneFeedbackMap is gated to undefined when ACTIVE_STAGE > 3.
const ACTIVE_STAGE = 4 as const;

export function Stage4ClientShell({
  swarmType,
  rows,
  unifiedRows,
  needsReviewRows,
  needsReviewUnified,
  autoArchivedRows,
  autoArchivedUnified,
  handlerErrorCount,
  needsReviewCount,
  autoArchivedCount,
  noiseCategories,
  mailboxes,
  selectedMailboxes,
  bodyMap,
  timelineMap,
  stageAudit,
  mailboxLabels,
  feedbackMap,
  screenshotPathsByEmailId,
  activeOutcome,
}: Stage4ClientShellProps) {
  const { selectedId } = useSelection();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Phase 88 Plan 04 D-03 — chip-click → URL writer. "all" deletes the param;
  // other keys set ?outcome=<key>. Uses router.replace so back-button shows
  // pre-Stage-4 history, not chip-toggle history.
  const onChipSelect = useCallback(
    (key: string) => {
      const qs = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "all") qs.delete("outcome");
      else qs.set("outcome", key);
      const q = qs.toString();
      router.replace(q ? `?${q}` : "?");
    },
    [router, searchParams],
  );

  // Apply mailbox filter client-side across all three sections. Server-rendered
  // lists are the full set; URL ?mailbox= params narrow them. Mirrors Stage 1.
  const filterByMailbox = useMemo(() => {
    if (selectedMailboxes.length === 0) {
      return (xs: Row[]) => xs;
    }
    const allowed = new Set(selectedMailboxes);
    return (xs: Row[]) =>
      xs.filter((r) => r.mailbox_id !== null && allowed.has(r.mailbox_id));
  }, [selectedMailboxes]);

  const visibleUnified = useMemo(() => filterByMailbox(unifiedRows), [filterByMailbox, unifiedRows]);
  const visibleNeedsReview = useMemo(() => filterByMailbox(needsReviewUnified), [filterByMailbox, needsReviewUnified]);
  const visibleAutoArchived = useMemo(() => filterByMailbox(autoArchivedUnified), [filterByMailbox, autoArchivedUnified]);

  const visibleKanbanIds = useMemo(
    () => new Set(visibleUnified.map((r) => r.id)),
    [visibleUnified],
  );

  // Detail-pane selection — handler-error rows only. Auto-archived & needs-review
  // selection-by-click is permitted but does NOT mount the handler-error widget
  // (no error to surface for auto-archived; needs-review widget arrives later).
  const selectedRow: KanbanRow | null = useMemo(() => {
    if (!selectedId) return null;
    const k = rows.find((r) => r.id === selectedId);
    if (!k) return null;
    if (!visibleKanbanIds.has(k.id)) return null;
    return k;
  }, [rows, selectedId, visibleKanbanIds]);

  // Phase 82.8-11 — search across ALL three section row sets, not just
  // visibleUnified (which is handler-error only per the page's
  // unifiedRows={handlerErrorUnified} prop). Otherwise Auto-archived /
  // Needs-review selections fail to resolve and the pane stays empty.
  const selectedUnified: Row | null = useMemo(() => {
    if (!selectedId) return null;
    return (
      visibleUnified.find((r) => r.id === selectedId) ??
      visibleNeedsReview.find((r) => r.id === selectedId) ??
      visibleAutoArchived.find((r) => r.id === selectedId) ??
      null
    );
  }, [visibleUnified, visibleNeedsReview, visibleAutoArchived, selectedId]);

  // Phase 82.8-11 — widen selectedEmailId resolution across all three sections.
  // Handler-error & Needs-review rows: row.id = kanban_id, email_id on `result`.
  // Auto-archived rows: row.id = pipeline_events.id, email_id as direct field.
  const selectedEmailId = useMemo<string | null>(() => {
    if (!selectedId) return null;
    if (selectedRow?.result?.email_id) return selectedRow.result.email_id as string;
    const nr = needsReviewRows.find((r) => r.id === selectedId);
    if (nr?.result?.email_id) return nr.result.email_id as string;
    const a = autoArchivedRows.find((r) => r.id === selectedId);
    if (a?.email_id) return a.email_id;
    return null;
  }, [selectedId, selectedRow, needsReviewRows, autoArchivedRows]);
  const body = selectedEmailId ? bodyMap[selectedEmailId] ?? null : null;
  const timeline = selectedEmailId ? timelineMap[selectedEmailId] ?? [] : [];

  // Phase 82.8-07 D-03 — UnifiedDetailPane looks up screenshot paths via
  // `row.id`. In Stage 4, row.id is either a kanban_id (handler-error rows)
  // or a pipeline_events.id (auto-archived rows) — NEVER email_id. Remap the
  // email_id-keyed map we received from the page into a row.id-keyed map so
  // the detail-pane lookup resolves. Stage 1 doesn't need this remap because
  // PredictedRow.id === email_id there (page.tsx line 608: `id: row.email_id`).
  const screenshotPathsByRowId = useMemo<
    Record<string, { before: string | null; after: string | null }> | undefined
  >(() => {
    if (!screenshotPathsByEmailId) return undefined;
    const out: Record<string, { before: string | null; after: string | null }> = {};
    // Handler-error rows: kanban_id → result.email_id
    for (const k of rows) {
      const eid = k.result?.email_id ?? null;
      if (!eid) continue;
      const p = screenshotPathsByEmailId[eid];
      if (p) out[k.id] = p;
    }
    // Needs-review rows: same shape as handler-error.
    for (const k of needsReviewRows) {
      const eid = k.result?.email_id ?? null;
      if (!eid) continue;
      const p = screenshotPathsByEmailId[eid];
      if (p) out[k.id] = p;
    }
    // Auto-archived rows: id = pipeline_events.id, email_id is a direct field.
    for (const a of autoArchivedRows) {
      const p = screenshotPathsByEmailId[a.email_id];
      if (p) out[a.id] = p;
    }
    return out;
  }, [screenshotPathsByEmailId, rows, needsReviewRows, autoArchivedRows]);

  // Phase 82.5 Plan 06 — derive rowVerdictMap for the row strip dot (R3).
  // Same kanban_id → email_id bridge as Stage 3.
  const rowVerdictMap = useMemo<Record<string, "confirm" | "override" | "unclear" | null>>(() => {
    const out: Record<string, "confirm" | "override" | "unclear" | null> = {};
    if (!feedbackMap) return out;
    for (const k of rows) {
      const eid = k.result?.email_id ?? null;
      if (!eid) continue;
      const entry = feedbackMap[eid];
      if (!entry) continue;
      out[k.id] = entry.own_latest?.verdict ?? entry.others[0]?.verdict ?? null;
    }
    return out;
  }, [feedbackMap, rows]);

  // Phase 82.5 Plan 06 — paneFeedbackMap guarded to undefined: Stage 4 has no
  // panel surface (ACTIVE_STAGE > 3). Pass-through for consistency only.
  const paneFeedbackMap = useMemo<
    Partial<Record<0 | 1 | 2 | 3, FeedbackReadBack>> | undefined
  >(() => {
    if (!selectedEmailId || !feedbackMap) return undefined;
    const entry = feedbackMap[selectedEmailId];
    if (!entry) return undefined;
    if (ACTIVE_STAGE > 3) return undefined; // Stage 4 has no panel surface
    // Unreachable while ACTIVE_STAGE === 4, but kept for symmetry.
    return undefined;
  }, [selectedEmailId, feedbackMap]);

  // Stage 4 handler-error widget — selectedRow lives in the handler-error
  // bucket only (selection model preserves prior Phase-82.5 behavior).
  // Phase 82.8-11 — surface the iController before/after screenshot strip
  // ABOVE the detail-pane's Stage 1 audit expander so operators on Stage 4
  // see the thumbs without expanding the audit row. Strip is mounted via
  // extrasBelowPipeline (renders directly below the pipeline). Only mount
  // when paths exist for the selected row; empty render is the strip's own
  // empty state, which is fine but visually noisy on Stage 4.
  const screenshotStripNode = useMemo(() => {
    if (!selectedId) return null;
    const paths = screenshotPathsByRowId?.[selectedId];
    if (!paths || (paths.before == null && paths.after == null)) return null;
    return (
      <div style={{ marginTop: "var(--space-3)" }}>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--v7-text-muted, var(--muted-foreground))",
            marginBottom: "var(--space-2)",
          }}
        >
          iController screenshots
        </div>
        <StageScreenshotStrip
          beforePath={paths.before}
          afterPath={paths.after}
        />
      </div>
    );
  }, [selectedId, screenshotPathsByRowId]);

  const handlerErrorWidget = selectedRow ? (
    <Stage4HandlerErrorWidget row={selectedRow} />
  ) : null;

  // Phase 88 Plan 04 D-03 — chip definitions (outcome-state, not per-handler).
  // CONTEXT D-03a lock: bounded set, NOT per-handler. Counts pre-mailbox-filter
  // so the chip badges reflect the swarm-wide outcome distribution; visible
  // rows respect the mailbox filter.
  const chips: ChipStripChip[] = [
    {
      key: "all",
      label: "All",
      count: handlerErrorCount + needsReviewCount + autoArchivedCount,
    },
    {
      key: "handler_error",
      label: "Handler error",
      count: handlerErrorCount,
      brandToken: "--v7-red",
    },
    {
      key: "needs_review",
      label: "Needs review",
      count: needsReviewCount,
      brandToken: "--v7-amber",
    },
    {
      key: "auto_archived",
      label: "Auto-archived",
      count: autoArchivedCount,
      brandToken: "--v7-lime",
    },
  ];

  // Filtered row source for the unified RowList. Mailbox filter already
  // applied to visibleUnified / visibleNeedsReview / visibleAutoArchived.
  const visibleRows: Row[] =
    activeOutcome === "handler_error"
      ? visibleUnified
      : activeOutcome === "needs_review"
        ? visibleNeedsReview
        : activeOutcome === "auto_archived"
          ? visibleAutoArchived
          : [...visibleUnified, ...visibleNeedsReview, ...visibleAutoArchived];

  const emptyState =
    activeOutcome === "handler_error"
      ? {
          title: "No handler errors",
          body: "Stage 4 handlers ran cleanly in the visible window.",
        }
      : activeOutcome === "needs_review"
        ? {
            title: "No handlers awaiting review",
            body: "All review-required handlers have been processed.",
          }
        : activeOutcome === "auto_archived"
          ? {
              title: "No auto-archived emails",
              body: "Nothing has been auto-archived in the visible window.",
            }
          : {
              title: "Nothing to review",
              body: "No handler errors, needs-review rows, or auto-archived emails in the visible window.",
            };

  return (
    <>
      <KeyboardShortcuts
        rowIds={visibleRows.map((r) => r.id)}
        enabledShortcuts={
          new Set([
            "approve",
            "reject",
            "skip",
            "toggleBody",
            "overrideSubmit",
            "overrideDiscard",
          ])
        }
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "var(--space-3)",
          }}
        >
          <MailboxFilter mailboxes={mailboxes} selected={selectedMailboxes} />
        </div>

        {/* Phase 88 Plan 04 D-03 — chip-strip mounted above the 2-col grid
            (chip click writes ?outcome=). Detail-pane on the right stays
            sticky; left column hosts a single filtered RowList whose source
            depends on activeOutcome. */}
        <ChipStrip
          ariaLabel="Filter Stage 4 by outcome state"
          active={activeOutcome}
          onChange={onChipSelect}
          chips={chips}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(640px, 1fr) 540px",
            gap: "var(--space-3)",
            alignItems: "start",
          }}
        >
          {/* Left column: single RowList filtered by activeOutcome. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <RowList
              rows={visibleRows}
              emptyState={emptyState}
              feedbackMap={rowVerdictMap}
              mailboxLabels={mailboxLabels}
            />
          </div>

          {/* Right column: detail-pane (sticky-ish, drives off any selection).
              Hard-separation: Stage 4 detail pane receives `categories` (for the
              Reclassify-to-noise Stage 1 cell) and `intents=[]` (Stage 4 has NO
              Replay-edit path — RFC line 8-15 lock). The handler-error widget
              only renders when a handler-error row is selected; for Auto-archived
              and Needs-review selections it falls through to null. */}
          <div style={{ position: "sticky", top: "var(--space-3)", minHeight: 320 }}>
            <UnifiedDetailPane
              row={selectedUnified}
              swarmType={swarmType}
              activeStage={4}
              categories={noiseCategories}
              intents={[]}
              timeline={timeline}
              bodyText={body?.bodyText ?? null}
              bodyHtml={body?.bodyHtml ?? null}
              extrasBelowPipeline={
                handlerErrorWidget || screenshotStripNode ? (
                  <>
                    {handlerErrorWidget}
                    {screenshotStripNode}
                  </>
                ) : null
              }
              stageAudit={stageAudit}
              mailboxLabels={mailboxLabels}
              feedbackMap={paneFeedbackMap}
              screenshotPathsByEmailId={screenshotPathsByRowId}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Stage 4 handler-error widget (verbatim from old error-detail-section) -

interface Stage4WidgetProps {
  row: KanbanRow;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--v7-text-muted)",
  marginBottom: "var(--space-2)",
};

function Stage4HandlerErrorWidget({ row }: Stage4WidgetProps) {
  const detail = row.result.error_detail;
  const name = row.result.error_name;

  if (!detail && !name) {
    return (
      <section
        style={{
          padding: "var(--space-4)",
          borderTop: "1px solid var(--v7-border)",
        }}
        data-testid="stage-4-handler-error"
      >
        <div style={SECTION_LABEL}>Handler error</div>
        <div style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>
          No error detail recorded
        </div>
      </section>
    );
  }
  return (
    <section
      style={{
        padding: "var(--space-4)",
        borderTop: "1px solid var(--v7-border)",
      }}
      data-testid="stage-4-handler-error"
    >
      <div style={SECTION_LABEL}>Handler error</div>
      {name ? (
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--v7-red)",
            marginBottom: "var(--space-2)",
          }}
        >
          {name}
        </div>
      ) : null}
      {detail ? (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--v7-red)",
            background: "var(--v7-red-soft)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "4px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}
        >
          {detail}
        </pre>
      ) : null}
    </section>
  );
}
