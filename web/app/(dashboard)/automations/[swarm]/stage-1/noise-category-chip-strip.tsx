"use client";

/**
 * Phase 81 Plan 03 Task 1 — Noise-category chip strip.
 *
 * Stage 1 horizontal filter strip rendered below <StageTabStrip currentStage={1}>
 * and above the predicted-row list. Replaces the legacy <QueueTree> sidebar.
 *
 * Hard-separation lock (RFC docs/agentic-pipeline/README.md):
 *   - Stage 1 surface reads `swarm_noise_categories` ONLY.
 *   - Stage 3 intent registry is NEVER read or referenced from this file
 *     (grep-gate in the unit test enforces this).
 *
 * Visual idiom mirrors recipient-chip-strip.tsx (same tokens, same Chip primitive)
 * minus the brand dot. Per CONTEXT §specifics + PATTERNS Anti-Pattern: do NOT
 * extract a generic ChipStrip abstraction — duplicate the styling, keep types
 * per surface.
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
}

export function NoiseCategoryChipStrip({
  categories,
  counts,
  activeTopic,
  candidateCount,
  activeSub,
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
  const countByTopic = new Map<string, number>();
  let totalCount = 0;
  for (const c of counts) {
    totalCount += c.count;
    if (c.topic !== null) {
      countByTopic.set(c.topic, (countByTopic.get(c.topic) ?? 0) + c.count);
    }
  }

  const allActive = activeTopic === "all" && !activeSub;
  const pendingHref = (() => {
    const qs = new URLSearchParams(search?.toString() ?? "");
    qs.set("sub", "pending");
    // Pending pill is its own axis — keep other filters but the chip-strip
    // visual treats it as exclusive with topic chips (active-state logic).
    return `${pathname}?${qs.toString()}`;
  })();

  return (
    <div
      role="tablist"
      aria-label="Filter Stage 1 by noise category"
      className="flex items-center gap-2 overflow-x-auto py-3"
    >
      <Chip
        active={allActive}
        label="All"
        rowCount={totalCount}
        onClick={() => navigate("all")}
      />
      {categories.map((cat) => (
        <Chip
          key={cat.category_key}
          active={activeTopic === cat.category_key && !activeSub}
          label={cat.display_label}
          rowCount={countByTopic.get(cat.category_key) ?? 0}
          onClick={() => navigate(cat.category_key)}
        />
      ))}
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

interface ChipProps {
  active: boolean;
  label: string;
  rowCount: number;
  onClick: () => void;
}

function Chip({ active, label, rowCount, onClick }: ChipProps) {
  const display =
    rowCount >= 1000 ? rowCount.toLocaleString("en-US") : String(rowCount);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`${label} — ${rowCount} predicted rows`}
      onClick={onClick}
      className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-[var(--v7-radius-pill)] border transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: active
          ? "var(--v7-brand-secondary-soft)"
          : "var(--v7-panel-2)",
        borderColor: active
          ? "var(--v7-brand-secondary)"
          : "var(--v7-line)",
        color: active ? "var(--v7-brand-secondary)" : "var(--v7-text)",
        outlineColor: "var(--v7-brand-secondary)",
      }}
    >
      <span className="text-[13px] leading-[1.3] font-mono truncate max-w-[260px]">
        {label}
      </span>
      <span
        className="text-[11px] leading-[1.3] font-mono px-1.5 py-0.5 rounded-[var(--v7-radius-pill)]"
        style={{
          background: active
            ? "rgba(105,168,255,0.18)"
            : "rgba(255,255,255,0.06)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display}
      </span>
    </button>
  );
}
