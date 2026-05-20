"use client";

/**
 * Phase 81 Plan 03 Task 1 — Noise-category chip strip.
 * Phase 82 Plan 06: refactored to delegate chip rendering to `_shell/ChipStrip`.
 *
 * Stage 1 horizontal filter strip rendered below <StageTabStrip currentStage={1}>
 * and above the unified row-list.
 *
 * Hard-separation lock (RFC docs/agentic-pipeline/README.md):
 *   - Stage 1 surface reads `swarm_noise_categories` ONLY.
 *   - Stage 3 intent registry is NEVER read or referenced from this file
 *     (grep-gate in the unit test enforces this).
 *
 * Phase 82 generic-abstraction note: this file remains the Stage-1-specific
 * wrapper. It still owns the URL contract (the `?topic=` / `?sub=` write
 * semantics live here — `_shell/ChipStrip` is a pure presentation primitive)
 * AND the tail "Pending promotion" Link pill (Phase 81 D-09 — only applies
 * to Stage 1; the unified ChipStrip primitive doesn't ship this tail).
 *
 * URL contract (D-08, D-10, D-11, Assumption A5):
 *   - Chip click writes ?topic=<category_key> AND clears ?sub (so picking a
 *     category exits the Pending Promotion sub-view).
 *   - "All" chip click deletes ?topic and clears ?sub.
 *   - Tail "Pending promotion" pill writes ?sub=pending.
 *   - "unknown" is rendered like any other chip (NO special-casing).
 *   - When categories.length === 0, strip still renders ("All" + divider +
 *     tail pill) — empty chip strip is signal.
 */

import { useCallback } from "react";
import Link from "next/link";
import {
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { QueueCountRow } from "./page";
import { ChipStrip, type ChipStripChip } from "../_shell/chip-strip";

interface NoiseCategoryChipStripProps {
  /** From loadSwarmNoiseCategories(admin, swarmType) — registry-driven. */
  categories: SwarmNoiseCategoryRow[];
  /** From the existing classifier_queue_counts RPC; only entries where
   *  topic !== null contribute to per-chip badges. */
  counts: QueueCountRow[];
  /** sp.topic ?? "all" — drives the active-state highlight. */
  activeTopic: string;
  /** data.candidates.length — badge for the tail "Pending promotion" pill. */
  candidateCount: number;
  /** sp.sub ?? null — when "pending", the Pending pill is active. */
  activeSub: string | null;
  /**
   * Phase 88 D-02: server-computed verdict-pending count. Rows in
   * automation_runs.status='predicted' for this swarm with no email_feedback
   * row at stage=1. Sourced from the
   * classifier_queue_verdict_pending(p_swarm_type) RPC. Replaces the prior
   * client-side `topic !== 'skip'` aggregation — that summed all non-skip
   * topics, which over-counted auto-handled rows the operator never
   * needs to look at.
   */
  verdictPendingCount: number;
}

export function NoiseCategoryChipStrip({
  categories,
  counts,
  activeTopic,
  candidateCount,
  activeSub,
  verdictPendingCount,
}: NoiseCategoryChipStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const navigate = useCallback(
    (nextTopic: string) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (nextTopic === "all") qs.delete("topic");
      else qs.set("topic", nextTopic);
      // Picking a category clears the Pending Promotion sub-view (A5).
      qs.delete("sub");
      const q = qs.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    },
    [router, pathname, search],
  );

  // Aggregate per-topic counts. Entries with topic === null are not chip
  // badges (they're swarm-wide aggregates) — exclude them.
  //
  // Phase 88 D-02: the "Needs review" leftmost chip no longer aggregates
  // non-skip topics here. It binds directly to the verdictPendingCount
  // prop, which is sourced from the classifier_queue_verdict_pending RPC
  // (anti-join on email_feedback at stage=1). The old client-side sum
  // over-counted auto-handled rows.
  const countByTopic = new Map<string, number>();
  counts.forEach((c) => {
    if (c.topic !== null) {
      countByTopic.set(c.topic, (countByTopic.get(c.topic) ?? 0) + c.count);
    }
  });

  const allActive = activeTopic === "all" && !activeSub;
  const pendingHref = (() => {
    const qs = new URLSearchParams(search?.toString() ?? "");
    qs.set("sub", "pending");
    // Pending pill is its own axis — keep other filters but the chip-strip
    // visual treats it as exclusive with topic chips (active-state logic).
    return `${pathname}?${qs.toString()}`;
  })();

  // Phase 82 Plan 06: chip data → `_shell/ChipStrip`. The wrapper retains the
  // URL contract (navigate() above) and the tail Pending Promotion Link pill.
  const activeKey = allActive
    ? "all"
    : activeSub
      ? "" // No chip is active when ?sub=pending takes over
      : activeTopic;

  // Hide zero-count category chips so the strip doesn't sprawl across 12+
  // empty pills (UAT 2026-05-20). Keep currently-active chip even when its
  // count is zero so a deep-linked or just-emptied filter stays visible —
  // otherwise the active styling would have nothing to anchor to.
  //
  // verdictPendingCount + per-category counts both come from the
  // pipeline_events_email_summary-based RPCs (migration
  // 20260521_phase88_classifier_queue_verdict_pending.sql, applied
  // 2026-05-20 post-UAT F-03). They mirror the loader's filter chain
  // exactly so chip totals reflect the full Stage 1 review backlog,
  // not just the paginated 100-row window the row list shows.
  const chipStripChips: ChipStripChip[] = [
    { key: "all", label: "Needs review", count: verdictPendingCount },
    ...categories
      .map((cat) => ({
        key: cat.category_key,
        label: cat.display_label,
        count: countByTopic.get(cat.category_key) ?? 0,
      }))
      .filter((chip) => chip.count > 0 || chip.key === activeKey),
  ];

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto py-1"
      aria-label="Filter Stage 1 by noise category"
    >
      <ChipStrip
        chips={chipStripChips}
        active={activeKey}
        onChange={navigate}
        ariaLabel="Filter Stage 1 by noise category"
      />
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 1,
          height: 24,
          background: "var(--v7-line)",
          marginLeft: 8,
          marginRight: 8,
          flexShrink: 0,
        }}
      />
      <Link
        href={pendingHref}
        role="tab"
        aria-selected={activeSub === "pending"}
        aria-label={`Pending promotion — ${candidateCount} candidate rules`}
        className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-[var(--v7-radius-pill)] border transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background:
            activeSub === "pending"
              ? "var(--v7-brand-secondary-soft)"
              : "var(--v7-panel-2)",
          borderColor:
            activeSub === "pending"
              ? "var(--v7-brand-secondary)"
              : "var(--v7-line)",
          color:
            activeSub === "pending"
              ? "var(--v7-brand-secondary)"
              : "var(--v7-text)",
          outlineColor: "var(--v7-brand-secondary)",
        }}
      >
        <span className="text-[13px] leading-[1.3] font-mono truncate max-w-[260px]">
          Pending promotion ·{" "}
        </span>
        <span
          className="text-[11px] leading-[1.3] font-mono px-1.5 py-0.5 rounded-[var(--v7-radius-pill)]"
          style={{
            background:
              activeSub === "pending"
                ? "rgba(105,168,255,0.18)"
                : "rgba(255,255,255,0.06)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {candidateCount >= 1000
            ? candidateCount.toLocaleString("en-US")
            : String(candidateCount)}
        </span>
      </Link>
    </div>
  );
}
