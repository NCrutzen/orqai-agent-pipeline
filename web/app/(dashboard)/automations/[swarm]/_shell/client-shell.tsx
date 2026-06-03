"use client";

// Phase 2 Plan 02-01 — Bulk Review surface client shell.
//
// New file (per P2-D-02: inline-expand container is a fresh component, not
// an in-place refactor of option-z-detail-pane.tsx). This wrapper consumes
// BulkReviewRow[] and renders RowStripList — the per-stage page
// client-shells (stage-0/1/2/3/4/client-shell.tsx) continue to render the
// legacy detail-pane + row-list path until Phase 3 explicitly migrates
// them (P2-D-02: legacy stays in-tree as the no-call fallback).
//
// Hard-separation lock: this shell is presentation-only. It does NOT call
// any registry directly — BulkReviewRow comes from the server-side
// hydrateBulkReviewRow selector, which projects swarm_noise_categories
// (Stage 1) and swarm_intents (Stage 3) onto disjoint slots.
//
// Phase 2 Plan 02-06 — wires the mode-bar chrome (ModeBar) and the queue-
// level filter chip strip (FilterChipStrip) above the row list. Filter
// state lives in URL query params (filter_*); the shell reads them and
// applies AND-composed filtering before passing rows to RowStripList. The
// 5-cell aggregate counts inside <RowStripList> derive from the filtered
// list so they re-aggregate automatically when the filter set changes.

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type {
  SwarmNoiseCategoryRow,
  SwarmIntentRow,
} from "@/lib/swarms/types";
import { SelectionProvider } from "./selection-context";
import { RowStripList } from "./components/row-strip-list";
import { ModeBar, type ModeBarCounts, type ModeBarMode } from "./mode-bar";
import {
  FilterChipStrip,
  applyFilters,
  SAFETY_EMPTY_HEADING,
  SAFETY_EMPTY_BODY,
} from "./filter-chip-strip";
import {
  RerunContext,
  useRerunSubscription,
} from "./hooks/use-rerun-subscription";

export interface BulkReviewClientShellProps {
  rows: BulkReviewRow[];
  initialSelectedId?: string | null;
  mailboxLabels?: Record<string, string>;
  senderLabels?: Record<string, string>;
  subjectLabels?: Record<string, string>;
  timestamps?: Record<string, string>;
  /**
   * Phase 2 Plan 02-04 — Stage 1 noise-category registry rows. Source is
   * the Server Component that mounts the shell (calls
   * loadSwarmNoiseCategories for the current swarm_type). Threaded down
   * to the Stage1FeedbackWidget Decide column AND to the FilterChipStrip
   * category dropdown (Plan 02-06). Hard-separation invariant preserved —
   * the category dropdown is hydrated from swarm_noise_categories only.
   */
  noiseCategories?: SwarmNoiseCategoryRow[];
  /**
   * Phase 5 Plan 05-03 — Stage 3 intents (swarm_intents registry). Source is
   * the Server Component that mounts the shell (loadSwarmIntents). Threaded to
   * the FilterChipStrip Topic dropdown. Loaded disjointly from noiseCategories
   * — NEVER merged (hard-separation: a row lives in exactly one of
   * swarm_noise_categories or swarm_intents).
   */
  intents?: SwarmIntentRow[];
  /** Sketch 001 lock — per-tab counts on the mode-bar (Queue/History/Patterns).
   *  Hydrated server-side on the /review page; passed through unchanged. */
  modeBarCounts?: ModeBarCounts;
  /**
   * Phase 5 Plan 05-03 (D-08) — which mode-bar slot is active. Defaults to
   * "queue" (the /review route). The /history route mounts the same shell with
   * activeMode="history" for the read-only browse posture.
   */
  activeMode?: ModeBarMode;
  /** Swarm-type segment for the Patterns slot href. */
  swarmType?: string;
  /**
   * Phase 5 Plan 05-01 Task 2 (D-02) — per-row email projection maps keyed by
   * email_label_id, threaded down to the InlineExpandRow EmailBodyBlock mount.
   * Sourced from loadReviewPageData on the /review page.
   */
  bodyByRow?: Record<string, string | null>;
  conversationByRow?: Record<string, string | null>;
  messageCountByRow?: Record<string, number | null>;
  /**
   * Phase 5 Plan 05-01 (REQ-07 / Plan 03) — per-row dry_run flag keyed by
   * email_label_id (default true when the source mailbox is unknown). Threaded
   * through for the live/dry_run audit slice + "Auto-applied" marker that
   * Plan 03 wires; carried here now so the loader output has a home.
   */
  dryRunByRow?: Record<string, boolean>;
}

