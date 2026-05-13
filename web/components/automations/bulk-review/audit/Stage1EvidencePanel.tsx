// Phase 82.3 Plan 04 — Stage 1 evidence panel.
// HARD-SEPARATION LOCK (docs/agentic-pipeline/README.md):
//   - rule_key comes from swarm_noise_categories OR the literal "unknown".
//   - This file MUST NOT import or reference the Stage 3 registry.
//   - Renderer for Stage 3 evidence lives in Stage3EvidencePanel.tsx.
//
// Pure, server-component-safe. Consumes Stage1AuditPayload (Plan 02 types)
// derived from pipeline_events.decision_details where stage = 1, optionally
// enriched by agent_runs.tool_outputs when LLM Pass-2 fired.
//
// Renders REASONING + EVIDENCE sections per UI-SPEC §Component Inventory.
// Empty payload renders only the locked muted-italic empty-state copy.
// Degraded mode (Pass-1 regex, no LLM): locked italic copy in REASONING.
// `raw` slot is a placeholder; Plan 09 swaps the internals with RawJsonToggle.

import type { Stage1AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";
import { RawJsonToggle } from "./RawJsonToggle";

interface Props {
  payload: Stage1AuditPayload;
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

const ruleChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "var(--chip-teal, #0e3b3b)",
  color: "var(--chip-teal-fg, #5eead4)",
};

const predictorChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "var(--chip-blue, #102a4c)",
  color: "var(--chip-blue-fg, #93c5fd)",
};

const mutedChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "transparent",
  color: "var(--text-muted, #8a93a3)",
};

const sectionWrapStyle: React.CSSProperties = {
  marginBottom: "var(--space-5, 24px)",
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

export function Stage1EvidencePanel({ payload }: Props) {
  const { rule_key, predictor_source, confidence, reasoning } = payload;

  const isEmpty =
    rule_key === null &&
    predictor_source === null &&
    confidence === null &&
    reasoning === null;

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

  const isDegradedRegex = reasoning === null && predictor_source === "regex";

  return (
    <div style={{ padding: "var(--space-3, 12px)" }}>
      {/* REASONING */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>REASONING</div>
        {reasoning ? (
          <div style={bodyStyle}>{reasoning}</div>
        ) : isDegradedRegex ? (
          <div style={{ ...mutedStyle, fontStyle: "italic" }}>
            Regex Pass-1 matched — no LLM reasoning produced.
          </div>
        ) : (
          <div style={{ ...mutedStyle, fontStyle: "italic" }}>
            No evidence captured for this stage.
          </div>
        )}
      </div>

      {/* EVIDENCE */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>EVIDENCE</div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2, 8px)",
          }}
        >
          <span
            data-testid="stage1-rule-chip"
            style={rule_key === null ? mutedChipStyle : ruleChipStyle}
          >
            {rule_key ?? "(no rule)"}
          </span>
          <span
            data-testid="stage1-predictor-chip"
            style={predictor_source === null ? mutedChipStyle : predictorChipStyle}
          >
            {predictor_source ?? "—"}
          </span>
          <span
            data-testid="stage1-confidence-chip"
            style={confidenceChipStyle(confidence)}
          >
            {confidence ?? "—"}
          </span>
        </div>
      </div>

      {/* Raw JSON slot — Plan 09 */}
      <div data-testid="stage1-raw-json-slot">
        <RawJsonToggle raw={payload.raw} />
      </div>
    </div>
  );
}
