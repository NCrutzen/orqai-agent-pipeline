"use client";

// Phase 76 Plan 06 Task 3 — Confidence bar (UI-SPEC §Color, sketch 006).
//
// 40px wide, 4px tall. Color buckets: amber<0.40, blue<0.66, green≥0.66.
// Caller is responsible for ONLY rendering this on low_confidence rows
// (per UI-SPEC — no_handler rows have no numeric confidence).

export function ConfBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  let color = "var(--v7-amber)";
  if (clamped >= 0.66) color = "var(--v7-success)";
  else if (clamped >= 0.4) color = "var(--v7-blue)";
  return (
    <span
      role="img"
      aria-label={`confidence ${clamped.toFixed(2)}`}
      style={{
        display: "inline-block",
        width: "40px",
        height: "4px",
        background: "var(--v7-border)",
        borderRadius: "4px",
        position: "relative",
        verticalAlign: "middle",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          width: `${clamped * 100}%`,
          background: color,
          borderRadius: "4px",
        }}
      />
    </span>
  );
}
