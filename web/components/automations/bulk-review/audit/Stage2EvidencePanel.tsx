// Phase 82.3 Plan 05 — Stage 2 evidence panel.
// Phase 82.9 — expanded to INPUTS / REASONING / CANDIDATES sections mirroring
// Stage3EvidencePanel (commit ff12322). Server component (no client-boundary
// directive at the top; ScreenshotThumb owns the client boundary).
//
// Section order (top → bottom):
//   INPUTS      — per-method row content from payload.inputs (D-01). Legacy
//                 rows (payload.inputs == null, D-04) render the muted
//                 muted "limited evidence captured" line.
//   REASONING   — ONLY when inputs.kind === "llm_tiebreaker" AND reasoning
//                 has content.
//   EVIDENCE    — existing identifier_source + confidence chips (Pitfall 4
//                 back-compat — unchanged position + style).
//   CANDIDATES  — rich list (payload.candidates: id + name + contact_person
//                 + recent_invoices chips); falls back to slim
//                 payload.top_candidates list when rich is absent (legacy).
//   SCREENSHOTS — unchanged (existing iController before/after thumbs).
//   raw JSON    — unchanged (RawJsonToggle).

import type {
  Stage2AuditPayload,
  Stage2InputsView,
  CandidateView,
} from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";
import { ScreenshotThumb } from "./ScreenshotThumb";
import { RawJsonToggle } from "./RawJsonToggle";

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

// Phase 82.9 — verbatim copies from Stage3EvidencePanel for visual parity.
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

function InputRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <>
      <span style={inputLabelStyle}>{label}</span>
      <span style={inputValueStyle}>{value}</span>
    </>
  );
}

// Phase 82.9 — render chips for a string[] (e.g. matched_identifiers, recent_invoices).
function ChipList({ values }: { values: string[] }) {
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {values.map((v) => (
        <span key={v} style={metaChipStyle}>
          {v}
        </span>
      ))}
    </div>
  );
}

// Phase 82.9 — INPUTS section content; switch on payload.inputs.kind.
function renderInputs(
  inputs: Stage2InputsView | null | undefined,
): React.ReactElement {
  if (inputs == null) {
    return (
      <p
        style={{ ...mutedStyle, fontStyle: "italic", margin: 0 }}
        data-testid="stage2-inputs-legacy"
      >
        <em>Legacy run — limited evidence captured.</em>
      </p>
    );
  }
  switch (inputs.kind) {
    case "thread_inheritance":
      return (
        <div style={inputRowStyle} data-testid="stage2-inputs">
          <InputRow
            label="prior label"
            value={inputs.prior_email_label_id}
          />
          <InputRow label="conversation" value={inputs.conversation_id} />
        </div>
      );
    case "sender_match":
      return (
        <div style={inputRowStyle} data-testid="stage2-inputs">
          <InputRow label="sender" value={inputs.sender_email} />
        </div>
      );
    case "identifier_match":
      return (
        <div style={inputRowStyle} data-testid="stage2-inputs">
          <InputRow
            label="matched IDs"
            value={<ChipList values={inputs.matched_identifiers} />}
          />
        </div>
      );
    case "llm_tiebreaker":
      return (
        <div style={inputRowStyle} data-testid="stage2-inputs">
          {inputs.sender_email ? (
            <InputRow label="sender" value={inputs.sender_email} />
          ) : null}
          <InputRow
            label="matched IDs"
            value={<ChipList values={inputs.matched_identifiers} />}
          />
        </div>
      );
    case "unresolved":
      return (
        <div style={inputRowStyle} data-testid="stage2-inputs">
          {inputs.sender_email ? (
            <InputRow label="sender" value={inputs.sender_email} />
          ) : null}
          <InputRow
            label="matched IDs"
            value={
              inputs.matched_identifiers.length === 0 ? (
                <span style={{ ...mutedStyle, fontStyle: "italic" }}>
                  <em>none</em>
                </span>
              ) : (
                <ChipList values={inputs.matched_identifiers} />
              )
            }
          />
        </div>
      );
  }
}

