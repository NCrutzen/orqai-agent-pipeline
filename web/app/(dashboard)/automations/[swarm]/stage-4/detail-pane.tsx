"use client";

// Phase 76 Plan 07 Task 2 — Stage 4 detail pane (UI-SPEC §Detail pane).
//
// Mirrors stage-3/detail-pane.tsx except:
//   - Stage 3 ranked-output section is REPLACED by ErrorDetailSection.
//   - ActionStack receives `actions={['reclassify','close']}` — Stage 4 has
//     no Replay-edit per UI-SPEC §Action stack lock.
//   - intents prop is empty array — Stage 4 doesn't load intents (page.tsx
//     skips loadSwarmIntents).
//
// Reuses stage-3/reason-pill and stage-3/action-stack (parameterized in
// Plan 07 Task 1) — does NOT duplicate. Cross-import is intentional per
// UI-SPEC §Component Inventory: "Shared between Stage 3 and Stage 4 tabs".

import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { ReasonPill } from "../stage-3/reason-pill";
import { ActionStack } from "../stage-3/action-stack";
import { ErrorDetailSection } from "./error-detail-section";

interface Props {
  row: KanbanRow | null;
  swarmType: string;
  operatorId: string;
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
          {row.result.intent ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--v7-text-muted)",
              }}
            >
              {row.result.intent}
            </span>
          ) : null}
        </div>

        <ErrorDetailSection row={row} />

        <section style={{ marginTop: "var(--space-6)" }}>
          <div style={SECTION_LABEL}>Email body</div>
          <div style={{ fontSize: "13px", lineHeight: 1.45, color: "var(--v7-text-muted)" }}>
            {/* TODO Plan 08: wire fetchReviewEmailBody if operators need full body. */}
            Email body preview not yet wired in Plan 07.
          </div>
        </section>
      </div>

      <ActionStack
        row={row}
        swarmType={swarmType}
        operatorId={operatorId}
        intents={[]}
        noiseCategories={noiseCategories}
        actions={["reclassify", "close"]}
      />
    </aside>
  );
}
