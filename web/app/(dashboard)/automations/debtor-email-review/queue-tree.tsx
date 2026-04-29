"use client";

// Phase 60-05 (D-12). Recursive 3-level tree (topic → entity → mailbox)
// driven by `classifier_queue_counts` rows. URL holds the active selection
// (?topic, ?entity, ?mailbox); local state holds expand/collapse only.
//
// Visual analog: web/components/v7/swarm-list-item.tsx active-state +
// sidebar-mini-stat.tsx count-badge. UI-SPEC reserves --v7-brand-primary
// for the active node here.

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
  // Phase 61-02 additions — wired in Task 2.
  candidates?: ClassifierCandidate[];
  promotedTodayCount?: number;
}

interface MailboxNode {
  kind: "mailbox";
  mailboxId: number | null;
  count: number;
}
interface EntityNode {
  kind: "entity";
  entity: string | null;
  count: number;
  children: MailboxNode[];
}
interface TopicNode {
  kind: "topic";
  topic: string | null;
  count: number;
  children: EntityNode[];
}

const MAILBOX_LABELS: Record<number, string> = {
  1: "Sicli Noord",
  2: "Sicli Sud",
  3: "Berki",
  4: "Smeba",
  5: "Smeba Fire",
  6: "FireControl",
};

function mailboxLabel(id: number | null): string {
  if (id === null) return "(no mailbox)";
  return MAILBOX_LABELS[id] ?? `mailbox ${id}`;
}

function topicLabel(topic: string | null): string {
  if (topic === null) return "(no topic)";
  return topic.replace(/_/g, " ");
}

function entityLabel(entity: string | null): string {
  if (entity === null) return "(no entity)";
  return entity;
}

