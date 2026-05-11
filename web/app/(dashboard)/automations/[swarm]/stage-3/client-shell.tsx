"use client";

// Phase 82 Plan 05 — Stage 3 client shell wrapper.
//
// Bridges the RSC page (kanban rows + email metadata + pre-fetched body /
// timeline maps + both registries) to the unified _shell/ primitives. The
// client wrapper is needed because UnifiedDetailPane consumes the current
// `selectedId` from selection-context to know which row to render, and the
// Stage 3 filter-chip (no_handler / low_confidence / all) is local state.
//
// Hard-separation contract (docs/agentic-pipeline/README.md):
//   - `intents` prop  = swarm_intents (Stage 3 widget — ranked-intent override).
//   - `categories` prop = swarm_noise_categories (Stage 1 widget — Reclassify).
//   - Both SEPARATE props at the type level (UnifiedDetailPane API).
//   - activeStage = 3 → Stage 3 cell pre-expanded.
//
// V9 / D-18: the row strip renders ONE badge slot. The duplicate intent-code
// label bug is fixed by construction — Row.stage_badge is a single labeled
// pill; intent code is NEVER threaded into the row strip itself.

import { useMemo, useState } from "react";

import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
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

type Stage3Filter = "all" | "no_handler" | "low_confidence";

interface BodyEntry {
  bodyText: string;
  bodyHtml: string | null;
}

export interface Stage3ClientShellProps {
  swarmType: string;
  rows: KanbanRow[];
  unifiedRows: Row[];
  intents: SwarmIntentRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
  mailboxes: MailboxOption[];
  selectedMailboxes: number[];
  bodyMap: Record<string, BodyEntry>;
  timelineMap: Record<string, PipelineTimelineEvent[]>;
}

export function Stage3ClientShell({
  swarmType,
  rows,
  unifiedRows,
  intents,
  noiseCategories,
  mailboxes,
  selectedMailboxes,
  bodyMap,
  timelineMap,
}: Stage3ClientShellProps) {
  const { selectedId } = useSelection();
  const [filter, setFilter] = useState<Stage3Filter>("all");

  // Build (id → kanban_reason) map for chip filter. Stage 3 row population is
  // already constrained to no_handler | low_confidence at the page boundary.
  const reasonById = useMemo(() => {
    const m = new Map<string, "no_handler" | "low_confidence">();
    for (const k of rows) {
      const r = k.result.kanban_reason;
      if (r === "no_handler" || r === "low_confidence") m.set(k.id, r);
    }
    return m;
  }, [rows]);

  // Chip-filter pass.
  const chipFiltered = useMemo(() => {
    if (filter === "all") return unifiedRows;
    return unifiedRows.filter((r) => reasonById.get(r.id) === filter);
  }, [unifiedRows, filter, reasonById]);

  // Mailbox filter pass.
  const visibleUnified = useMemo(() => {
    if (selectedMailboxes.length === 0) return chipFiltered;
    const allowed = new Set(selectedMailboxes);
    return chipFiltered.filter(
      (r) => r.mailbox_id !== null && allowed.has(r.mailbox_id),
    );
  }, [chipFiltered, selectedMailboxes]);

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

  // Chip counts (always reflect total rows in stage, not post-mailbox).
  const counts = useMemo(() => {
    let nh = 0;
    let lc = 0;
    for (const r of reasonById.values()) {
      if (r === "no_handler") nh += 1;
      else lc += 1;
    }
    return { all: nh + lc, no_handler: nh, low_confidence: lc };
  }, [reasonById]);

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
            "stage3Focus",
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
          {/* Stage 3 chip strip — kanban_reason axis (no_handler / low_conf /
              all). Local state; URL-state escalation deferred to a later
              plan. */}
          <Stage3FilterChips
            active={filter}
            counts={counts}
            onChange={setFilter}
          />
          <MailboxFilter
            mailboxes={mailboxes}
            selected={selectedMailboxes}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 460px",
            gap: "var(--space-3)",
            minHeight: 320,
          }}
        >
          <RowList
            rows={visibleUnified}
            emptyState={{
              title: "No rows in Stage 3",
              body: "Pipeline is fully resolving intents in the visible window.",
            }}
          />
          {/* Hard-separation: Stage 3 detail pane receives `intents` (for the
              Stage 3 ranked-intent override widget) AND `categories` (for the
              Stage 1 Reclassify-to-noise widget). SEPARATE props — never
              collapsed (RFC docs/agentic-pipeline/README.md). */}
          <UnifiedDetailPane
            row={selectedUnified}
            swarmType={swarmType}
            activeStage={3}
            categories={noiseCategories}
            intents={intents}
            timeline={timeline}
            bodyText={body?.bodyText ?? null}
            bodyHtml={body?.bodyHtml ?? null}
          />
        </div>
      </div>
    </>
  );
}

interface ChipsProps {
  active: Stage3Filter;
  counts: { all: number; no_handler: number; low_confidence: number };
  onChange: (next: Stage3Filter) => void;
}

const CHIPS: ReadonlyArray<{ key: Stage3Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "no_handler", label: "No handler" },
  { key: "low_confidence", label: "Low confidence" },
];

function Stage3FilterChips({ active, counts, onChange }: ChipsProps) {
  return (
    <div role="tablist" aria-label="Stage 3 filter" style={{ display: "flex", gap: "var(--space-2)" }}>
      {CHIPS.map((c) => {
        const isActive = c.key === active;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(c.key)}
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--v7-radius-pill)",
              background: isActive
                ? "var(--v7-brand-primary-soft)"
                : "var(--v7-panel-2)",
              border: isActive
                ? "1px solid var(--v7-brand-primary)"
                : "1px solid var(--v7-line)",
              color: isActive
                ? "var(--v7-brand-primary)"
                : "var(--v7-text)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {c.label}{" "}
            <span style={{ opacity: 0.7, fontFamily: "var(--font-mono)" }}>
              {counts[c.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
