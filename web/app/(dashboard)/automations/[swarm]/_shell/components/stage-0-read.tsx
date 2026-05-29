"use client";

// Phase 2 Plan 02-02 — Stage 0 Read column.
//
// Renders the system's safety verdict for the row using the canonical
// section pattern (canonical-patterns.md §5): uppercase label + verdict
// pill + key/value body. No bordered evidence cards (UI-SPEC §1 lock).
//
// Operator-language locks (operator-language.md):
//   • safe                → "Safe"
//   • injection (suspected) → "Prompt-injection suspected"  (NEVER the raw enum)
//   • over_budget          → "Too large"  (NEVER "Over budget"/the raw enum —
//                            Phase 5 Plan 05-02 D-04 reconciliation)
//
// Pre-Phase-64 graceful behavior (OQ-2 / P2-D-03): when row.stage_0 is
// null, render a single locked sentence telling the operator that Stage 0
// has not shipped and the row is auto-treated as `safe`. No pill, no body.

import type { BulkReviewRow, Stage0Verdict } from "@/lib/bulk-review/types";

interface Stage0ReadProps {
  row: BulkReviewRow;
}

interface VerdictDescriptor {
  label: string;
  bgVar: string;
  fgVar: string;
}

// Locked mapping. The switch in renderPill is the ONLY place the raw enum
// is read; the operator-facing label never escapes this table.
const VERDICT_DESCRIPTORS: Record<Stage0Verdict, VerdictDescriptor> = {
  safe: {
    label: "Safe",
    bgVar: "var(--v7-state-safe-bg)",
    fgVar: "var(--v7-state-safe-fg)",
  },
  injection_suspected: {
    label: "Prompt-injection suspected",
    bgVar: "var(--v7-state-blocked-bg)",
    fgVar: "var(--v7-state-blocked-fg)",
  },
  over_budget: {
    // Phase 5 Plan 05-02 D-04 — operator label "Too large" (not "Over
    // budget"); over_budget uses the amber/warn semantic (UI-SPEC § Color).
    label: "Too large",
    bgVar: "var(--v7-state-warn-bg)",
    fgVar: "var(--v7-state-warn-fg)",
  },
};

/** Phase 5 Plan 05-02 D-04 / SC#4 — placeholder-tolerant over_budget cost
 *  line. cost_cents → "€N.NN" when present, "—" when null (Phase 64 has not
 *  shipped real budget data). tokens has no slot field today → "—". Never
 *  throws. */
function formatCostCents(cents: number | null): string {
  return cents != null ? (cents / 100).toFixed(2) : "—";
}

export function Stage0Read({ row }: Stage0ReadProps) {
  const slot = row.stage_0;

  if (slot === null) {
    // OQ-2 resolution — locked placeholder copy. Keep verbatim.
    return (
      <p
        data-testid="stage-0-read-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Stage 0 has not yet shipped — this row is auto-treated as{" "}
        <code
          style={{
            fontFamily: "var(--v7-font-mono)",
            color: "var(--v7-fg-muted)",
            fontSize: 12,
          }}
        >
          safe
        </code>
        .
      </p>
    );
  }

  const desc = VERDICT_DESCRIPTORS[slot.verdict];

  return (
    <div
      data-testid="stage-0-read"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div
        data-testid="stage-0-read-label"
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--v7-fg-muted)",
          fontWeight: 600,
        }}
      >
        Safety verdict
      </div>
      <span
        data-testid="stage-0-read-verdict-pill"
        data-verdict={slot.verdict}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 24,
          padding: "0 10px",
          background: desc.bgVar,
          color: desc.fgVar,
          borderRadius: "var(--v7-radius-pill)",
          fontSize: 12,
          fontWeight: 500,
          alignSelf: "flex-start",
        }}
      >
        {desc.label}
      </span>
      {/* D-04 / SC#4 — over_budget light cost line. Placeholder-tolerant:
          renders the cost when present, "—" when null. Never throws. */}
      {slot.verdict === "over_budget" ? (
        <p
          data-testid="stage-0-read-cost-line"
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--v7-fg-muted)",
            lineHeight: 1.5,
          }}
        >
          Too large — est. cost{" "}
          <span style={{ fontFamily: "var(--v7-font-mono)" }}>
            €{formatCostCents(slot.cost_cents)}
          </span>{" "}
          · ~<span style={{ fontFamily: "var(--v7-font-mono)" }}>—</span> tokens
        </p>
      ) : null}
      {/* Key/value body (section pattern §5): keep minimal — only show
          confidence when available. No bordered evidence cards. */}
      {slot.confidence != null ? (
        <dl
          data-testid="stage-0-read-kv"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-1) var(--space-3)",
            fontSize: 12,
            margin: 0,
            color: "var(--v7-text)",
          }}
        >
          <dt style={{ color: "var(--v7-fg-muted)" }}>Confidence</dt>
          <dd style={{ margin: 0, fontFamily: "var(--v7-font-mono)" }}>
            {slot.confidence.toFixed(2)}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
