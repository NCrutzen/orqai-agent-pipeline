"use client";

// Phase 2 Plan 02-03 — Stage 1 Read column.
//
// Renders Stage 1's Pass 1 (pattern match) + Pass 2 (LLM rescue) evidence per
// canonical-patterns.md §5 (section pattern — NO bordered evidence cards;
// UI-SPEC §1 lock). Operator-language locks (operator-language.md):
//   • "PATTERN MATCH" — operator-facing label for Pass 1.
//   • "AI RESCUE"     — operator-facing label for Pass 2.
//   • Confidence is the literal string label `high|medium|low` — OQ-6.
//   • Cost / token / model fields are NEVER rendered — OQ-5.
//
// Hard-separation invariant (RFC stage-1 noise filter): Stage 1 vocabulary lives in
// swarm_noise_categories ∪ {"unknown"} ONLY — this component never reads
// swarm_intents. The hydrator already validated the keys and projected
// display labels from swarm_noise_categories.display_label; this renderer
// simply prefers the label over the raw key.
//
// Sketch 003 lock — the legacy eval-type radio is removed from the operator
// UI; this file deliberately does not import that component.
//
// Reasoning sanitisation: rendered inside `<pre style="white-space: pre-wrap">`,
// plain text only — no raw-HTML injection, no Markdown parser. Phase 2
// CONTEXT.md "Claude's Discretion" final bullet.

import { useState, type ReactElement } from "react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";

const REASONING_TRUNCATE_AT = 280;

interface Stage1ReadProps {
  row: BulkReviewRow;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--v7-fg-muted)",
        fontWeight: 600,
        fontFamily: "var(--v7-font-mono)",
      }}
    >
      {children}
    </div>
  );
}

