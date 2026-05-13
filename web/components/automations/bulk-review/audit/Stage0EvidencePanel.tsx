// Phase 82.3 Plan 03 — Stage 0 evidence renderer.
// Pure, server-component-safe. Consumes Stage0AuditPayload (Plan 02 types)
// derived from pipeline_events.decision_details where stage = 0.
//
// Renders REASONING + EVIDENCE sections per UI-SPEC §Component Inventory.
// Empty payload renders only the locked muted-italic empty-state copy.
// `raw` slot is a placeholder; Plan 09 swaps the internals with RawJsonToggle.

import type { Stage0AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";

interface Props {
  payload: Stage0AuditPayload;
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

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono, monospace)",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.5,
};

const chipBaseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 4,
  fontFamily: "var(--font-geist-mono, monospace)",
  fontSize: 12,
  lineHeight: 1.4,
  background: "var(--chip-teal, #0e3b3b)",
  color: "var(--chip-teal-fg, #5eead4)",
  border: "1px solid var(--border, #1f2a3a)",
};

const sectionWrapStyle: React.CSSProperties = {
  marginBottom: "var(--space-5, 24px)",
};

const evidenceLineStyle: React.CSSProperties = {
  marginTop: "var(--space-2, 8px)",
};

export function Stage0EvidencePanel({ payload }: Props) {
  const {
    regex_patterns_fired,
    llm_injection_verdict,
    llm_reasoning,
    budget_headroom_cents,
  } = payload;

  const isEmpty =
    regex_patterns_fired.length === 0 &&
    llm_injection_verdict === null &&
    llm_reasoning === null &&
    budget_headroom_cents === null;

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

  // Verdict chip
  let verdictNode: React.ReactNode;
  if (llm_injection_verdict === "flagged") {
    verdictNode = (
      <span
        data-testid="stage0-verdict-flagged"
        style={{
          ...chipBaseStyle,
          background: "rgba(239, 68, 68, 0.12)",
          color: "var(--v7-danger, #ef4444)",
          border: "1px solid var(--v7-danger, #ef4444)",
        }}
      >
        Injection: flagged
      </span>
    );
  } else if (llm_injection_verdict === "clean") {
    verdictNode = (
      <span
        data-testid="stage0-verdict-clean"
        style={{
          ...chipBaseStyle,
          background: "transparent",
          color: "var(--text-muted, #8a93a3)",
        }}
      >
        Injection: clean
      </span>
    );
  } else if (llm_injection_verdict === "unknown") {
    verdictNode = (
      <span
        data-testid="stage0-verdict-unknown"
        style={{
          ...chipBaseStyle,
          background: "transparent",
          color: "var(--text-muted, #8a93a3)",
        }}
      >
        Injection: unknown
      </span>
    );
  } else {
    verdictNode = <span style={mutedStyle}>Injection check skipped</span>;
  }

  const headroomText =
    budget_headroom_cents === null
      ? "Budget headroom: —"
      : `Budget headroom: $${(budget_headroom_cents / 100).toFixed(2)}`;

  return (
    <div style={{ padding: "var(--space-3, 12px)" }}>
      {/* REASONING */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>REASONING</div>
        {llm_reasoning ? (
          <div style={bodyStyle}>{llm_reasoning}</div>
        ) : (
          <div style={{ ...mutedStyle, fontStyle: "italic" }}>
            No evidence captured for this stage.
          </div>
        )}
      </div>

      {/* EVIDENCE */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>EVIDENCE</div>

        {regex_patterns_fired.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2, 8px)",
            }}
          >
            {regex_patterns_fired.map((pattern, i) => (
              <span
                key={`${pattern}-${i}`}
                style={chipBaseStyle}
                data-testid="stage0-regex-chip"
              >
                {pattern}
              </span>
            ))}
          </div>
        )}

        <div style={evidenceLineStyle}>{verdictNode}</div>

        <div
          style={{
            ...monoStyle,
            ...evidenceLineStyle,
            color:
              budget_headroom_cents === null
                ? "var(--text-muted, #8a93a3)"
                : "var(--text, #e6ebf2)",
          }}
        >
          {headroomText}
        </div>
      </div>

      {/* Raw JSON slot — Plan 09 fills this */}
      <div data-testid="stage0-raw-json-slot" />
    </div>
  );
}
