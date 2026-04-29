"use client";

// Phase 56.7-03 (D-08). Generic recursive tree for the dynamic-segment queue
// route. The nesting depth is read from swarm.ui_config.tree_levels — for
// debtor-email it's ['topic','entity','mailbox_id'] (3 levels, unchanged
// from 60-05); a hypothetical Sales swarm with ['topic','entity'] gets one
// fewer nesting layer automatically.
//
// URL holds the active selection (?topic, ?entity, ?mailbox); local state
// holds expand/collapse only. URL paths use the dynamic segment swarmType.

import { useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ClassifierCandidate,
  PageSearchParams,
  QueueCountRow,
} from "./page";

interface QueueTreeProps {
  counts: QueueCountRow[];
  selection: PageSearchParams;
  candidates?: ClassifierCandidate[];
  promotedTodayCount?: number;
  /** Dynamic segment value — used to build /automations/{swarmType}/review URLs. */
  swarmType: string;
  /** From swarm.ui_config.tree_levels. e.g. ['topic','entity','mailbox_id']. */
  treeLevels: string[];
}

interface TreeNode {
  // Field name this node represents (e.g. 'topic', 'entity', 'mailbox_id').
  field: string;
  // Raw value (string | number | null) for this node.
  value: string | number | null;
  count: number;
  children: TreeNode[];
}

// Q2 (Phase 56.7+1): move to ui_config.label_maps.mailbox_id; gated on
// swarm_type==='debtor-email' for now so non-debtor swarms don't get
// debtor-specific labels leaking through.
const MAILBOX_LABELS: Record<number, string> = {
  1: "Sicli Noord",
  2: "Sicli Sud",
  3: "Berki",
  4: "Smeba",
  5: "Smeba Fire",
  6: "FireControl",
};

function nodeLabel(
  field: string,
  value: string | number | null,
  swarmType: string,
): string {
  if (value === null) return `(no ${field})`;
  if (field === "mailbox_id" && swarmType === "debtor-email") {
    // Q2 (Phase 56.7+1) defer.
    return MAILBOX_LABELS[value as number] ?? `mailbox ${value}`;
  }
  if (field === "topic" && typeof value === "string") {
    return value.replace(/_/g, " ");
  }
  return String(value);
}

function readField(row: QueueCountRow, field: string): string | number | null {
  // The classifier_queue_counts RPC currently exposes topic/entity/mailbox_id.
  // For ui_config.tree_levels values not present on the row, treat as null.
  switch (field) {
    case "topic":
      return row.topic;
    case "entity":
      return row.entity;
    case "mailbox_id":
      return row.mailbox_id;
    default:
      return null;
  }
}

function buildTree(
  counts: QueueCountRow[],
  levels: string[],
): TreeNode[] {
  if (levels.length === 0) return [];
  const [head, ...rest] = levels;
  const groups = new Map<string, { value: string | number | null; rows: QueueCountRow[] }>();
  for (const row of counts) {
    const v = readField(row, head);
    const k = v === null ? "__null__" : String(v);
    let g = groups.get(k);
    if (!g) {
      g = { value: v, rows: [] };
      groups.set(k, g);
    }
    g.rows.push(row);
  }
  const nodes: TreeNode[] = [];
  for (const { value, rows } of groups.values()) {
    const total = rows.reduce((s, r) => s + r.count, 0);
    nodes.push({
      field: head,
      value,
      count: total,
      children: rest.length > 0 ? buildTree(rows, rest) : [],
    });
  }
  return nodes.sort((a, b) => b.count - a.count);
}

function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  const display = count >= 1000 ? count.toLocaleString("en-US") : String(count);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[var(--v7-radius-pill)] text-[12px] leading-[1.3] font-medium"
      style={{
        fontVariantNumeric: "tabular-nums",
        background: active
          ? "var(--v7-brand-primary)"
          : "var(--v7-panel-2)",
        color: active ? "#fff" : "var(--v7-text)",
      }}
    >
      {display}
    </span>
  );
}

