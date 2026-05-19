// Phase 82.3 Plan 06 — Stage 3 evidence panel.
// HARD-SEPARATION LOCK (docs/agentic-pipeline/README.md):
//   - intent_key comes from swarm_intents ONLY.
//   - This file MUST NOT import or reference the Stage 1 noise registry.
//   - Renderer for Stage 1 noise evidence lives in Stage1EvidencePanel.tsx.
//
// Pure, server-component-safe. Consumes Stage3AuditPayload (Plan 02 types)
// derived from agent_runs.tool_outputs of the debtor-intent-agent (Phase 65).
//
// Renders REASONING + EVIDENCE sections per UI-SPEC §Component Inventory.
// Empty ranked_intents renders the locked muted empty-state copy.
// `raw` slot is a placeholder; Plan 09 swaps the internals with RawJsonToggle.

import type { Stage3AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";
import { RawJsonToggle } from "./RawJsonToggle";

interface Props {
  payload: Stage3AuditPayload;
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

const mutedChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "transparent",
  color: "var(--text-muted, #8a93a3)",
};

const sectionWrapStyle: React.CSSProperties = {
  marginBottom: "var(--space-5, 24px)",
};

const intentKeyStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono, monospace)",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text, #e6ebf2)",
};

function confidenceChipStyle(confidence: number): React.CSSProperties {
  if (confidence >= 0.75) {
    return {
      ...chipBaseStyle,
      background: "var(--chip-lime, #1f3a14)",
      color: "var(--chip-lime-fg, #bef264)",
    };
  }
  if (confidence >= 0.5) {
    return {
      ...chipBaseStyle,
      background: "var(--chip-amber, #3a2a0e)",
      color: "var(--chip-amber-fg, #fbbf24)",
    };
  }
  return mutedChipStyle;
}

function formatConfidence(c: number): string {
  return `${(c * 100).toFixed(0)}%`;
}

// 2026-05-19 — expanded evidence panel.
// Sections from top to bottom:
//   INPUTS      — what the classifier was handed (sender, mailbox, entity,
//                 subject excerpt, received_at). Present on rows written after
//                 the 2026-05-19 coordinator writer change; absent (rendered
//                 as a muted "legacy run" line) on older rows.
//   METADATA    — language/urgency/intent_version chips (email-level outputs)
//   REASONING   — top-1 reasoning for the selected intent
//   EVIDENCE    — ranked intent rows; each runner-up now shows its own
//                 reasoning + sub_type + document_reference below the chip
//   raw JSON    — unchanged
const metaChipStyle: React.CSSProperties = {
  ...chipBaseStyle,
  background: "var(--chip-muted-bg, transparent)",
  color: "var(--text-muted, #8a93a3)",
};

const inputRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(80px, max-content) 1fr",
  columnGap: "var(--space-3, 12px)",
  rowGap: "var(--space-1, 4px)",
  fontSize: 12,
  lineHeight: 1.5,
};

const inputLabelStyle: React.CSSProperties = {
  color: "var(--text-muted, #8a93a3)",
  fontFamily: "var(--font-geist-mono, monospace)",
};

const inputValueStyle: React.CSSProperties = {
  color: "var(--text, #e6ebf2)",
  fontFamily: "var(--font-geist-mono, monospace)",
  wordBreak: "break-word",
};

function InputRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <span style={inputLabelStyle}>{label}</span>
      <span style={inputValueStyle}>{value}</span>
    </>
  );
}

