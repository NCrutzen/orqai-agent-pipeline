"use client";

// Phase 76 Plan 06 Task 3 — Filter chips (UI-SPEC §Filter chips, sketch 006).
//
// Three chips: All / No handler / Low confidence with live counts. Active
// chip uses --v7-brand-primary-soft bg + brand-primary border (UI-SPEC
// accent-reserved item #2).

export type Stage3Filter = "all" | "no_handler" | "low_confidence";

interface Props {
  active: Stage3Filter;
  counts: { all: number; no_handler: number; low_confidence: number };
  onChange: (next: Stage3Filter) => void;
}

const CHIPS: ReadonlyArray<{ key: Stage3Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "no_handler", label: "No handler" },
  { key: "low_confidence", label: "Low confidence" },
];

export function FilterChips({ active, counts, onChange }: Props) {
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
      {CHIPS.map((c) => {
        const isActive = c.key === active;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-pressed={isActive}
            style={{
              fontSize: "13px",
              fontWeight: isActive ? 500 : 400,
              padding: "var(--space-1) var(--space-3)",
              background: isActive
                ? "var(--v7-brand-primary-soft)"
                : "transparent",
              color: isActive ? "var(--v7-brand-primary)" : "var(--v7-text-muted)",
              border: isActive
                ? "1px solid var(--v7-brand-primary)"
                : "1px solid var(--v7-border)",
              borderRadius: "4px",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {c.label}{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
              {counts[c.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