interface RowProps {
  label: string;
  count: number;
  depth: number;
  active: boolean;
  expandable: boolean;
  expanded?: boolean;
  onActivate: () => void;
  onToggleExpand?: () => void;
  ariaLabel: string;
  innerRef?: (el: HTMLDivElement | null) => void;
}

function TreeRow({
  label,
  count,
  depth,
  active,
  expandable,
  expanded,
  onActivate,
  onToggleExpand,
  ariaLabel,
  innerRef,
}: RowProps) {
  const indent = depth * 16;
  return (
    <div
      ref={innerRef}
      role="treeitem"
      aria-selected={active}
      aria-expanded={expandable ? !!expanded : undefined}
      aria-label={ariaLabel}
      tabIndex={active ? 0 : -1}
      className="flex flex-col gap-1 transition-all duration-[180ms] ease-out cursor-pointer"
      onClick={onActivate}
      style={{
        paddingLeft: active ? indent + 9 : indent + 12,
        paddingRight: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderRadius: "var(--v7-radius-inner, 10px)",
        background: active
          ? "var(--v7-brand-primary-soft)"
          : "transparent",
        borderLeft: active
          ? "3px solid var(--v7-brand-primary)"
          : "3px solid transparent",
        color: active ? "var(--v7-brand-primary)" : "var(--v7-text)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 truncate min-w-0 text-[14px] leading-[1.4]">
          {expandable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand?.();
              }}
              className="text-[10px] text-[var(--v7-muted)] w-3 inline-flex justify-center shrink-0"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? "▾" : "▸"}
            </button>
          )}
          <span className="truncate min-w-0">{label}</span>
        </span>
        <span className="shrink-0">
          <CountBadge count={count} active={active} />
        </span>
      </div>
    </div>
  );
}

// Map a tree-levels field name → the URL search-param it controls. Only
// the three known fields can be filter-pushed today; tree_levels values
// outside this set still nest visually but don't update the URL (future
// extension via ui_config.field_to_param mapping).
const FIELD_TO_PARAM: Record<string, "topic" | "entity" | "mailbox"> = {
  topic: "topic",
  entity: "entity",
  mailbox_id: "mailbox",
};

