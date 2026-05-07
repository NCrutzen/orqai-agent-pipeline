"use client";

// Phase 76 Plan 06 Task 3 — Inline editor (UI-SPEC §Replay/Reclassify editors).
//
// Two variants:
//   - Replay: dropdown of swarm_intents (filtered registered upstream).
//             Confirm fires replayKanbanRow Server Action.
//   - Reclassify: dropdown of swarm_noise_categories minus 'unknown'.
//                 Confirm fires reclassifyAsNoise Server Action.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Replay variant ONLY consumes swarm_intents (Stage 3).
//   - Reclassify variant ONLY consumes swarm_noise_categories (Stage 1).
//   - Hard separation: never crossed.
//
// W3 single-field rule: noise category key field is `category_key`. No
// fallback to a non-existent secondary field name.

import { useState, useTransition } from "react";
import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { replayKanbanRow } from "../_actions/replay";
import { reclassifyAsNoise } from "../_actions/reclassify-noise";
import { useSelection } from "./selection-context";

type CommonProps = {
  row: KanbanRow;
  swarmType: string;
  operatorId: string;
  onCancel: () => void;
  onError: (msg: string) => void;
};

const SURFACE: React.CSSProperties = {
  padding: "var(--space-3)",
  border: "1px solid var(--v7-brand-primary)",
  borderRadius: "4px",
  background: "var(--v7-bg-2)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--v7-text-muted)",
};

const HELPER: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--v7-text-muted)",
  lineHeight: 1.3,
};

const SELECT: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  padding: "var(--space-2)",
  background: "var(--v7-bg)",
  color: "var(--v7-text)",
  border: "1px solid var(--v7-border)",
  borderRadius: "4px",
};

const BTN_ROW: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-2)",
  justifyContent: "flex-end",
};

const BTN_CANCEL: React.CSSProperties = {
  fontSize: "13px",
  padding: "var(--space-2) var(--space-3)",
  background: "transparent",
  color: "var(--v7-text-muted)",
  border: "1px solid var(--v7-border)",
  borderRadius: "4px",
  cursor: "pointer",
};

const BTN_CONFIRM: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  padding: "var(--space-2) var(--space-3)",
  background: "var(--v7-brand-primary)",
  color: "var(--v7-bg)",
  border: "1px solid var(--v7-brand-primary)",
  borderRadius: "4px",
  cursor: "pointer",
};

export function InlineEditorReplay(
  props: CommonProps & { intents: SwarmIntentRow[] },
) {
  const { row, swarmType, operatorId, onCancel, onError, intents } = props;
  const originalIntent = row.result.intent ?? "";
  const [chosen, setChosen] = useState<string>(originalIntent || (intents[0]?.intent_key ?? ""));
  const [isPending, start] = useTransition();
  const { markPendingRemoval } = useSelection();

  function onConfirm() {
    if (!chosen) return;
    markPendingRemoval(row.id);
    start(async () => {
      const res = await replayKanbanRow({
        kanbanRowId: row.id,
        swarmType,
        emailId: row.result.email_id ?? "",
        originalIntent,
        chosenIntent: chosen,
        originalEventId: row.stage_3_event_id,
        operatorId,
      });
      if (!res.ok) onError("Couldn't replay. The override wasn't recorded; the row stays in the queue.");
    });
  }

  return (
    <div style={SURFACE}>
      <div style={SECTION_LABEL}>Replay through Stage 4 — confirm intent</div>
      <select
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        style={SELECT}
        disabled={isPending}
      >
        {intents.map((i) => (
          <option key={i.intent_key} value={i.intent_key}>
            {i.intent_key}
            {i.intent_key === originalIntent ? " (current — same as Stage 3 pick)" : ""}
          </option>
        ))}
      </select>
      <div style={HELPER}>
        Same intent → re-fires handler. Different intent → writes axis-3 override + fires new handler.
      </div>
      <div style={BTN_ROW}>
        <button type="button" onClick={onCancel} style={BTN_CANCEL} disabled={isPending}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} style={BTN_CONFIRM} disabled={isPending || !chosen}>
          Confirm replay
        </button>
      </div>
    </div>
  );
}

export function InlineEditorReclassify(
  props: CommonProps & { noiseCategories: SwarmNoiseCategoryRow[] },
) {
  const { row, swarmType, operatorId, onCancel, onError, noiseCategories } = props;
  const [chosen, setChosen] = useState<string>(noiseCategories[0]?.category_key ?? "");
  const [isPending, start] = useTransition();
  const { markPendingRemoval } = useSelection();

  function onConfirm() {
    if (!chosen) return;
    markPendingRemoval(row.id);
    start(async () => {
      const res = await reclassifyAsNoise({
        kanbanRowId: row.id,
        swarmType,
        emailId: row.result.email_id ?? "",
        noiseKey: chosen,
        originalStage1Decision: "unknown",
        originalEventId: row.stage_1_event_id,
        operatorId,
      });
      if (!res.ok)
        onError("Couldn't reclassify. The Stage 1 override wasn't recorded; the row stays in the queue.");
    });
  }

  return (
    <div style={SURFACE}>
      <div style={SECTION_LABEL}>Reclassify as noise — pick category</div>
      <select
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
        style={SELECT}
        disabled={isPending}
      >
        {noiseCategories.map((c) => (
          <option key={c.category_key} value={c.category_key}>
            {c.category_key} — {c.display_label}
          </option>
        ))}
      </select>
      <div style={HELPER}>
        Writes Stage 1 override and archives the email under the chosen noise category.
      </div>
      <div style={BTN_ROW}>
        <button type="button" onClick={onCancel} style={BTN_CANCEL} disabled={isPending}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} style={BTN_CONFIRM} disabled={isPending || !chosen}>
          Confirm reclassify
        </button>
      </div>
    </div>
  );
}
