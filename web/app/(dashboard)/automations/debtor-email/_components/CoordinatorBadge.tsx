// Phase 65-05 (CORD-03 surface). Minimal partial_synthesis badge for the
// generic Bulk Review row strip. Phase 71 (LERN-*) lands the full ranked-list
// visualisation + operator override controls; Phase 65 only ships the data +
// a single visible chip.
//
// Render contract:
//   - partial_synthesis === true → "Partial" chip (amber).
//   - escalation_decision === "orchestrator" (no partial flag) → "Multi-intent" chip.
//   - else (single_shot fast path, no partial) → null.
//
// The chip uses the existing v7 token line-color and a soft amber background,
// matching the visual weight of BudgetBreachBadge without competing for
// attention with the BUDGET BREACH eyebrow (red).

import type { CoordinatorRunSummary } from "../_lib/coordinator-runs-loader";

interface Props {
  partial_synthesis?: boolean;
  escalation_decision?: CoordinatorRunSummary["escalation_decision"];
  escalation_reason?: string | null;
}

export function CoordinatorBadge({
  partial_synthesis,
  escalation_decision,
  escalation_reason,
}: Props) {
  const showPartial = partial_synthesis === true;
  const showOrchestrator =
    !showPartial && escalation_decision === "orchestrator";
  if (!showPartial && !showOrchestrator) return null;

  const label = showPartial ? "Partial" : "Multi-intent";

  return (
    <span
      data-testid="coordinator-badge"
      role="status"
      aria-label={
        showPartial
          ? `Synthesis partial: ${escalation_reason ?? "some handlers did not complete"}`
          : `Multi-intent orchestrator path: ${escalation_reason ?? ""}`
      }
      title={escalation_reason ?? undefined}
      className="inline-flex items-center px-2 py-0.5 border"
      style={{
        background: "rgba(245, 158, 11, 0.13)", // amber-500 @ 13%
        color: "var(--v7-text)",
        borderColor: "var(--v7-line)",
        borderRadius: "var(--v7-radius-pill)",
        fontSize: "11px",
        lineHeight: "1.4",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}
