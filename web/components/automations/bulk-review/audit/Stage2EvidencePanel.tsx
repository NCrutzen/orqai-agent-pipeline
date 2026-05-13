// Phase 82.3 Plan 05 — Stage 2 evidence panel.
// Pure component (no "use client" — ScreenshotThumb owns the client boundary).
// Consumes Stage2AuditPayload (Plan 02 types) derived from agent_runs.context
// (resolver layer) + automation_runs.result.screenshot_paths.
//
// UI-SPEC §Component Inventory & §Copywriting Contract:
//   - identifier source chip (chip-pink), confidence chip (lime/amber/muted)
//   - top-3 candidates as mono list with score (slice(0, 3))
//   - iController before/after via ScreenshotThumb (side-by-side)
//   - unresolved → destructive chip + locked copy, candidate table SKIPPED
//   - both screenshot paths null → locked "No iController capture..." copy
//   - all-null payload → only top-level muted empty-state line
//
// `raw` slot is a placeholder; Plan 09 swaps the internals with RawJsonToggle.

import type { Stage2AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";
import { ScreenshotThumb } from "./ScreenshotThumb";

interface Props {
  payload: Stage2AuditPayload;
}

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-muted, #8a93a3)",
  marginBottom: "var(--space-2, 8px)",
};

const bodyStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "var(--text, #e6ebf2)",
};

const mutedStyle: React.CSSProperties = {
  ...bodyStyle,
  color: "var(--text-muted, #8a93a3)",
};

const sectionWrapStyle: React.CSSProperties = {
  marginBottom: "var(--space-5, 24px)",
};

const chipBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 4,
  fontFamily: "var(--font-geist-mono, monospace)",
  fontSize: 12,
  lineHeight: 1.4,
  border: "1px solid var(--border, #1f2a3a)",
};

const identifierChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "var(--chip-pink, #3a142a)",
  color: "var(--chip-pink-fg, #f9a8d4)",
};

const destructiveChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "rgba(239, 68, 68, 0.12)",
  color: "#ef4444",
  borderColor: "#ef4444",
};

const mutedChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "transparent",
  color: "var(--text-muted, #8a93a3)",
};

function confidenceChipStyle(
  confidence: "high" | "medium" | "low" | null,
): React.CSSProperties {
  if (confidence === "high") {
    return {
      ...chipBaseStyle,
      background: "var(--chip-lime, #1f3a14)",
      color: "var(--chip-lime-fg, #bef264)",
    };
  }
  if (confidence === "medium") {
    return {
      ...chipBaseStyle,
      background: "var(--chip-amber, #3a2a0e)",
      color: "var(--chip-amber-fg, #fbbf24)",
    };
  }
  return mutedChipStyle;
}

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono, monospace)",
  fontSize: 12,
};

export function Stage2EvidencePanel({ payload }: Props) {
  const {
    identifier_source,
    confidence,
    top_candidates,
    screenshot_paths,
  } = payload;

  const isEmpty =
    identifier_source === null &&
    confidence === null &&
    top_candidates.length === 0 &&
    screenshot_paths.before === null &&
    screenshot_paths.after === null;

  if (isEmpty) {
    return (
      <div
        style={{
          ...mutedStyle,
          fontStyle: "italic",
          padding: "var(--space-3, 12px)",
        }}
      >
        No evidence captured for this stage.
      </div>
    );
  }

  const isUnresolved = identifier_source === "unresolved";
  const visibleCandidates = top_candidates.slice(0, 3);
  const bothScreenshotsMissing =
    screenshot_paths.before === null && screenshot_paths.after === null;

  return (
    <div style={{ padding: "var(--space-3, 12px)" }}>
      {/* EVIDENCE */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>EVIDENCE</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2, 8px)",
            marginBottom: "var(--space-3, 12px)",
          }}
        >
          <span
            data-testid="stage2-identifier-source-chip"
            style={
              identifier_source === null
                ? mutedChipStyle
                : isUnresolved
                  ? destructiveChipStyle
                  : identifierChipStyle
            }
          >
            {identifier_source ?? "—"}
          </span>
          <span
            data-testid="stage2-confidence-chip"
            style={confidenceChipStyle(confidence)}
          >
            {confidence ?? "—"}
          </span>
        </div>

        {isUnresolved ? (
          <div style={mutedStyle}>
            Customer could not be resolved. No candidates returned.
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div style={mutedStyle}>No candidates returned.</div>
        ) : (
          <ul
            data-testid="stage2-candidate-list"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1, 4px)",
            }}
          >
            {visibleCandidates.map((c) => (
              <li key={c.account_id} style={bodyStyle}>
                <span style={monoStyle}>{c.account_id}</span> — {c.name} (
                {c.score.toFixed(2)})
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* SCREENSHOTS */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>SCREENSHOTS</div>
        {bothScreenshotsMissing ? (
          <div style={mutedStyle}>No iController capture for this run.</div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: "var(--space-3, 12px)",
              alignItems: "flex-start",
            }}
          >
            {screenshot_paths.before ? (
              <ScreenshotThumb
                path={screenshot_paths.before}
                label="Before"
              />
            ) : (
              <span style={mutedStyle}>—</span>
            )}
            {screenshot_paths.after ? (
              <ScreenshotThumb path={screenshot_paths.after} label="After" />
            ) : (
              <span style={mutedStyle}>—</span>
            )}
          </div>
        )}
      </div>

      {/* Raw JSON slot — Plan 09 fills this */}
      <div data-testid="stage2-raw-json-slot" />
    </div>
  );
}
