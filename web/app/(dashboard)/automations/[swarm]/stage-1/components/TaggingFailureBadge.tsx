// Phase 67-06 (D-08, R-03, TAG-03 surface). Deferred-run badge for failed
// iController tagging. Rendered in the row strip when the row's enriched
// `tagging.icontroller_tag_status === 'failed'`. Visually mirrors
// CoordinatorBadge so Bulk Review reads as a single coherent surface;
// uses the same v7 pill tokens and a soft-red background to signal failure
// (vs CoordinatorBadge's amber for partial/multi-intent).
//
// Phase 71 (LERN-*) will broaden the surface (retry button + bulk-retry).
// Phase 67 ships read-only.

import type { TaggingFailureSummary } from "../../../debtor-email/_lib/tagging-failures-loader";

export interface TaggingFailureBadgeProps {
  tagging: TaggingFailureSummary;
}

export function TaggingFailureBadge({ tagging }: TaggingFailureBadgeProps) {
  if (tagging.icontroller_tag_status !== "failed") return null;
  const label = tagging.error?.startsWith("brand_mismatch:")
    ? "Tag: brand mismatch"
    : "Tag: failed";
  return (
    <span
      data-testid="tagging-failure-badge"
      role="status"
      aria-label={`iController tagging failed: ${
        tagging.error ?? "unknown error"
      }`}
      title={tagging.error ?? "iController tagging failed"}
      className="inline-flex items-center px-2 py-0.5 border"
      style={{
        background: "rgba(239, 68, 68, 0.13)", // red-500 @ 13%
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
