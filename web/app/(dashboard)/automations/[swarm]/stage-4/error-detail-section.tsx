"use client";

// Phase 76 Plan 07 Task 2 — Error detail section (UI-SPEC §Detail pane copy).
//
// Renders result.error_name as a small heading and result.error_detail in a
// red mono <pre> block. If both are empty, renders "No error detail recorded"
// in muted copy. React auto-escapes the pre content (T-76-07-03 mitigation).

import type { KanbanRow } from "../_lib/kanban-loader";

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--v7-text-muted)",
  marginBottom: "var(--space-2)",
};

export function ErrorDetailSection({ row }: { row: KanbanRow }) {
  const detail = row.result.error_detail;
  const name = row.result.error_name;

  if (!detail && !name) {
    return (
      <section style={{ marginTop: "var(--space-6)" }}>
        <div style={SECTION_LABEL}>Error detail</div>
        <div style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>
          No error detail recorded
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: "var(--space-6)" }}>
      <div style={SECTION_LABEL}>Error detail</div>
      {name ? (
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--v7-red)",
            marginBottom: "var(--space-2)",
          }}
        >
          {name}
        </div>
      ) : null}
      {detail ? (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--v7-red)",
            background: "var(--v7-red-soft)",
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "4px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}
        >
          {detail}
        </pre>
      ) : null}
    </section>
  );
}