export function BulkReviewClientShell({
  rows,
  initialSelectedId = null,
  mailboxLabels,
  senderLabels,
  subjectLabels,
  timestamps,
  noiseCategories,
  intents,
  modeBarCounts,
  swarmType,
  bodyByRow,
  conversationByRow,
  messageCountByRow,
  dryRunByRow,
  activeMode = "queue",
}: BulkReviewClientShellProps) {
  const searchParams = useSearchParams();

  // Phase 2 Plan 02-06 — read filter_* URL params + apply AND-composed
  // filtering. The unfiltered rows still drive the rule dropdown's
  // distinct-values derivation (so removing a filter doesn't shrink the
  // dropdown), but RowStripList sees only filteredRows.
  const filterSafety = searchParams?.get("filter_safety") ?? null;
  const filterMode = searchParams?.get("filter_mode") ?? null;
  const filterIntent = searchParams?.get("filter_intent") ?? null;
  // Sketch 008 — new stage-scoped facets (Stage 1 match type · Stage 2 match
  // source + account · Stage 4 action). Same URL-param + AND-compose model.
  const filterMatchType = searchParams?.get("filter_match_type") ?? null;
  const filterMatchSource = searchParams?.get("filter_match_source") ?? null;
  const filterAccount = searchParams?.get("filter_account") ?? null;
  const filterAction = searchParams?.get("filter_action") ?? null;
  const filteredRows = useMemo(() => {
    return applyFilters(
      rows,
      {
        rule: searchParams?.get("filter_rule") ?? null,
        mailbox: searchParams?.get("filter_mailbox") ?? null,
        category: searchParams?.get("filter_category") ?? null,
        from: searchParams?.get("filter_from") ?? null,
        to: searchParams?.get("filter_to") ?? null,
        safety: filterSafety,
        mode: filterMode,
        intent: filterIntent,
        matchType: filterMatchType,
        matchSource: filterMatchSource,
        account: filterAccount,
        action: filterAction,
      },
      mailboxLabels ?? {},
      timestamps ?? {},
      dryRunByRow ?? {},
    );
  }, [
    rows,
    searchParams,
    mailboxLabels,
    timestamps,
    filterSafety,
    filterMode,
    filterIntent,
    filterMatchType,
    filterMatchSource,
    filterAccount,
    filterAction,
    dryRunByRow,
  ]);

  // Phase 5 Plan 05-02 (D-03 / Pitfall 5) — an empty Safety result is the
  // correct, non-error state. Render the locked empty-state copy instead of
  // the row list when a safety filter is active and nothing matches.
  const showSafetyEmptyState =
    !!filterSafety &&
    filterSafety !== "all" &&
    filteredRows.length === 0;

  // Phase 5 Plan 05-03 (D-08) — History read-only browse empty state. When the
  // History surface (activeMode="history") has no rows in the current range,
  // render the locked copy instead of an empty list. The Safety empty state
  // takes precedence (it is a more specific filter result).
  const showHistoryEmptyState =
    activeMode === "history" &&
    !showSafetyEmptyState &&
    filteredRows.length === 0;

  // Phase 3 Plan 02 Task 1 — per-view Supabase real-time subscription on
  // agent_runs INSERT, filtered by the visible email_id set. RerunContext
  // exposes the in-flight set so deep-tree consumers (stage-2-decide.tsx,
  // row-strip-list.tsx) can call markInFlight() at submit time and read
  // inFlightIds for pulse-overlay + tab-disable behavior.
  const rerunEmailIds = useMemo(
    () =>
      filteredRows
        .map((r) => r.email_id)
        .filter((x): x is string => typeof x === "string"),
    [filteredRows],
  );
  const rerun = useRerunSubscription(rerunEmailIds);

  return (
    <RerunContext.Provider value={rerun}>
      <SelectionProvider
        initialSelectedId={initialSelectedId}
        rowIds={filteredRows.map((r) => r.email_label_id)}
      >
        {/* Phase 2 Plan 02-06 — mode-bar chrome above the row list. Queue is
            the only active mode in Phase 2; History + Patterns render as
            disabled placeholders per UI-SPEC §1 S1. */}
        <ModeBar activeMode={activeMode} swarmType={swarmType} counts={modeBarCounts} />
        {/* Phase 2 Plan 02-06 — queue-level historical browse filters
            (REQ-02 acceptance signal #4). URL-state only, no localStorage.
            Phase 5 Plan 05-03 — `intents` hydrates the Topic dropdown
            disjointly from `categories` (hard-separation). */}
        <FilterChipStrip
          rows={rows}
          categories={noiseCategories ?? []}
          intents={intents ?? []}
          mailboxLabels={mailboxLabels ?? {}}
        />
        {showSafetyEmptyState ? (
          <div
            data-testid="safety-empty-state"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-6) var(--space-5)",
              color: "var(--v7-text-muted)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--v7-text)",
              }}
            >
              {SAFETY_EMPTY_HEADING}
            </p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              {SAFETY_EMPTY_BODY}
            </p>
          </div>
        ) : showHistoryEmptyState ? (
          <div
            data-testid="history-empty-state"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-6) var(--space-5)",
              color: "var(--v7-text-muted)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--v7-text)",
              }}
            >
              No handled emails in this range.
            </p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              Pick an earlier From date to browse older decisions.
            </p>
          </div>
        ) : (
          <RowStripList
            rows={filteredRows}
            mailboxLabels={mailboxLabels}
            senderLabels={senderLabels}
            subjectLabels={subjectLabels}
            timestamps={timestamps}
            noiseCategories={noiseCategories}
            rerunInFlightIds={rerun.inFlightIds}
            bodyByRow={bodyByRow}
            conversationByRow={conversationByRow}
            messageCountByRow={messageCountByRow}
            swarmType={swarmType}
            dryRunByRow={dryRunByRow}
            correctionMode={activeMode === "history"}
          />
        )}
      </SelectionProvider>
    </RerunContext.Provider>
  );
}
