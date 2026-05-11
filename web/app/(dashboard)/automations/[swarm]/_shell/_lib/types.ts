// Phase 82 Plan 01 — canonical Row + EmptyState + ActiveStage types for the
// unified stage shell. These are PRESENTATION primitives only; per-stage page
// boundaries map their loader-specific row shapes into `Row` and pass it down.
//
// Hard-separation reminder (docs/agentic-pipeline/README.md): a row exists in
// EXACTLY ONE of swarm_noise_categories (Stage 1) or swarm_intents (Stage 3).
// `Row` carries a single `stage_badge` slot — never both a noise label and an
// intent label simultaneously.

export interface Row {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  /** ISO timestamp; email received_at preferred, falls back to created_at. */
  timestamp: string;
  mailbox_id: number | null;
  stage_badge: {
    label: string;
    variant: "noise" | "intent" | "handler" | "safety" | "placeholder";
  };
}

export interface EmptyState {
  title: string;
  body: string;
}

export type ActiveStage = 0 | 1 | 2 | 3 | 4;
