"use client";

// Phase 76 Plan 06 Task 3 — Detail pane (UI-SPEC §Detail pane, sketch 006).
//
// 460px fixed width. Renders subject + meta + ranked output + body preview +
// sticky action stack. Email body preview is a placeholder in Plan 06; Plan
// 08 may wire fetchReviewEmailBody if operators need it.

import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { ReasonPill } from "./reason-pill";
import { ConfBar } from "./conf-bar";
import { ActionStack } from "./action-stack";

interface Props {
  row: KanbanRow | null;
  swarmType: string;
  operatorId: string;
  intents: SwarmIntentRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--v7-text-muted)",
  marginBottom: "var(--space-2)",
};

export function DetailPane({
  row,
  swarmType,
  operatorId,
  intents,
  noiseCategories,
}: Props) {
  if (!row) {
    return (
      <aside
        style={{
          width: "460px",
          background: "var(--v7-bg-2)",
          borderLeft: "1px solid var(--v7-border)",
          padding: "var(--space-6) var(--space-4)",
          color: "var(--v7-text-muted)",
        }}
      >
        <h3 style={{ fontSize: "14px", fontWeight: 500, margin: 0, color: "var(--v7-text)" }}>
          Select a row to inspect
        </h3>
        <p style={{ fontSize: "13px", marginTop: "var(--space-2)" }}>
          Use ↑ ↓ to move through the list, or click a row.
        </p>
      </aside>
    );
  }

  const ranked = row.result.ranked ?? [];
  const picked = row.result.intent;

  return (
    <aside
      style={{
        width: "460px",
        background: "var(--v7-bg-2)",
        borderLeft: "1px solid var(--v7-border)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ padding: "var(--space-6) var(--space-4)", overflowY: "auto", flex: 1 }}>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 500,
            margin: 0,
            color: "var(--v7-text)",
            lineHeight: 1.4,
          }}
        >
          {row.topic ?? "(no topic)"}
        </h3>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--v7-text-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          {row.id}
        </div>
        <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <ReasonPill reason={row.result.kanban_reason} />
          {row.result.kanban_reason === "low_confidence" && ranked[0]?.confidence ? (
            <ConfBar value={parseFloat(ranked[0].confidence) || 0} />
          ) : null}
        </div>

        <section style={{ marginTop: "var(--space-6)" }}>
          <div style={SECTION_LABEL}>Stage 3 ranked output</div>
          {ranked.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>(none)</div>
          ) : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {ranked.map((r, idx) => (
                <li
                  key={`${r.intent}-${idx}`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    color: r.intent === picked ? "var(--v7-text)" : "var(--v7-text-muted)",
                  }}
                >
                  {idx + 1}. {r.intent} · {r.confidence}
                  {r.intent === picked ? " ✓ picked" : ""}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section style={{ marginTop: "var(--space-6)" }}>
          <div style={SECTION_LABEL}>Email body</div>
          <div style={{ fontSize: "13px", lineHeight: 1.45, color: "var(--v7-text-muted)" }}>
            {/* TODO Plan 08: wire fetchReviewEmailBody if operators need full body. */}
            Email body preview not yet wired in Plan 06.
          </div>
        </section>
      </div>

      <ActionStack
        row={row}
        swarmType={swarmType}
        operatorId={operatorId}
        intents={intents}
        noiseCategories={noiseCategories}
      />
    </aside>
  );
}
