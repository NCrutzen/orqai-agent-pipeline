"use client";

// Phase 60-04 (D-26). Status pill mapping rule.status -> v7 token palette.
// Cloned padding/radius/font from web/components/v7/kanban/job-tag-pill.tsx.

import { cn } from "@/lib/utils";

export type RuleStatusBadgeVariant =
  | "candidate"
  | "promoted"
  | "demoted"
  | "manual_block"
  | "shadow_would_promote";

const STATUS_BG: Record<RuleStatusBadgeVariant, string> = {
  candidate: "var(--v7-amber-soft)",
  promoted: "var(--v7-brand-primary-soft)",
  demoted: "rgba(181,69,78,0.13)",
  manual_block: "var(--v7-panel-2)",
  shadow_would_promote: "var(--v7-blue-soft)",
};

const STATUS_FG: Record<RuleStatusBadgeVariant, string> = {
  candidate: "var(--v7-amber)",
  promoted: "var(--v7-brand-primary)",
  demoted: "var(--v7-red)",
  manual_block: "var(--v7-muted)",
  shadow_would_promote: "var(--v7-blue)",
};

const STATUS_LABEL: Record<RuleStatusBadgeVariant, string> = {
  candidate: "Candidate",
  promoted: "Promoted",
  demoted: "Demoted",
  manual_block: "Manually blocked",
  shadow_would_promote: "Would have promoted",
};

interface RuleStatusBadgeProps {
  variant: RuleStatusBadgeVariant;
  label?: string;
}

export function RuleStatusBadge({ variant, label }: RuleStatusBadgeProps) {
  const text = label ?? STATUS_LABEL[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center px-[9px] py-[6px] rounded-[var(--v7-radius-pill)]",
        "text-[11.8px] leading-[1.2] font-semibold",
        "border border-[var(--v7-line)]",
      )}
      style={{ background: STATUS_BG[variant], color: STATUS_FG[variant] }}
      aria-label={STATUS_LABEL[variant]}
    >
      {text}
    </span>
  );
}
