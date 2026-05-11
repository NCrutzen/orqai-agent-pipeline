"use client";

// Phase 82 Plan 01 — Pure presentation chip strip primitive.
//
// Hard-separation lock (RESEARCH Pitfall 6 + Anti-Patterns; Phase 81-03 STATE):
//   This component MUST NOT import any swarm-registry loader or per-registry
//   row types — no DB client either. It accepts already-resolved `chips[]` and
//   calls `onChange(key)`. Per-stage wrappers retain the registry-coupling
//   boundary; they consume this primitive, not replace it. Source-grep gate
//   in chip-strip.test.tsx enforces this invariant.
//
// Visual idiom: copied from stage-1/recipient-chip-strip.tsx (the pill shape
// with --v7-brand-secondary-soft background + --v7-brand-secondary border on
// active). 8px brand dot optional; 11px mono row-count badge.

import { useCallback } from "react";

export interface ChipStripChip {
  key: string;
  label: string;
  count?: number;
  /** Optional CSS var name (e.g. "--v7-lime") for the per-chip brand dot. */
  brandToken?: string | null;
}

export interface ChipStripProps {
  chips: ChipStripChip[];
  /** Currently active key (matched against chip.key). */
  active: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}

export function ChipStrip({ chips, active, onChange, ariaLabel }: ChipStripProps) {
  const isActive = useCallback((key: string) => key === active, [active]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? "Filter"}
      className="flex items-center gap-2 overflow-x-auto py-3"
    >
      {chips.map((c) => (
        <Chip
          key={c.key}
          active={isActive(c.key)}
          label={c.label}
          rowCount={c.count}
          brandToken={c.brandToken ?? null}
          onClick={() => onChange(c.key)}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  active: boolean;
  label: string;
  rowCount?: number;
  brandToken: string | null;
  onClick: () => void;
}

function Chip({ active, label, rowCount, brandToken, onClick }: ChipProps) {
  const display =
    rowCount === undefined
      ? null
      : rowCount >= 1000
        ? rowCount.toLocaleString("en-US")
        : String(rowCount);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={
        display !== null ? `${label} — ${rowCount} rows` : label
      }
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
      {brandToken && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: `var(${brandToken})`,
          }}
        />
      )}
      <span className="text-[13px] leading-[1.3] font-mono truncate max-w-[260px]">
        {label}
      </span>
      {display !== null && (
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
      )}
    </button>
  );
}