// Phase 82.9 — CANDIDATES section: rich list preferred, slim fallback.
function renderCandidates(payload: Stage2AuditPayload): React.ReactElement | null {
  const rich: CandidateView[] | null =
    payload.candidates && payload.candidates.length > 0
      ? payload.candidates
      : null;
  // Slim fallback: legacy slice(0, 3) preserved for back-compat with the
  // pre-Phase-82.9 panel (existing "truncates top_candidates to first 3" test).
  const slim =
    !rich && payload.top_candidates && payload.top_candidates.length > 0
      ? payload.top_candidates.slice(0, 3)
      : null;
  if (!rich && !slim) return null;
  return (
    <div style={sectionWrapStyle}>
      <div style={sectionHeaderStyle}>CANDIDATES</div>
      <ol
        data-testid="stage2-candidates-list"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3, 12px)",
        }}
      >
        {rich
          ? rich.map((c) => (
              <li
                key={c.id}
                data-testid={`stage2-candidate-${c.id}`}
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
                    ...bodyStyle,
                  }}
                >
                  <code style={metaChipStyle}>{c.id}</code>
                  <span>{c.name}</span>
                </div>
                {c.contact_person ? (
                  <div style={{ ...bodyStyle, fontSize: 12 }}>
                    Contact: {c.contact_person}
                  </div>
                ) : (
                  <div
                    style={{
                      ...mutedStyle,
                      fontSize: 12,
                      fontStyle: "italic",
                    }}
                  >
                    <em>No contact recorded</em>
                  </div>
                )}
                {c.recent_invoices.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginTop: "4px",
                    }}
                  >
                    {c.recent_invoices.map((inv) => (
                      <span key={inv} style={metaChipStyle}>
                        {inv}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))
          : slim!.map((c) => (
              <li
                key={c.account_id}
                data-testid={`stage2-candidate-${c.account_id}`}
                style={bodyStyle}
              >
                <span style={monoStyle}>{c.account_id}</span> — {c.name} (
                {c.score.toFixed(2)})
              </li>
            ))}
      </ol>
    </div>
  );
}

export function Stage2EvidencePanel({ payload }: Props) {
  const { identifier_source, confidence, top_candidates, screenshot_paths } =
    payload;

  const isEmpty =
    identifier_source === null &&
    confidence === null &&
    top_candidates.length === 0 &&
    screenshot_paths.before === null &&
    screenshot_paths.after === null &&
    (payload.inputs == null) &&
    (!payload.candidates || payload.candidates.length === 0);

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
  const bothScreenshotsMissing =
    screenshot_paths.before === null && screenshot_paths.after === null;
  const showReasoning =
    payload.inputs?.kind === "llm_tiebreaker" &&
    !!payload.reasoning &&
    payload.reasoning.trim().length > 0;

  return (
    <div style={{ padding: "var(--space-3, 12px)" }}>
      {/* Phase 82.9 — INPUTS */}
      <div style={sectionWrapStyle}>
        <div style={sectionHeaderStyle}>INPUTS</div>
        {renderInputs(payload.inputs)}
      </div>

      {/* Phase 82.9 — REASONING (conditional: llm_tiebreaker + non-empty reasoning) */}
      {showReasoning ? (
        <div style={sectionWrapStyle}>
          <div style={sectionHeaderStyle}>REASONING</div>
          <div style={bodyStyle} data-testid="stage2-reasoning">
            {payload.reasoning}
          </div>
        </div>
      ) : null}

      {/* EVIDENCE (existing — Pitfall 4 back-compat: unchanged position + style) */}
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
        ) : null}
      </div>

      {/* Phase 82.9 — CANDIDATES (rich preferred, slim fallback for legacy) */}
      {isUnresolved ? null : renderCandidates(payload)}

      {/* SCREENSHOTS (existing — unchanged) */}
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

      {/* Raw JSON slot — unchanged */}
      <div data-testid="stage2-raw-json-slot">
        <RawJsonToggle raw={payload.raw} />
      </div>
    </div>
  );
}