export function Stage1Read({ row }: Stage1ReadProps) {
  const slot = row.stage_1;
  const [expanded, setExpanded] = useState(false);

  if (slot === null) {
    return (
      <p
        data-testid="stage-1-read-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Stage 1 has not yet run on this row.
      </p>
    );
  }

  const decidedLabel =
    slot.category_display_label ?? slot.category_key ?? "—";

  const predictorLabel =
    slot.predictor === "regex"
      ? "Pattern match"
      : slot.predictor === "llm_2nd_pass"
        ? "AI rescue"
        : "—";

  // Pattern-match pill — either matched rule id (match tokens) or
  // "No rule matched" (idle tokens). Copy locked per plan acceptance gate.
  const patternPill =
    slot.matched_rule_id !== null ? (
      <span
        data-testid="stage-1-read-pattern-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 24,
          padding: "0 10px",
          background: "var(--v7-state-match-bg)",
          color: "var(--v7-state-match-fg)",
          borderRadius: "var(--v7-radius-pill)",
          fontSize: 12,
          fontWeight: 500,
          alignSelf: "flex-start",
          fontFamily: "var(--v7-font-mono)",
        }}
      >
        Rule: {slot.matched_rule_id}
      </span>
    ) : (
      <span
        data-testid="stage-1-read-pattern-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 24,
          padding: "0 10px",
          background: "var(--v7-state-idle-bg)",
          color: "var(--v7-state-idle-fg)",
          borderRadius: "var(--v7-radius-pill)",
          fontSize: 12,
          fontWeight: 500,
          alignSelf: "flex-start",
          fontFamily: "var(--v7-font-mono)",
        }}
      >
        No rule matched
      </span>
    );

  // ---- AI RESCUE branch ----
  let aiRescueBody: ReactElement;
  if (!slot.llm_invoked) {
    aiRescueBody = (
      <p
        data-testid="stage-1-read-ai-rescue-not-invoked"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Not invoked — pattern match was decisive.
      </p>
    );
  } else if (slot.llm_error !== null) {
    aiRescueBody = (
      <span
        data-testid="stage-1-read-llm-error-pill"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          background: "var(--v7-state-blocked-bg)",
          color: "var(--v7-state-blocked-fg)",
          borderRadius: "var(--v7-radius-pill)",
          fontSize: 12,
          fontWeight: 500,
          alignSelf: "flex-start",
          fontFamily: "var(--v7-font-mono)",
          maxWidth: "100%",
          whiteSpace: "normal",
        }}
      >
        Error: {slot.llm_error}
      </span>
    );
  } else {
    const llmDecidedLabel =
      slot.llm_category_display_label ?? slot.llm_category_key ?? "—";
    const reasoning = slot.llm_reasoning;
    const needsTruncate =
      reasoning !== null && reasoning.length > REASONING_TRUNCATE_AT;
    const reasoningText =
      reasoning === null
        ? null
        : !needsTruncate || expanded
          ? reasoning
          : `${reasoning.slice(0, REASONING_TRUNCATE_AT)}…`;

    aiRescueBody = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          <span
            data-testid="stage-1-read-llm-verdict-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 10px",
              background: "var(--v7-state-llm-rescue-bg)",
              color: "var(--v7-state-llm-rescue-fg)",
              borderRadius: "var(--v7-radius-pill)",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--v7-font-mono)",
            }}
          >
            LLM verdict: {llmDecidedLabel}
          </span>
          {slot.llm_confidence !== null ? (
            <span
              data-testid="stage-1-read-llm-confidence-pill"
              data-confidence={slot.llm_confidence}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 24,
                padding: "0 10px",
                background: "var(--v7-state-match-bg)",
                color: "var(--v7-state-match-fg)",
                borderRadius: "var(--v7-radius-pill)",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "var(--v7-font-mono)",
              }}
            >
              Confidence: {slot.llm_confidence}
            </span>
          ) : null}
        </div>
        {reasoningText !== null ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <pre
              data-testid="stage-1-read-llm-reasoning"
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "var(--v7-font-sans)",
                fontSize: 14,
                lineHeight: 1.65,
                margin: 0,
                color: "var(--v7-text)",
              }}
            >
              {reasoningText}
            </pre>
            {needsTruncate ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--v7-brand-primary)",
                  fontSize: 12,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {expanded ? "Collapse" : "Expand"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="stage-1-read"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Section 1: PATTERN MATCH (Pass 1 evidence) */}
      <section
        data-testid="stage-1-read-pattern-match"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <SectionLabel>PATTERN MATCH</SectionLabel>
        {patternPill}
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "var(--space-1) var(--space-3)",
            fontSize: 12,
            margin: 0,
            color: "var(--v7-text)",
          }}
        >
          <dt style={{ color: "var(--v7-fg-muted)" }}>Decided</dt>
          <dd
            data-testid="stage-1-read-decided-value"
            style={{ margin: 0 }}
          >
            {decidedLabel}
          </dd>
          <dt style={{ color: "var(--v7-fg-muted)" }}>Predictor</dt>
          <dd style={{ margin: 0 }}>{predictorLabel}</dd>
          <dt style={{ color: "var(--v7-fg-muted)" }}>Regex verdict</dt>
          <dd
            style={{ margin: 0, fontFamily: "var(--v7-font-mono)" }}
          >
            {slot.regex_verdict ?? "—"}
          </dd>
        </dl>
      </section>

      {/* Section 2: AI RESCUE (Pass 2 evidence)
       *
       * Phase 04.1 — Plan 06 (P4.1-D-04). When predictor === "llm_2nd_pass"
       * the section renders as the purple rescue-card variant: purple
       * left-border + tinted background via --v7-state-llm-rescue-* tokens,
       * and a header line "— · — tok · {llm_model_key ?? '—'}". Cost +
       * tokens are intentional em-dashes (R3 deferred / tokens not threaded).
       * Pure-regex rows (predictor !== "llm_2nd_pass") render with
       * data-variant="regex-only" and no header — existing chrome
       * preserved.
       */}
      {(() => {
        const isPass2 = slot.predictor === "llm_2nd_pass";
        return (
          <section
            data-testid="stage-1-llm-rescue-card"
            data-variant={isPass2 ? "pass-2" : "regex-only"}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              borderLeft: isPass2
                ? "3px solid var(--v7-state-llm-rescue-fg)"
                : "3px solid transparent",
              background: isPass2
                ? "var(--v7-state-llm-rescue-bg)"
                : "transparent",
              padding: "var(--space-3)",
              borderRadius: "var(--v7-radius-sm)",
            }}
          >
            <div
              data-testid="stage-1-read-ai-rescue"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
              }}
            >
              <SectionLabel>AI RESCUE</SectionLabel>
              {isPass2 ? (
                <header
                  data-testid="stage-1-llm-rescue-header"
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--v7-font-mono)",
                    color: "var(--v7-state-llm-rescue-fg)",
                    letterSpacing: "0.04em",
                  }}
                >
                  — · — tok · {slot.llm_model_key ?? "—"}
                </header>
              ) : null}
              {aiRescueBody}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
