"use client";

// Phase 76 Plan 07 Task 2 — Stage 4 filter chips (UI-SPEC §Filter chips).
//
// Single chip "Handler errors <count>" — Stage 4 only has one row category,
// but the chip renders for visual consistency with Stage 3.

interface Props {
  count: number;
}

export function Stage4FilterChips({ count }: Props) {
  return (
    <div
      className="chip-strip"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-5)",
        borderBottom: "1px solid var(--v7-border)",
        background: "var(--v7-bg)",
      }}
    >
      <button
        type="button"
        aria-pressed={true}
        style={{
          fontSize: "13px",
          fontWeight: 500,
          padding: "var(--space-1) var(--space-3)",
          background: "var(--v7-brand-primary-soft)",
          color: "var(--v7-brand-primary)",
          border: "1px solid var(--v7-brand-primary)",
          borderRadius: "4px",
          cursor: "default",
          fontFamily: "var(--font-sans)",
        }}
      >
        Handler errors{" "}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
          {count}
        </span>
      </button>
    </div>
  );
}
