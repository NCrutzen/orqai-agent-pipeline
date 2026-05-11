// Phase 64-05 (BUDG-01 / BUDG-03). Pill-shaped chip rendered on rows
// where the originating Stage 0 run halted at the per-invocation budget
// ceiling (topic='budget_breach'). Server component.
//
// Tokens (per 64-UI-SPEC.md color section):
//   - background: rgba(255,107,122,0.13)  // declared inline; no global
//                                         //   --v7-red-soft token in this phase.
//   - color:      var(--v7-red)
//   - border:     1px solid var(--v7-line)
//   - radius:     var(--v7-radius-pill)
//   - eyebrow:    "BUDGET BREACH" (12px uppercase 600)
//   - reason:     12px font-mono
//
// Reason text comes verbatim from `pipeline.budget_breached.data.reason`
// (e.g. `cost_cents 18 > 15 ceiling`). Rendered as-is so operator and log
// pipeline see the same string.

interface BudgetBreachBadgeProps {
  reason: string;
}

export function BudgetBreachBadge({ reason }: BudgetBreachBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`Budget breach: ${reason}`}
      className="inline-flex items-center gap-2 px-2 py-1 border"
      style={{
        background: "rgba(255,107,122,0.13)",
        color: "var(--v7-red)",
        borderColor: "var(--v7-line)",
        borderRadius: "var(--v7-radius-pill)",
        fontSize: "12px",
        lineHeight: "1.4",
      }}
    >
      <span
        style={{
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        BUDGET BREACH
      </span>
      <code
        className="font-mono"
        style={{
          fontSize: "12px",
          fontVariantNumeric: "tabular-nums",
          opacity: 0.92,
        }}
      >
        {reason}
      </code>
    </span>
  );
}
