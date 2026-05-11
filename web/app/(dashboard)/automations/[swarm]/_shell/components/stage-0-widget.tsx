"use client";

// Phase 82 Plan 01 — Stage 0 injection_suspected 2-state toggle widget.
//
// Net-new (no Stage 0 cell exists in the legacy 4-axis pane). Mirrors the
// visual idiom of Stage 1's eval-type radio pair (radio-row inside the
// per-stage widget area).
//
// Stage 0 is the safety-pre-filter axis: a row is either "Injection suspected"
// (LLM/prompt-injection or unsafe content detected) or "Clean" (passes safety
// gate). Operators override here to either escalate a missed injection
// (false-negative) or clear a false-positive.

import type { ChangeEvent } from "react";

interface Stage0WidgetProps {
  value: boolean | null;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Stage0Widget({ value, onChange, disabled }: Stage0WidgetProps) {
  const handleChange = (next: boolean) => (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) onChange(next);
  };

  return (
    <fieldset
      aria-label="Stage 0 safety verdict"
      style={{
        border: 0,
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
      disabled={disabled}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: 13,
          color: "var(--v7-text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="radio"
          name="stage-0-verdict"
          value="injection_suspected"
          checked={value === true}
          onChange={handleChange(true)}
          disabled={disabled}
        />
        <span>Injection suspected</span>
      </label>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          fontSize: 13,
          color: "var(--v7-text)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="radio"
          name="stage-0-verdict"
          value="clean"
          checked={value === false}
          onChange={handleChange(false)}
          disabled={disabled}
        />
        <span>Clean</span>
      </label>
    </fieldset>
  );
}
