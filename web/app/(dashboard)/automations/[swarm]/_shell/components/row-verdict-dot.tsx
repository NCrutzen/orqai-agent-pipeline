"use client";

export type RowVerdictDotVerdict = "confirm" | "override" | "unclear" | null;

export type RowVerdictDotProps = {
  verdict: RowVerdictDotVerdict;
};

function colorFor(verdict: RowVerdictDotVerdict): string {
  switch (verdict) {
    case "confirm":
      return "var(--v7-lime)";
    case "override":
      return "var(--v7-amber)";
    case "unclear":
      return "var(--v7-brand-secondary)";
    default:
      return "transparent";
  }
}

export function RowVerdictDot({ verdict }: RowVerdictDotProps) {
  return (
    <span
      data-testid="row-verdict-dot"
      data-verdict={verdict ?? "none"}
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 4,
        top: "50%",
        transform: "translateY(-50%)",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colorFor(verdict),
        border: verdict === null ? "1px dashed var(--v7-text-dim)" : "none",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
