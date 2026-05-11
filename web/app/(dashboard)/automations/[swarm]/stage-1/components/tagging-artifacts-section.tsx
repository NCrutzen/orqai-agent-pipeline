"use client";

// Phase 82.1 Plan 04 (CONTEXT D-09). Tagging artifacts section — extracted
// from the legacy Stage 1 override pane's tagging-failure surface into a
// standalone slot that Stage 1 client-shell passes to
// UnifiedDetailPane.extrasBelowPipeline.
//
// Renders inline iController tag failure context (status, error text,
// before/after screenshots) so operators can audit the side-effect failure
// without leaving the detail pane. Returns null when the row has no
// tagging-failure enrichment (debtor-email swarm only today).

import type { PredictedRow } from "../page";

interface TaggingArtifactsSectionProps {
  row: PredictedRow | null;
}

export function TaggingArtifactsSection({ row }: TaggingArtifactsSectionProps) {
  if (!row?.tagging) return null;
  return (
    <section className="p-4" data-testid="tagging-artifacts">
      <h3 className="text-[13px] font-semibold leading-[1.4] mb-1">
        Tagging artifacts
      </h3>
      <p className="text-[12px] leading-[1.4] text-[var(--v7-muted)] mb-2">
        Status:{" "}
        <code className="font-mono">{row.tagging.icontroller_tag_status}</code>
      </p>
      {row.tagging.error && (
        <pre
          className="text-[11px] leading-[1.4] whitespace-pre-wrap p-2 rounded-[var(--v7-radius-sm)] mb-2 border border-[var(--v7-line)]"
          style={{
            background: "rgba(239, 68, 68, 0.10)",
            color: "var(--v7-text)",
          }}
        >
          {row.tagging.error}
        </pre>
      )}
      <div className="flex gap-3 flex-wrap">
        {row.tagging.screenshot_before_url && (
          <a
            href={row.tagging.screenshot_before_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] underline text-[var(--v7-text)]"
          >
            before screenshot
          </a>
        )}
        {row.tagging.screenshot_after_url && (
          <a
            href={row.tagging.screenshot_after_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] underline text-[var(--v7-text)]"
          >
            after screenshot
          </a>
        )}
      </div>
    </section>
  );
}
