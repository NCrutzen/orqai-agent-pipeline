"use client";

// Phase 82 Plan 04 — Stage 4 client shell wrapper.
//
// Bridges the RSC page (which has the raw kanban rows + email metadata +
// pre-fetched body/timeline maps) to the unified _shell/ primitives. The
// client wrapper is needed because UnifiedDetailPane consumes the current
// `selectedId` from selection-context to know which row to render.
//
// Hard-separation contract (docs/agentic-pipeline/README.md):
//   - `categories` prop = swarm_noise_categories (Stage 1 widget — Reclassify).
//   - `intents` prop = [] (Stage 4 has NO Replay path; preserves hard
//     separation — never blurs Stage 1 noise vs Stage 3 intent).
//   - activeStage = 4 so the Stage 4 cell is pre-expanded.
//
// Row mapping: KanbanRow → Row (unified shell shape).  mailbox_id MUST be
// threaded through from email_metadata so the V6 mailbox filter actually
// filters Stage 4 rows.

import { useMemo } from "react";

import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { RowList } from "../_shell/row-list";
import { MailboxFilter } from "../_shell/mailbox-filter";
import {
  UnifiedDetailPane,
  type PipelineTimelineEvent,
} from "../_shell/detail-pane";
import { useSelection } from "../_shell/selection-context";
import { KeyboardShortcuts } from "../_shell/keyboard-shortcuts";
import type { MailboxOption } from "../_shell/_lib/get-swarm-mailboxes";
import type { Row } from "../_shell/_lib/types";

interface BodyEntry {
  bodyText: string;
  bodyHtml: string | null;
}

export interface Stage4ClientShellProps {
  swarmType: string;
  rows: KanbanRow[];
  unifiedRows: Row[];
  noiseCategories: SwarmNoiseCategoryRow[];
  mailboxes: MailboxOption[];
  selectedMailboxes: number[];
  bodyMap: Record<string, BodyEntry>;
  timelineMap: Record<string, PipelineTimelineEvent[]>;
}

export function Stage4ClientShell({
  swarmType,
  rows,
  unifiedRows,
  noiseCategories,
  mailboxes,
  selectedMailboxes,
  bodyMap,
  timelineMap,
}: Stage4ClientShellProps) {
  const { selectedId } = useSelection();

  // Apply mailbox filter client-side. Server-rendered list is the full set;
  // URL ?mailbox= params narrow it. Mirrors Stage 1's behavior.
  const visibleUnified = useMemo(() => {
    if (selectedMailboxes.length === 0) return unifiedRows;
    const allowed = new Set(selectedMailboxes);
    return unifiedRows.filter(
      (r) => r.mailbox_id !== null && allowed.has(r.mailbox_id),
    );
  }, [unifiedRows, selectedMailboxes]);

  const visibleKanbanIds = useMemo(
    () => new Set(visibleUnified.map((r) => r.id)),
    [visibleUnified],
  );

  const selectedRow: KanbanRow | null = useMemo(() => {
    if (!selectedId) return null;
    const k = rows.find((r) => r.id === selectedId);
    if (!k) return null;
    if (!visibleKanbanIds.has(k.id)) return null;
    return k;
  }, [rows, selectedId, visibleKanbanIds]);

  const selectedUnified: Row | null = useMemo(() => {
    if (!selectedId) return null;
    return visibleUnified.find((r) => r.id === selectedId) ?? null;
  }, [visibleUnified, selectedId]);

  const selectedEmailId = selectedRow?.result?.email_id ?? null;
  const body = selectedEmailId ? bodyMap[selectedEmailId] ?? null : null;
  const timeline = selectedEmailId ? timelineMap[selectedEmailId] ?? [] : [];

  // Stage 4 handler-error widget — surfaced via the taggingFailuresSection
  // slot (the only available shell slot that renders inline below the
  // pipeline cells). Plan 06 lifts this into a real Stage4Widget; until
  // then this preserves the error_name + error_detail UI from the old
  // stage-4/detail-pane.tsx.
  const handlerErrorWidget = selectedRow ? (
    <Stage4HandlerErrorWidget row={selectedRow} />
  ) : null;

  return (
    <>
      <KeyboardShortcuts
        rowIds={visibleUnified.map((r) => r.id)}
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
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          {/* Single 'Handler errors <count>' chip — Stage 4 has one row
              category. Stays visible for parity with Stages 1/3 strips. */}
          <div role="tablist" aria-label="Stage 4 filter">
            <button
              type="button"
              role="tab"
              aria-selected="true"
              disabled
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--v7-radius-pill)",
                background: "var(--v7-brand-primary-soft)",
                border: "1px solid var(--v7-brand-primary)",
                color: "var(--v7-brand-primary)",
                fontSize: 12,
                cursor: "default",
              }}
            >
              Handler errors{" "}
              <span style={{ opacity: 0.7 }}>{visibleUnified.length}</span>
            </button>
          </div>
          <MailboxFilter
            mailboxes={mailboxes}
            selected={selectedMailboxes}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: "var(--space-3)",
            minHeight: 320,
          }}
        >
          <RowList
            rows={visibleUnified}
            emptyState={{
              title: "No handler errors",
              body: "Stage 4 handlers ran cleanly in the visible window.",
            }}
          />
          {/* Hard-separation: Stage 4 detail pane receives `categories` (for
              the Reclassify-to-noise Stage 1 cell) and `intents=[]` (Stage 4
              has NO Replay-edit path — RFC line 8-15 lock). */}
          <UnifiedDetailPane
            row={selectedUnified}
            swarmType={swarmType}
            activeStage={4}
            categories={noiseCategories}
            intents={[]}
            timeline={timeline}
            bodyText={body?.bodyText ?? null}
            bodyHtml={body?.bodyHtml ?? null}
            taggingFailuresSection={handlerErrorWidget}
          />
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
