"use client";

// Phase 76 Plan 06 Task 3 — Action stack (UI-SPEC §Action stack, sketch 007).
//
// Three buttons. Click semantics:
//   - Replay: if same-intent path is the only registered choice, fires
//     directly. If multiple intents exist, opens the inline-editor (Replay
//     variant). v1 always opens the editor so operator confirms intent.
//   - Reclassify: opens inline-editor (Reclassify variant).
//   - Close: fires closeKanbanRow Server Action immediately.
//
// Keyboard: ⏎ Replay, N Reclassify, Space Close (UI-SPEC §Accessibility).
// Sibling buttons dim to 0.45 + non-interactive when an editor is active.

import { useEffect, useState, useTransition } from "react";
import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { closeKanbanRow } from "../_actions/close";
import {
  InlineEditorReplay,
  InlineEditorReclassify,
} from "./inline-editor";
import { useSelection } from "./selection-context";

type EditorMode = null | "replay" | "reclassify";

interface Props {
  row: KanbanRow;
  swarmType: string;
  operatorId: string;
  intents: SwarmIntentRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
}

const STACK: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
  padding: "var(--space-4)",
  borderTop: "1px solid var(--v7-border)",
  background: "var(--v7-bg-2)",
  position: "sticky",
  bottom: 0,
};

const BTN_BASE: React.CSSProperties = {
  fontSize: "14px",
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "4px",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
};

const KBD: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  padding: "0 var(--space-1)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: "4px",
  color: "var(--v7-text-muted)",
};

export function ActionStack({
  row,
  swarmType,
  operatorId,
  intents,
  noiseCategories,
}: Props) {
  const [editor, setEditor] = useState<EditorMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isClosePending, startClose] = useTransition();
  const { markPendingRemoval } = useSelection();

  function onClose() {
    setError(null);
    markPendingRemoval(row.id);
    startClose(async () => {
      const res = await closeKanbanRow({ kanbanRowId: row.id, swarmType });
      if (!res.ok)
        setError("Couldn't close this row. Refresh and try again — the row stays in the queue.");
    });
  }

  // Keyboard shortcuts (only when no editor is active and no input focused).
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (editor !== null) {
        if (ev.key === "Escape") setEditor(null);
        return;
      }
      if (ev.key === "Enter") setEditor("replay");
      else if (ev.key === "n" || ev.key === "N") setEditor("reclassify");
      else if (ev.key === " ") {
        ev.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, row.id]);

  const editorActive = editor !== null;
  const dimStyle: React.CSSProperties = editorActive
    ? { opacity: 0.45, pointerEvents: "none" }
    : {};

  return (
    <div style={STACK}>
      {error ? (
        <div style={{ fontSize: "11px", color: "var(--v7-red)" }}>{error}</div>
      ) : null}

      {editor === "replay" ? (
        <InlineEditorReplay
          row={row}
          swarmType={swarmType}
          operatorId={operatorId}
          intents={intents}
          onCancel={() => setEditor(null)}
          onError={(m) => {
            setError(m);
            setEditor(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditor("replay")}
          style={{
            ...BTN_BASE,
            ...dimStyle,
            background: "var(--v7-brand-primary)",
            color: "var(--v7-bg)",
            border: "1px solid var(--v7-brand-primary)",
            fontWeight: 500,
          }}
        >
          ✓ Replay through Stage 4
          <span style={KBD}>⏎</span>
        </button>
      )}

      {editor === "reclassify" ? (
        <InlineEditorReclassify
          row={row}
          swarmType={swarmType}
          operatorId={operatorId}
          noiseCategories={noiseCategories}
          onCancel={() => setEditor(null)}
          onError={(m) => {
            setError(m);
            setEditor(null);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditor("reclassify")}
          style={{
            ...BTN_BASE,
            ...dimStyle,
            background: "transparent",
            color: "var(--v7-text)",
            border: "1px solid var(--v7-border)",
          }}
        >
          ↶ Reclassify as noise
          <span style={KBD}>N</span>
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        disabled={isClosePending || editorActive}
        style={{
          ...BTN_BASE,
          ...dimStyle,
          background: "transparent",
          color: "var(--v7-text-muted)",
          border: "1px solid var(--v7-border)",
        }}
      >
        ✕ Close (manual)
        <span style={KBD}>Space</span>
      </button>
    </div>
  );
}
