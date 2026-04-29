"use client";

// Phase 56.7-03 (D-08, D-13). Generic version of the middle column for the
// dynamic-segment route. Was originally debtor-email-review/row-list.tsx
// (Phase 61-02). All hardcoded URL paths now use `swarmType`.
//
// `columns` prop carries swarm.ui_config.row_columns; today the visual
// rendering is delegated to RowStrip (subject + sender + rule + time —
// fixed). The prop is plumbed end-to-end so a future variant of RowStrip
// can lay out arbitrary columns per registry config without changes here.

import { useMemo } from "react";
import Link from "next/link";
import { RowStrip } from "./row-strip";
import { RaceCohortBanner } from "./race-cohort-banner";
import { useSelection } from "./selection-context";
import type { SwarmUiConfig } from "@/lib/swarms/types";
import type {
  ClassifierCandidate,
  PageSearchParams,
  PredictedRow,
  PromotedRule,
} from "./page";

interface RowListProps {
  rows: PredictedRow[];
  promotedToday: PromotedRule[];
  candidates: ClassifierCandidate[];
  selection: PageSearchParams;
  swarmType: string;
  columns: SwarmUiConfig["row_columns"];
}

interface RowResult {
  message_id?: string;
  source_mailbox?: string;
  predicted?: { rule?: string; category?: string };
}

function ruleOf(row: PredictedRow): string | null {
  const r = row.result as RowResult | null;
  return r?.predicted?.rule ?? null;
}

export function RowList({
  rows,
  promotedToday,
  candidates,
  selection,
  swarmType,
}: RowListProps) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();
  const isPending = selection.tab === "pending";

  // Optimistic filter — rows the reviewer just verdict'd vanish
  // immediately, before the server roundtrip lands.
  const visibleRows = useMemo(
    () =>
      pendingRemovalIds.size === 0
        ? rows
        : rows.filter((r) => !pendingRemovalIds.has(r.id)),
    [rows, pendingRemovalIds],
  );

  const cohortRows = useMemo(() => {
    if (!selection.rule) return [];
    return visibleRows
      .filter((r) => ruleOf(r) === selection.rule)
      .map((r) => {
        const result = (r.result as RowResult | null) ?? {};
        return {
          automation_run_id: r.id,
          message_id: result.message_id ?? "",
          source_mailbox: result.source_mailbox ?? "",
          entity: r.entity ?? "",
          predicted_category: result.predicted?.category ?? r.topic ?? "unknown",
        };
      });
  }, [visibleRows, selection.rule]);

  const cohortCount = cohortRows.length;
  const oldest = rows.length > 0 ? rows[rows.length - 1].created_at : null;
  const isLastPage = rows.length < 100;
  const totalLabel = visibleRows.length;

  const basePath = `/automations/${swarmType}/review`;

  // Build "Load older" URL preserving current selection.
  const olderQs = new URLSearchParams();
  if (selection.topic) olderQs.set("topic", selection.topic);
  if (selection.entity) olderQs.set("entity", selection.entity);
  if (selection.mailbox) olderQs.set("mailbox", selection.mailbox);
  if (selection.rule) olderQs.set("rule", selection.rule);
  if (selection.tab) olderQs.set("tab", selection.tab);
  if (selection.selected) olderQs.set("selected", selection.selected);
  if (oldest) olderQs.set("before", oldest);
  const olderHref = `${basePath}?${olderQs.toString()}`;

  const hasSelection =
    !!selection.topic ||
    !!selection.entity ||
    !!selection.mailbox ||
    !!selection.rule;

  // Filter chip when ?rule= active.
  const ruleFilterActive = !!selection.rule;
  const clearRuleHref = (() => {
    const qs = new URLSearchParams();
    if (selection.topic) qs.set("topic", selection.topic);
    if (selection.entity) qs.set("entity", selection.entity);
    if (selection.mailbox) qs.set("mailbox", selection.mailbox);
    if (selection.tab) qs.set("tab", selection.tab);
    if (selection.selected) qs.set("selected", selection.selected);
    return qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
  })();

  return (
    <section className="flex flex-col gap-3 min-w-0 motion-reduce:[--row-duration:0ms]">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .row-fade-in { animation: rowFadeIn 200ms ease-out; }
        }
        @keyframes rowFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {ruleFilterActive && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--v7-muted)] min-w-0">
          <span className="truncate min-w-0">
            Filtered to rule:{" "}
            <code className="font-mono text-[12px]">{selection.rule}</code>
          </span>
          <Link
            href={clearRuleHref}
            className="underline hover:text-[var(--v7-text)] shrink-0"
          >
            Clear
          </Link>
        </div>
      )}

      <RaceCohortBanner
        selection={selection}
        promotedToday={promotedToday}
        count={cohortCount}
        rows={cohortRows}
        swarmType={swarmType}
      />

      {isPending ? (
        <PendingPromotionPanel
          candidates={candidates}
          basePath={basePath}
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState selectionActive={hasSelection} swarmType={swarmType} />
      ) : (
        <>
          <div className="flex flex-col gap-2 min-w-0">
            {visibleRows.map((row) => (
              <div key={row.id} className="row-fade-in min-w-0">
                <RowStrip
                  row={row}
                  selected={selectedId === row.id}
                  onSelect={setSelected}
                />
              </div>
            ))}
          </div>
          <PaginationFooter
            total={totalLabel}
            isLastPage={isLastPage}
            olderHref={olderHref}
          />
        </>
      )}
    </section>
  );
}