function buildTree(counts: QueueCountRow[]): TopicNode[] {
  const byTopic = new Map<string, TopicNode>();
  for (const c of counts) {
    const tk = c.topic ?? "__null__";
    let topicNode = byTopic.get(tk);
    if (!topicNode) {
      topicNode = { kind: "topic", topic: c.topic, count: 0, children: [] };
      byTopic.set(tk, topicNode);
    }
    topicNode.count += c.count;

    const ek = c.entity ?? "__null__";
    let entityNode = topicNode.children.find(
      (e) => (e.entity ?? "__null__") === ek,
    );
    if (!entityNode) {
      entityNode = { kind: "entity", entity: c.entity, count: 0, children: [] };
      topicNode.children.push(entityNode);
    }
    entityNode.count += c.count;

    entityNode.children.push({
      kind: "mailbox",
      mailboxId: c.mailbox_id,
      count: c.count,
    });
  }
  return Array.from(byTopic.values()).sort((a, b) => b.count - a.count);
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
  depth: 0 | 1 | 2;
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

export function QueueTree({
  counts,
  selection,
  candidates = [],
  promotedTodayCount = 0,
}: QueueTreeProps) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(counts), [counts]);
  const totalCount = useMemo(
    () => counts.reduce((s, c) => s + c.count, 0),
    [counts],
  );

  // Local expand state, keyed by topic and topic+entity. Default: top topic
  // expanded if there's only one, otherwise all collapsed.
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (selection.topic) init.add(selection.topic ?? "__null__");
    return init;
  });
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (selection.topic && selection.entity) {
      init.add(`${selection.topic}|${selection.entity}`);
    }
    return init;
  });

  const toggleTopic = (key: string) =>
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleEntity = (key: string) =>
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const pushUrl = useCallback(
    (next: PageSearchParams) => {
      const qs = new URLSearchParams();
      if (next.topic) qs.set("topic", next.topic);
      if (next.entity) qs.set("entity", next.entity);
      if (next.mailbox) qs.set("mailbox", next.mailbox);
      // Preserve rule from current selection. Phase 61-02: Pending and
      // topic-tree selections are mutually exclusive — clear `tab` when
      // activating a topic/entity/mailbox node. Pending sibling has its
      // own onActivate path that sets ?tab=pending explicitly.
      if (selection.rule) qs.set("rule", selection.rule);
      if (next.tab) qs.set("tab", next.tab);
      const path = "/automations/debtor-email-review";
      router.push(qs.toString() ? `${path}?${qs.toString()}` : path);
    },
    [router, selection.rule],
  );

  // Keyboard navigation: arrow up/down between visible rows; left collapses
  // or moves to parent; right expands.
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

  return (
    <nav
      aria-label="Predicted-rows queue tree"
      className="flex flex-col gap-2 px-2 py-3 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel)] min-w-0 w-full"
      onKeyDown={onKeyDown}
    >
      {/* Queue summary header (D-TREE-SUMMARY-HEADER) */}
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
        QUEUE BY TOPIC
      </div>
      <div role="tree" className="flex flex-col gap-0.5">
        {tree.length === 0 && (
          <div className="px-3 py-6 text-[13px] text-[var(--v7-muted)]">
            No predicted rows yet.
          </div>
        )}
        {tree.map((topic) => {
          const tKey = topic.topic ?? "__null__";
          const tActive =
            (selection.topic ?? null) === topic.topic &&
            !selection.entity &&
            !selection.mailbox;
          const tExpanded = expandedTopics.has(tKey);
          return (
            <div key={`t:${tKey}`}>
              <TreeRow
                innerRef={registerRow}
                label={topicLabel(topic.topic)}
                count={topic.count}
                depth={0}
                active={tActive}
                expandable={topic.children.length > 0}
                expanded={tExpanded}
                onActivate={() =>
                  pushUrl({ topic: topic.topic ?? undefined })
                }
                onToggleExpand={() => toggleTopic(tKey)}
                ariaLabel={`${topic.count} predicted rows for ${topicLabel(topic.topic)}`}
              />
              {tExpanded &&
                topic.children.map((entity) => {
                  const eKey = `${tKey}|${entity.entity ?? "__null__"}`;
                  const eActive =
                    (selection.topic ?? null) === topic.topic &&
                    (selection.entity ?? null) === entity.entity &&
                    !selection.mailbox;
                  const eExpanded = expandedEntities.has(eKey);
                  return (
                    <div key={`e:${eKey}`}>
                      <TreeRow
                        innerRef={registerRow}
                        label={entityLabel(entity.entity)}
                        count={entity.count}
                        depth={1}
                        active={eActive}
                        expandable={entity.children.length > 0}
                        expanded={eExpanded}
                        onActivate={() =>
                          pushUrl({
                            topic: topic.topic ?? undefined,
                            entity: entity.entity ?? undefined,
                          })
                        }
                        onToggleExpand={() => toggleEntity(eKey)}
                        ariaLabel={`${entity.count} predicted rows for ${entityLabel(entity.entity)}`}
                      />
                      {eExpanded &&
                        entity.children.map((mailbox, mi) => {
                          const mActive =
                            (selection.topic ?? null) === topic.topic &&
                            (selection.entity ?? null) === entity.entity &&
                            (selection.mailbox
                              ? parseInt(selection.mailbox, 10)
                              : null) === mailbox.mailboxId;
                          return (
                            <TreeRow
                              key={`m:${eKey}|${mailbox.mailboxId ?? `idx${mi}`}`}
                              innerRef={registerRow}
                              label={mailboxLabel(mailbox.mailboxId)}
                              count={mailbox.count}
                              depth={2}
                              active={mActive}
                              expandable={false}
                              onActivate={() =>
                                pushUrl({
                                  topic: topic.topic ?? undefined,
                                  entity: entity.entity ?? undefined,
                                  mailbox:
                                    mailbox.mailboxId !== null
                                      ? String(mailbox.mailboxId)
                                      : undefined,
                                })
                              }
                              ariaLabel={`${mailbox.count} predicted rows for ${mailboxLabel(mailbox.mailboxId)}`}
                            />
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}

        {/* Pending promotion sibling node (D-TREE-PENDING-SIBLING).
         *  Lives in the tree, NOT in the row-list tab strip. Activating
         *  pushes ?tab=pending and clears topic/entity/mailbox. */}
        <div className="mt-2 pt-2 border-t border-[var(--v7-line)]">
          <TreeRow
            innerRef={registerRow}
            label="Pending promotion"
            count={candidates.length}
            depth={0}
            active={selection.tab === "pending"}
            expandable={false}
            onActivate={() =>
              router.push(
                `/automations/debtor-email-review?tab=pending`,
              )
            }
            ariaLabel={`${candidates.length} candidate rules pending promotion`}
          />
        </div>
      </div>
    </nav>
  );
}