export function QueueTree({
  counts,
  selection,
  candidates = [],
  promotedTodayCount = 0,
  swarmType,
  treeLevels,
}: QueueTreeProps) {
  const router = useRouter();
  const tree = useMemo(
    () => buildTree(counts, treeLevels),
    [counts, treeLevels],
  );
  const totalCount = useMemo(
    () => counts.reduce((s, c) => s + c.count, 0),
    [counts],
  );

  // Local expand state, keyed by node-path. Default: open the path matching
  // the URL selection if present.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (selection.topic) init.add(`topic:${selection.topic}`);
    if (selection.topic && selection.entity) {
      init.add(`topic:${selection.topic}|entity:${selection.entity}`);
    }
    return init;
  });

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const pushUrl = useCallback(
    (next: PageSearchParams, opts?: { tab?: string }) => {
      const qs = new URLSearchParams();
      if (next.topic) qs.set("topic", next.topic);
      if (next.entity) qs.set("entity", next.entity);
      if (next.mailbox) qs.set("mailbox", next.mailbox);
      if (selection.rule) qs.set("rule", selection.rule);
      if (opts?.tab) qs.set("tab", opts.tab);
      const path = `/automations/${swarmType}/review`;
      router.push(qs.toString() ? `${path}?${qs.toString()}` : path);
    },
    [router, selection.rule, swarmType],
  );

  // Keyboard navigation
  const rowRefs = useRef<HTMLDivElement[]>([]);
  rowRefs.current = [];
  const registerRow = (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.push(el);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const idx = rowRefs.current.findIndex((r) => r === document.activeElement);
    if (idx < 0) return;
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = rowRefs.current[idx + dir];
    if (next) next.focus();
  };

  // Recursive renderer. Builds the URL params from the cumulative path
  // (parent values + this node's value) on activate.
  const renderNode = (
    node: TreeNode,
    depth: number,
    pathKey: string,
    pathParams: PageSearchParams,
  ): React.ReactNode => {
    const valueKey = node.value === null ? "__null__" : String(node.value);
    const myKey = `${pathKey}${pathKey ? "|" : ""}${node.field}:${valueKey}`;
    const param = FIELD_TO_PARAM[node.field];
    const myParams: PageSearchParams = { ...pathParams };
    if (param && node.value !== null) {
      myParams[param] = String(node.value);
    }

    // Active = the selection's value for THIS field matches this node AND
    // no deeper-level field is selected. Active selection is "exactly here".
    const myParamVal = param ? selection[param] : undefined;
    const valueMatches =
      node.value === null
        ? !myParamVal
        : myParamVal === String(node.value);
    // Check no deeper level is set
    const deeperFields = treeLevels.slice(treeLevels.indexOf(node.field) + 1);
    const noDeeperSelected = deeperFields.every((f) => {
      const p = FIELD_TO_PARAM[f];
      return !p || !selection[p];
    });
    // Parent path must also be selected for this node to be "active".
    const parentMatches = Object.entries(pathParams).every(([k, v]) => {
      return selection[k as keyof PageSearchParams] === v;
    });
    const active = valueMatches && noDeeperSelected && parentMatches;

    const isExpanded = expanded.has(myKey);

    return (
      <div key={myKey}>
        <TreeRow
          innerRef={registerRow}
          label={nodeLabel(node.field, node.value, swarmType)}
          count={node.count}
          depth={depth}
          active={active}
          expandable={node.children.length > 0}
          expanded={isExpanded}
          onActivate={() => pushUrl(myParams)}
          onToggleExpand={() => toggleExpand(myKey)}
          ariaLabel={`${node.count} predicted rows for ${nodeLabel(node.field, node.value, swarmType)}`}
        />
        {isExpanded &&
          node.children.map((child) =>
            renderNode(child, depth + 1, myKey, myParams),
          )}
      </div>
    );
  };

  return (
    <nav
      aria-label="Predicted-rows queue tree"
      className="flex flex-col gap-2 px-2 py-3 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel)] min-w-0 w-full"
      onKeyDown={onKeyDown}
    >
      {/* Queue summary header */}
      <div className="px-3 pt-2 pb-3 border-b border-[var(--v7-line)] mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--v7-muted)]">
          Queue summary
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 min-w-0">
          <span
            className="text-[24px] font-semibold leading-[1.1] font-[family-name:var(--font-cabinet)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {totalCount}
          </span>
          {promotedTodayCount > 0 && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-[var(--v7-radius-pill)] shrink-0"
              style={{
                background: "var(--v7-brand-primary-soft)",
                color: "var(--v7-brand-primary)",
              }}
            >
              {promotedTodayCount} promoted today
            </span>
          )}
        </div>
      </div>
      <div className="px-3 pt-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--v7-muted)]">
        QUEUE BY {(treeLevels[0] ?? "TOPIC").toUpperCase().replace(/_/g, " ")}
      </div>
      <div role="tree" className="flex flex-col gap-0.5">
        {tree.length === 0 && (
          <div className="px-3 py-6 text-[13px] text-[var(--v7-muted)]">
            No predicted rows yet.
          </div>
        )}
        {tree.map((root) => renderNode(root, 0, "", {}))}

        {/* Pending-promotion sibling node */}
        <div className="mt-2 pt-2 border-t border-[var(--v7-line)]">
          <TreeRow
            innerRef={registerRow}
            label="Pending promotion"
            count={candidates.length}
            depth={0}
            active={selection.tab === "pending"}
            expandable={false}
            onActivate={() =>
              router.push(`/automations/${swarmType}/review?tab=pending`)
            }
            ariaLabel={`${candidates.length} candidate rules pending promotion`}
          />
        </div>
      </div>
    </nav>
  );
}
