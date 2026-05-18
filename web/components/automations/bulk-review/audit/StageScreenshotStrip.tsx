// Phase 82.8 D-03 — reusable before/after screenshot strip.
// Receives storage paths; signs URLs on-demand via the existing ScreenshotThumb
// pattern (no new endpoint, no URL TTL concerns). Mounted by Plan 07 inside the
// Stage 1 detail-pane audit-expander once 82.7.1 ships.

import { ScreenshotThumb } from "./ScreenshotThumb";

interface Props {
  beforePath: string | null;
  afterPath: string | null;
  emptyCopy?: string;
}

export function StageScreenshotStrip({
  beforePath,
  afterPath,
  emptyCopy = "No screenshots available",
}: Props) {
  if (!beforePath && !afterPath) {
    return (
      <div
        style={{
          color: "var(--muted-foreground, #888)",
          fontSize: "0.875rem",
          padding: "var(--space-2, 8px) 0",
        }}
      >
        {emptyCopy}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3, 12px)",
        alignItems: "flex-start",
      }}
    >
      {beforePath ? (
        <ScreenshotThumb path={beforePath} label="Before" />
      ) : (
        <span style={{ color: "var(--muted-foreground, #888)" }}>—</span>
      )}
      {afterPath ? (
        <ScreenshotThumb path={afterPath} label="After" />
      ) : (
        <span style={{ color: "var(--muted-foreground, #888)" }}>—</span>
      )}
    </div>
  );
}