export function Stage3EvidencePanel({ payload }: Props) {
  const {
    ranked_intents,
    coordinator_reasoning,
    selected_intent_key,
    language,
    urgency,
    intent_version,
    inputs,
  } = payload;

  const isEmpty =
    ranked_intents.length === 0 &&
    coordinator_reasoning === null &&
    selected_intent_key === null;

  if (isEmpty) {
    return (
      <div
        style={{
          ...mutedStyle,
          padding: "var(--space-3, 12px)",
        }}
      >
        No ranked intents returned by coordinator.
      </div>
    );
  }

  const hasInputs =
    inputs &&
    (inputs.sender_email ||
      inputs.sender_domain ||
      inputs.mailbox ||
      inputs.entity ||
      inputs.subject_excerpt ||
      inputs.received_at);
  const hasMetadata = language || urgency || intent_version;

  return (
    <div style={{ padding: "var(--space-3, 12px)" }}>
      {/* INPUTS */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>INPUTS</div>
        {hasInputs ? (
          <div style={inputRowStyle} data-testid="stage3-inputs">
            <InputRow label="from" value={inputs?.sender_email ?? null} />
            <InputRow label="domain" value={inputs?.sender_domain ?? null} />
            <InputRow label="mailbox" value={inputs?.mailbox ?? null} />
            <InputRow label="entity" value={inputs?.entity ?? null} />
            <InputRow label="subject" value={inputs?.subject_excerpt ?? null} />
            <InputRow label="received" value={inputs?.received_at ?? null} />
          </div>
        ) : (
          <div style={{ ...mutedStyle, fontStyle: "italic" }}>
            Legacy run — classifier inputs were not captured.
          </div>
        )}
      </div>

      {/* METADATA */}
      {hasMetadata ? (
        <div style={sectionWrapStyle}>
          <div style={sectionHeaderStyle}>METADATA</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2, 8px)",
            }}
            data-testid="stage3-metadata"
          >
            {language ? <span style={metaChipStyle}>language: {language}</span> : null}
            {urgency ? <span style={metaChipStyle}>urgency: {urgency}</span> : null}
            {intent_version ? (
              <span style={metaChipStyle}>model: {intent_version}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* REASONING */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>REASONING</div>
        {coordinator_reasoning ? (
          <div style={bodyStyle}>{coordinator_reasoning}</div>
        ) : (
          <div style={{ ...mutedStyle, fontStyle: "italic" }}>
            No coordinator reasoning recorded.
          </div>
        )}
      </div>

      {/* EVIDENCE */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>EVIDENCE</div>
        {ranked_intents.length === 0 ? (
          <div style={mutedStyle}>
            No ranked intents returned by coordinator.
          </div>
        ) : (
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3, 12px)",
            }}
          >
            {ranked_intents.map((row) => {
              const isSelected = row.intent_key === selected_intent_key;
              const testid = isSelected
                ? "stage3-intent-row-selected"
                : `stage3-intent-row-${row.intent_key}`;
              const meta: string[] = [];
              if (row.sub_type) meta.push(`sub_type: ${row.sub_type}`);
              if (row.document_reference) meta.push(`doc_ref: ${row.document_reference}`);
              return (
                <li
                  key={row.intent_key}
                  data-testid={testid}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-1, 4px)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2, 8px)",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {isSelected ? (
                      <span
                        aria-hidden="true"
                        style={{ color: "var(--accent, #ff6a34)" }}
                      >
                        ▶
                      </span>
                    ) : null}
                    <span style={intentKeyStyle}>{row.intent_key}</span>
                    <span style={confidenceChipStyle(row.confidence)}>
                      {formatConfidence(row.confidence)}
                    </span>
                  </div>
                  {row.reasoning ? (
                    <div
                      style={{
                        ...bodyStyle,
                        fontSize: 12,
                        color: isSelected
                          ? "var(--text, #e6ebf2)"
                          : "var(--text-muted, #8a93a3)",
                        paddingLeft: isSelected ? "calc(var(--space-3, 12px) + 4px)" : 0,
                      }}
                    >
                      {row.reasoning}
                    </div>
                  ) : null}
                  {meta.length > 0 ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--space-2, 8px)",
                        paddingLeft: isSelected ? "calc(var(--space-3, 12px) + 4px)" : 0,
                      }}
                    >
                      {meta.map((m) => (
                        <span key={m} style={metaChipStyle}>{m}</span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Raw JSON slot — Plan 09 */}
      <div data-testid="stage3-raw-json-slot">
        <RawJsonToggle raw={payload.raw} />
      </div>
    </div>
  );
}