function EmptyState({
  selectionActive,
  swarmType,
}: {
  selectionActive: boolean;
  swarmType: string;
}) {
  if (selectionActive) {
    return (
      <div className="px-6 py-12 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-center">
        <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]">
          Queue clear
        </h2>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
          No predicted classifications waiting for this selection. New rows
          appear automatically as the ingest route writes them.
        </p>
      </div>
    );
  }
  return (
    <div className="px-6 py-12 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-center">
      <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]">
        Nothing to review
      </h2>
      <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
        Predicted classifications will appear here once the {swarmType} ingest
        route receives data. Check back shortly.
      </p>
    </div>
  );
}

function PaginationFooter({
  total,
  isLastPage,
  olderHref,
}: {
  total: number;
  isLastPage: boolean;
  olderHref: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mt-3 text-[13px] text-[var(--v7-muted)]">
      <span>
        Showing {total} of {total} predicted rows
      </span>
      {isLastPage ? (
        <span className="opacity-60">End of queue</span>
      ) : (
        <Link href={olderHref} className="underline hover:text-[var(--v7-text)]">
          Load older
        </Link>
      )}
    </div>
  );
}

function PendingPromotionPanel({
  candidates,
  basePath,
}: {
  candidates: ClassifierCandidate[];
  basePath: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="px-6 py-12 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-center">
        <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)]">
          No candidate rules
        </h2>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
          No rules in <code className="font-mono">classifier_rules.status =
          &apos;candidate&apos;</code> yet. Candidates appear after the
          first daily cron run records telemetry.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {candidates.map((c) => (
        <div
          key={c.rule_key}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] min-w-0"
        >
          <div className="min-w-0">
            <div className="font-mono text-[13px] truncate">{c.rule_key}</div>
            <div className="text-[12px] text-[var(--v7-muted)] mt-0.5">
              N={c.n} · CI-lo=
              {c.ci_lo === null ? "—" : (c.ci_lo * 100).toFixed(1) + "%"}
            </div>
          </div>
          <Link
            href={`${basePath}?rule=${encodeURIComponent(c.rule_key)}`}
            className="text-[13px] underline hover:text-[var(--v7-text)] shrink-0"
          >
            Filter to this rule
          </Link>
        </div>
      ))}
    </div>
  );
}
