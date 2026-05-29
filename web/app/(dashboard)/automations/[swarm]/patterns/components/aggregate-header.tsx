"use client";

// Phase 4 Plan 02 Task 2 — top-of-page aggregate header.
//
// Sketch 006 lock — h1 + descriptive summary line + savings impact, replacing
// the prior bone-dry "N suggestions · est. €X/mo" pill (2026-05-27 audit).
// Counts cover candidates with status IN ('open', 'in_review') — the ones
// the operator still has work to do on. Always rendered so chrome stays
// stable when the queue empties.

import { useMemo } from "react";

import type { PromotionCandidateRow } from "@/lib/promotion-recommender/types";
import { suggestionsLabel } from "../_lib/pluralize";

export interface AggregateHeaderProps {
  candidates: PromotionCandidateRow[];
  swarmType: string;
}

const REVIEWABLE_STATUSES = new Set(["open", "in_review"]);

export function AggregateHeader({ candidates, swarmType }: AggregateHeaderProps) {
  const { count, totalEur } = useMemo(() => {
    let c = 0;
    let cents = 0;
    for (const row of candidates) {
      if (!REVIEWABLE_STATUSES.has(row.status)) continue;
      c += 1;
      cents += row.expected_savings_cents_per_month ?? 0;
    }
    return { count: c, totalEur: Math.round(cents / 100) };
  }, [candidates]);

  return (
    <header
      data-testid="patterns-aggregate-header"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--v7-brand-patterns-soft)",
        border: "1px solid var(--v7-brand-patterns)",
        borderRadius: "var(--v7-radius-sm)",
        color: "var(--v7-text)",
      }}
    >
      <h1
        data-testid="patterns-aggregate-h1"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: 15,
          fontWeight: 500,
          margin: 0,
          color: "var(--v7-text)",
        }}
      >
        <span
          style={{
            background: "var(--v7-brand-patterns)",
            color: "var(--v7-inverse)",
            padding: "2px var(--space-2)",
            borderRadius: "var(--v7-radius-pill)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          Patterns
        </span>
        <span style={{ color: "var(--v7-text)" }}>
          Things the system could learn · {swarmType}
        </span>
      </h1>

      <p
        data-testid="patterns-aggregate-summary"
        style={{
          margin: 0,
          fontSize: 13,
          color: "var(--v7-muted)",
          lineHeight: 1.5,
        }}
      >
        <span data-testid="patterns-aggregate-count">{suggestionsLabel(count)}</span>
        <span> from your team&rsquo;s recent corrections (last 30 days)</span>
        {count > 0 && totalEur > 0 ? (
          <>
            <span> · could save the company </span>
            <strong
              data-testid="patterns-aggregate-savings"
              style={{ color: "var(--v7-lime)" }}
            >
              €{totalEur} / month
            </strong>
            <span> if all applied</span>
          </>
        ) : count > 0 ? (
          <span data-testid="patterns-aggregate-savings"> · est. saved not yet computed</span>
        ) : null}
      </p>
    </header>
  );
}
