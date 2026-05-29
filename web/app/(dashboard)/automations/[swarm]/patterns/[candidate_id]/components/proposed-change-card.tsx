"use client";

// Phase 4 Plan 03 Task 3 — Before/After proposed-change card.
//
// Renders proposed_change.before_after_payload as two numbered columns +
// per-email cost line + savings delta in lime. Falls back to a compact
// "not available" notice for candidates without v2 enrichment.

import type { ProposedChange } from "@/lib/promotion-recommender/types";

export interface ProposedChangeCardProps {
  proposedChange: ProposedChange;
}

function formatEuros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function ProposedChangeCard({ proposedChange }: ProposedChangeCardProps) {
  const payload = proposedChange.before_after_payload;

  if (!payload) {
    return (
      <div
        data-testid="proposed-change-card"
        data-variant="fallback"
        style={{
          padding: "var(--space-3)",
          border: "1px solid var(--v7-border)",
          borderRadius: 6,
          background: "var(--v7-bg)",
          color: "var(--v7-text-muted)",
          fontSize: 13,
        }}
      >
        Detailed before/after isn’t available for this suggestion yet.
      </div>
    );
  }

  const savingsCents = payload.before_cost_cents - payload.after_cost_cents;
  const savingsEuros = (savingsCents / 100).toFixed(2);

  return (
    <div
      data-testid="proposed-change-card"
      data-variant="full"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--v7-border)",
        borderRadius: 6,
        background: "var(--v7-bg)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-3)",
        }}
      >
        <section data-testid="before-column">
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, marginBottom: 8 }}>
            Today
          </h3>
          <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            {payload.before_steps.map((s, i) => (
              <li key={`b-${i}`}>{s}</li>
            ))}
          </ol>
          <p
            data-testid="before-cost"
            style={{
              marginTop: 8,
              fontFamily: "var(--v7-font-mono, monospace)",
              fontSize: 12,
              color: "var(--v7-text-muted)",
            }}
          >
            cost per email: {formatEuros(payload.before_cost_cents)}
          </p>
        </section>
        <section data-testid="after-column">
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, marginBottom: 8 }}>
            With this suggestion
          </h3>
          <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            {payload.after_steps.map((s, i) => (
              <li key={`a-${i}`}>{s}</li>
            ))}
          </ol>
          <p
            data-testid="after-cost"
            style={{
              marginTop: 8,
              fontFamily: "var(--v7-font-mono, monospace)",
              fontSize: 12,
              color: "var(--v7-text-muted)",
            }}
          >
            cost per email: {formatEuros(payload.after_cost_cents)}
          </p>
        </section>
      </div>
      <p
        data-testid="savings-delta"
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--v7-lime, var(--lime))",
        }}
      >
        saves ~€{savingsEuros} per email
      </p>
    </div>
  );
}
