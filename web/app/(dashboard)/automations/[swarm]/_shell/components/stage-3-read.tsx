"use client";

// Phase 2 Plan 02-05 — Stage 3 Read column.
//
// Renders the FULL ranked-intent list (not just the dispatch winner) per
// CON-stage-3-ranked-intents + sketch 005 (Read-only portion). Position 1
// gets the lime/green "DISPATCH WINNER" highlight; positions 2..N render
// dim. Each item shows a horizontal confidence bar whose width is
// proportional to the coerced confidence value (RESEARCH §6: high → 0.9,
// medium → 0.7, low → 0.4; coercion happens in the hydrator).
//
// Hard-separation invariant (RFC stage-3-coordinator.md): this component
// only reads row.stage_3.ranked_intents — which the hydrator has already
// filtered to swarm_intents.intent_key values. It never reads or renders a
// swarm_noise_categories key.
//
// Read-only — no rank-mutation affordances. The rank-mutation editor lands
// in Phase 3 per sketch 005 lock. The acceptance gate enforces this via
// grep against several forbidden glyphs and keywords.
//
// Operator-language locks (operator-language.md):
//   • "RANKED INTENT" — uppercase section label.
//   • "DISPATCH WINNER" — Position 1 pill.

import type { ReactNode } from "react";
import type { BulkReviewRow, RankedIntent } from "@/lib/bulk-review/types";

interface Stage3ReadProps {
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

function RankItem({
  position,
  entry,
  isWinner,
}: {
  position: number;
  entry: RankedIntent;
  isWinner: boolean;
}): ReactNode {
  const label = entry.display_label ?? entry.intent_key ?? "—";
  // Width — confidence is already coerced numeric in the hydrator
  // (RESEARCH §6); we clamp to [0,1] defensively.
  const conf = entry.confidence;
  const widthPct =
    conf === null ? 0 : Math.max(0, Math.min(100, Math.round(conf * 100)));
  const widthStyle = `${widthPct}%`;
  const confLabel = conf === null ? "—" : `${widthPct}%`;

  const itemStyle: React.CSSProperties = isWinner
    ? {
        background: "var(--v7-state-match-bg)",
        color: "var(--v7-state-match-fg)",
      }
    : {
        background: "var(--v7-bg-row)",
        color: "var(--v7-fg-muted)",
      };

  return (
    <div
      data-testid={`stage-3-read-rank-${position}`}
      data-winner={isWinner ? "true" : "false"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3)",
        borderRadius: "var(--v7-radius-sm)",
        ...itemStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: "var(--v7-radius-pill)",
            background: isWinner
              ? "var(--v7-state-match-fg)"
              : "var(--v7-state-idle-bg)",
            color: isWinner ? "var(--v7-bg)" : "var(--v7-fg-muted)",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--v7-font-mono)",
            flexShrink: 0,
          }}
        >
          {position}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: isWinner ? 500 : 400,
            color: isWinner ? "var(--v7-state-match-fg)" : "var(--v7-fg-muted)",
          }}
        >
          {label}
        </span>
        {isWinner ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 22,
              padding: "0 10px",
              background: "var(--v7-state-match-fg)",
              color: "var(--v7-bg)",
              borderRadius: "var(--v7-radius-pill)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              fontFamily: "var(--v7-font-mono)",
            }}
          >
            DISPATCH WINNER
          </span>
        ) : null}
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--v7-font-mono)",
            color: isWinner ? "var(--v7-state-match-fg)" : "var(--v7-fg-muted)",
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {confLabel}
        </span>
      </div>
      <div
        aria-hidden
        style={{
          position: "relative",
          width: "100%",
          height: 4,
          background: "var(--v7-bar-track)",
          borderRadius: "var(--v7-radius-pill)",
          overflow: "hidden",
        }}
      >
        <div
          data-testid={`stage-3-read-bar-${position}`}
          style={{
            width: widthStyle,
            height: "100%",
            background: isWinner
              ? "var(--v7-state-match-fg)"
              : "var(--v7-fg-muted)",
            transition: "width 150ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

export function Stage3Read({ row }: Stage3ReadProps) {
  const slot = row.stage_3;

  if (slot === null || slot.ranked_intents.length === 0) {
    return (
      <p
        data-testid="stage-3-read-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-fg-muted)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Stage 3 has not yet run on this row.
      </p>
    );
  }

  return (
    <div
      data-testid="stage-3-read"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <SectionLabel>RANKED INTENT</SectionLabel>
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {slot.ranked_intents.map((entry, i) => (
          <li key={`${entry.intent_key}-${i}`}>
            <RankItem
              position={i + 1}
              entry={entry}
              isWinner={i === 0}
            />
          </li>
        ))}
      </ol>

      <Stage3ReadEvidence ranked={slot.ranked_intents} />
    </div>
  );
}

// Plan 03-14 (UAT r3-2): the classifier's WHY. The winner's reasoning + the
// runner-up/gap-to-#2 (only when ≥2 intents). Sourced ONLY from
// ranked_intents[].reasoning (Plan 03-12 hydrate) — NEVER decision_details,
// NEVER fabricated. No model_key line (not in corpus). Single-intent rows
// show the reasoning but NO runner-up/gap.
function Stage3ReadEvidence({
  ranked,
}: {
  ranked: RankedIntent[];
}): ReactNode {
  const winner = ranked[0];
  const runnerUp = ranked.length >= 2 ? ranked[1] : null;
  const reasoning = winner?.reasoning ?? null;
  const confLabel = winner?.confidence_label ?? null;

  const gapPts =
    runnerUp &&
    winner.confidence !== null &&
    runnerUp.confidence !== null
      ? Math.max(0, Math.round((winner.confidence - runnerUp.confidence) * 100))
      : null;

  // Nothing to add beyond the bar (single intent, no reasoning, no label).
  if (!reasoning && !runnerUp && !confLabel) return null;

  return (
    <div
      data-testid="stage-3-read-evidence"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        borderTop: "1px solid var(--v7-border)",
        paddingTop: "var(--space-3)",
      }}
    >
      {confLabel ? (
        <div
          data-testid="stage-3-read-confidence-label"
          style={{ fontSize: 12, color: "var(--v7-fg-muted)" }}
        >
          Confidence: <strong style={{ color: "var(--v7-text)" }}>{confLabel}</strong>
        </div>
      ) : null}

      {runnerUp ? (
        <div
          data-testid="stage-3-read-runner-up"
          style={{ fontSize: 12, color: "var(--v7-fg-muted)" }}
        >
          Runner-up:{" "}
          <span style={{ color: "var(--v7-text)" }}>
            {runnerUp.display_label ?? runnerUp.intent_key ?? "—"}
          </span>
          {gapPts !== null ? (
            <span data-testid="stage-3-read-gap">
              {" "}
              · Gap to runner-up: {gapPts} pts
            </span>
          ) : null}
        </div>
      ) : null}

      {reasoning ? (
        <div data-testid="stage-3-read-reasoning">
          <SectionLabel>WHY THIS TOPIC</SectionLabel>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--v7-text)",
              margin: "var(--space-2) 0 0",
            }}
          >
            {reasoning}
          </p>
        </div>
      ) : null}
    </div>
  );
}
