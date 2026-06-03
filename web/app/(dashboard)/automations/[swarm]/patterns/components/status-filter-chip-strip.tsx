"use client";

// Phase 4 Plan 02 Task 2 — status-filter chip strip for the Patterns listing.
//
// URL-state filter (?status=). Five chips: [all] [needs review]
// [being reviewed] [applied] [dismissed]. Default 'all'. Single-select.
// Operator-facing labels per P4-D-04 — raw backend status names live in the
// VALUES constant for type-guard duty only, never rendered as UI strings.
//
// Mirrors the Phase 2 filter-chip-strip URL-state idiom (useSearchParams +
// router.replace; omit param for the default value).

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { PromotionCandidateRow, PromotionStatus } from "@/lib/promotion-recommender/types";

/** Closed enumeration of accepted ?status= values. Unknown URL input falls
 *  through to 'all' in the consumer (PatternsListingShell.readStatusFilter). */
export const STATUS_FILTER_VALUES = [
  "all",
  "open",
  "in_review",
  "approved",
  "rejected",
] as const;

export type StatusFilterValue = (typeof STATUS_FILTER_VALUES)[number];

interface ChipDef {
  value: StatusFilterValue;
  label: string;
}

// Operator-facing labels (P4-D-04). Internal status names map to friendly
// vocabulary; never surface 'open' / 'in_review' / 'approved' / 'rejected'
// as a UI string.
const CHIPS: ReadonlyArray<ChipDef> = [
  { value: "all", label: "all" },
  { value: "open", label: "needs review" },
  { value: "in_review", label: "being reviewed" },
  { value: "approved", label: "applied" },
  { value: "rejected", label: "dismissed" },
];

export interface StatusFilterChipStripProps {
  /** Optional candidate list for inline per-chip counts (sketch 006 lock).
   *  When omitted (legacy tests), chips render without count badges. */
  candidates?: PromotionCandidateRow[];
}

export function StatusFilterChipStrip({ candidates }: StatusFilterChipStripProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams?.get("status") ?? "";
  const selected: StatusFilterValue = (STATUS_FILTER_VALUES as ReadonlyArray<string>).includes(
    raw,
  )
    ? (raw as StatusFilterValue)
    : "all";

  const setStatus = useCallback(
    (value: StatusFilterValue) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (value === "all") {
        next.delete("status");
      } else {
        next.set("status", value);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?");
    },
    [router, searchParams],
  );

  // Inline per-chip counts (sketch 006 lock: "all 18 · needs review 11 · ...").
  const counts = useMemo(() => {
    const out: Record<StatusFilterValue, number> = {
      all: 0,
      open: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
    };
    if (!candidates) return null;
    out.all = candidates.length;
    for (const c of candidates) {
      const s = c.status as PromotionStatus;
      if (s === "open" || s === "in_review" || s === "approved" || s === "rejected") {
        out[s] += 1;
      }
    }
    return out;
  }, [candidates]);

  return (
    <div
      data-testid="status-filter-chip-strip"
      role="tablist"
      aria-label="Filter suggestions by status"
      style={{
        display: "inline-flex",
        gap: "var(--space-2)",
        flexWrap: "wrap",
      }}
    >
      {CHIPS.map((chip) => {
        const isActive = chip.value === selected;
        const n = counts ? counts[chip.value] : null;
        return (
          <button
            key={chip.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`status-filter-chip-${chip.value}`}
            data-active={isActive ? "true" : "false"}
            onClick={() => setStatus(chip.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              fontSize: 12,
              padding: "var(--space-1) var(--space-3)",
              background: isActive
                ? "var(--v7-brand-patterns-soft)"
                : "var(--v7-panel-2)",
              color: isActive ? "var(--v7-brand-patterns)" : "var(--v7-muted)",
              border: isActive
                ? "1px solid var(--v7-brand-patterns)"
                : "1px solid var(--v7-line)",
              borderRadius: "var(--v7-radius-pill)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span>{chip.label}</span>
            {n !== null && (
              <span
                data-testid={`status-filter-chip-${chip.value}-count`}
                style={{
                  fontFamily: "var(--v7-font-mono)",
                  fontSize: 11,
                  color: isActive ? "var(--v7-brand-patterns)" : "var(--v7-faint)",
                  opacity: 0.85,
                }}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
