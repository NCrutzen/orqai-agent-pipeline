"use client";

/**
 * Phase 71-04 (REVW-01..06). Single predicted-row strip.
 *
 * Implements UI-SPEC §Predicted-row list and §Row interactions:
 *   - 5-column grid: 200px recipient | 280px from/subj | 1fr stage cells | 84px cost | 70px tag.
 *   - Recipient col: 6px brand dot + email mono.
 *   - 4 stage cells: decision text | ↻ amber glyph (overridden) | em-dash (skipped).
 *   - Cost: €{(total_cost_cents/100).toFixed(3)}.
 *   - Tag pill (cap/reg) only when at least one stage was overridden.
 *   - Tooltip on ↻ glyph: "Stage {N} overridden by {operator email} on {date}".
 *
 * Pure presentational; selection / click handler wired by row-list (Plan 05).
 */
import { brandColorToken, brandDisplayName } from "@/lib/swarms/brand-color";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface SummaryRow {
  email_id: string;
  swarm_type: string;
  /** entity_brand registry code; resolved to brand-dot colour via brandColorToken. */
  entity_brand: string | null;
  /** Recipient inbox (e.g. debiteuren@smeba.nl). */
  recipient_inbox: string;
  /** Sender email + (optional) display name. */
  from: string;
  fromName: string | null;
  subject: string;
  /** Per-stage decision text, indexed 1..4. null = stage didn't fire. */
  stage_decisions: {
    1: string | null;
    2: string | null;
    3: string | null;
    4: string | null;
  };
  /** Per-stage override flag, indexed 1..4. */
  stage_overridden: {
    1: boolean;
    2: boolean;
    3: boolean;
    4: boolean;
  };
  /** Per-stage override metadata (operator + date) for the tooltip; optional. */
  stage_override_meta?: Partial<
    Record<1 | 2 | 3 | 4, { operator: string; submitted_at: string }>
  >;
  total_cost_cents: number;
  /** "capability" / "regression" — only present when at least one stage_overridden is true. */
  eval_type: "capability" | "regression" | null;
}

interface PredictedRowProps {
  row: SummaryRow;
  selected?: boolean;
  onSelect?: (email_id: string) => void;
}

const STAGE_NS: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

export function PredictedRow({ row, selected, onSelect }: PredictedRowProps) {
  const anyOverridden =
    row.stage_overridden[1] ||
    row.stage_overridden[2] ||
    row.stage_overridden[3] ||
    row.stage_overridden[4];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row.email_id)}
      aria-pressed={!!selected}
      aria-label={`Select email ${row.subject || "(no subject)"} from ${row.from}`}
      className="grid w-full text-left transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        gridTemplateColumns: "200px 280px 1fr 84px 70px",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: "var(--v7-radius-sm)",
        background: selected
          ? "var(--v7-brand-secondary-soft)"
          : "var(--v7-panel-2)",
        borderLeft: selected
          ? "3px solid var(--v7-brand-secondary)"
          : "3px solid transparent",
        outlineColor: "var(--v7-brand-secondary)",
      }}
    >
      {/* Recipient col */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Phase 82.7.1 D-06/D-07/D-08 — brand-color swatch with hover
            tooltip showing the brand display name. Promotes the swatch
            from aria-hidden to role=img + aria-label so screen readers
            surface the brand. Uses Radix Tooltip pattern from the ↻
            overridden glyph block below (~L181-198).
            Phase 82.7.2 F-01 — wrap the 6×6 visual swatch in a 14×14
            transparent hit-target so Radix Tooltip reliably receives
            pointer events. Matches the hit-area of the sibling ↻
            overridden-glyph tooltip below (~L194-211). Visual swatch
            dimensions unchanged. */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 14,
                  height: 14,
                  flexShrink: 0,
                  cursor: "default",
                }}
              >
                <span
                  role="img"
                  aria-label={`Brand: ${brandDisplayName(row.entity_brand)}`}
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: `var(${brandColorToken(row.entity_brand)})`,
                    flexShrink: 0,
                  }}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{brandDisplayName(row.entity_brand)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-[12px] leading-[1.3] font-mono truncate min-w-0">
          {row.recipient_inbox}
        </span>
      </div>

      {/* From / subject col */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className="text-[12px] leading-[1.3] truncate min-w-0"
          style={{ color: "var(--v7-muted)" }}
        >
          {row.fromName ? `${row.fromName} <${row.from}>` : row.from}
        </span>
        <span className="text-[13px] leading-[1.4] font-medium truncate min-w-0">
          {row.subject || "(no subject)"}
        </span>
      </div>

      {/* 4 stage cells */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          minWidth: 0,
        }}
      >
        {STAGE_NS.map((n) => (
          <StageCell
            key={n}
            n={n}
            decision={row.stage_decisions[n]}
            overridden={row.stage_overridden[n]}
            meta={row.stage_override_meta?.[n]}
          />
        ))}
      </div>

      {/* Cost col */}
      <span
        className="text-[12px] leading-[1.3] font-mono text-right"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        €{(row.total_cost_cents / 100).toFixed(3)}
      </span>

      {/* Tag col (cap / reg) */}
      <div className="flex justify-end">
        {anyOverridden && row.eval_type && (
          <EvalPill kind={row.eval_type} />
        )}
      </div>
    </button>
  );
}

function StageCell({
  n,
  decision,
  overridden,
  meta,
}: {
  n: 1 | 2 | 3 | 4;
  decision: string | null;
  overridden: boolean;
  meta?: { operator: string; submitted_at: string };
}) {
  if (overridden) {
    const date = meta
      ? new Date(meta.submitted_at).toLocaleDateString("en-GB")
      : "";
    const operator = meta?.operator ?? "operator";
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label={`Stage ${n} overridden`}
              className="text-[14px] leading-[1.3] font-mono text-center inline-block"
              style={{ color: "var(--v7-amber)" }}
            >
              ↻
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Stage {n} overridden by {operator}
            {date ? ` on ${date}` : ""}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (decision === null) {
    return (
      <span
        aria-label={`Stage ${n} skipped`}
        className="text-[12px] leading-[1.3] font-mono text-center"
        style={{ color: "var(--v7-muted)", opacity: 0.4 }}
      >
        —
      </span>
    );
  }
  return (
    <span
      className="text-[12px] leading-[1.3] font-mono truncate"
      style={{ color: "var(--v7-text)" }}
      title={decision}
    >
      {decision}
    </span>
  );
}

function EvalPill({ kind }: { kind: "capability" | "regression" }) {
  const isCap = kind === "capability";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[var(--v7-radius-pill)] text-[11px] font-semibold uppercase"
      style={{
        letterSpacing: "0.04em",
        background: isCap
          ? "rgba(138,208,94,0.16)"
          : "rgba(255,107,122,0.16)",
        color: isCap ? "var(--v7-lime)" : "var(--v7-red)",
      }}
    >
      {isCap ? "cap" : "reg"}
    </span>
  );
}
