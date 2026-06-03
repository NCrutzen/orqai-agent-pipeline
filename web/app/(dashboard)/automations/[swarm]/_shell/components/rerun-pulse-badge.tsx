"use client";

// Phase 3 Plan 02 Task 1 — Re-run in-flight pulse badge.
//
// Renders an 8x8 amber dot in the top-right corner of a positioned-parent cell.
// Driven by the per-view useRerunSubscription hook (P3-D-08): when an
// email_id is in `inFlightIds`, the parent row's Stage 3 + Stage 4 cells
// overlay this badge until the next agent_runs INSERT lands.
//
// Anti-drift #2 (timing) + token discipline (no raw hex) verified by
// acceptance greps in the plan's Task 1 acceptance criteria.

import styles from "./rerun-pulse-badge.module.css";

export interface RerunPulseBadgeProps {
  /** Optional data-testid suffix so a single cell can host multiple badges
   *  in tests without selector collision. */
  testId?: string;
}

export function RerunPulseBadge({
  testId = "rerun-pulse-badge",
}: RerunPulseBadgeProps) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className={styles.badge}
    />
  );
}
