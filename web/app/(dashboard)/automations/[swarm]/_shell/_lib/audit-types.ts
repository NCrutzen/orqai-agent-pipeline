// Phase 82.3 Plan 02 — audit payload types for the per-stage Show details
// expander. Hard-separation lock (docs/agentic-pipeline/README.md):
//   - Stage1AuditPayload.rule_key references swarm_noise_categories ONLY
//   - Stage3AuditPayload.*_intent_key references swarm_intents ONLY
//   - Neither type references the other registry. Renderers consume one type.

import type { ReactNode } from "react";

export interface Stage0AuditPayload {
  stage: 0;
  regex_patterns_fired: string[];
  llm_injection_verdict: "clean" | "flagged" | "unknown" | null;
  llm_reasoning: string | null;
  budget_headroom_cents: number | null;
  raw: Record<string, unknown>;
}

export interface Stage1AuditPayload {
  stage: 1;
  /** rule_key from swarm_noise_categories taxonomy when regex Pass-1 fired;
   *  "unknown" when LLM Pass-2 fired. NEVER references swarm_intents. */
  rule_key: string | null;
  predictor_source: "regex" | "llm" | null;
  confidence: "high" | "medium" | "low" | null;
  reasoning: string | null;
  raw: Record<string, unknown>;
}

// Phase 82.9 — discriminated evidence payload (D-01). `inputs` absent on legacy
// rows (D-04). `candidates` + `reasoning` are richer per-method evidence.
// Existing top-level fields (identifier_source, confidence, top_candidates,
// screenshot_paths, raw) are preserved for back-compat (Pitfall 4).
export type CandidateView = {
  id: string;
  name: string;
  contact_person: string | null;
  recent_invoices: string[];
};

export type Stage2InputsView =
  | {
      kind: "thread_inheritance";
      prior_email_label_id: string;
      conversation_id: string;
    }
  | {
      kind: "sender_match";
      sender_email: string;
      candidates: CandidateView[];
    }
  | {
      kind: "identifier_match";
      matched_identifiers: string[];
      candidates: CandidateView[];
    }
  | {
      kind: "llm_tiebreaker";
      sender_email: string | null;
      matched_identifiers: string[];
      candidates: CandidateView[];
      llm_reason: string;
    }
  | {
      kind: "unresolved";
      sender_email: string | null;
      matched_identifiers: string[];
    };

export interface Stage2AuditPayload {
  stage: 2;
  // EXISTING — DO NOT REMOVE (Pitfall 4 back-compat):
  identifier_source: "thread" | "sender" | "identifier" | "unresolved" | null;
  confidence: "high" | "medium" | "low" | null;
  top_candidates: Array<{ account_id: string; name: string; score: number }>;
  screenshot_paths: { before: string | null; after: string | null };
  raw: Record<string, unknown>;
  // Phase 82.9 — populated on rows written after deploy; null/absent on legacy rows.
  /** Discriminated by `kind`. Null on legacy rows (decision_details.inputs absent in JSONB). */
  inputs?: Stage2InputsView | null;
  /** Rich candidate list. Present when `inputs.kind` is `sender_match` / `identifier_match` / `llm_tiebreaker`. */
  candidates?: CandidateView[];
  /** LLM tiebreaker reason. Present only when `inputs?.kind === "llm_tiebreaker"`. */
  reasoning?: string | null;
}

export interface Stage3AuditPayload {
  stage: 3;
  /** intent_key from swarm_intents taxonomy. Hard-separation lock — NEVER
   *  references swarm_noise_categories.
   *  reasoning/sub_type/document_reference are per-intent — surfaced in the
   *  expanded audit panel (2026-05-19) so operators can see WHY each runner-
   *  up intent was considered, not just the top-1 reasoning. */
  ranked_intents: Array<{
    intent_key: string;
    confidence: number;
    reasoning?: string | null;
    sub_type?: string | null;
    document_reference?: string | null;
  }>;
  coordinator_reasoning: string | null;
  selected_intent_key: string | null;
  /** Email-level classifier outputs (decision_details root, not per-intent). */
  language?: string | null;
  urgency?: string | null;
  /** Prompt/model version that produced this classification. */
  intent_version?: string | null;
  /** Inputs handed to the intent agent (subject excerpt, sender, mailbox,
   *  entity, received_at). Populated by the coordinator writer 2026-05-19;
   *  historical rows have this field absent. */
  inputs?: {
    sender_email?: string | null;
    sender_domain?: string | null;
    mailbox?: string | null;
    entity?: string | null;
    subject_excerpt?: string | null;
    received_at?: string | null;
  } | null;
  raw: Record<string, unknown>;
}

export type StageAuditPayload =
  | Stage0AuditPayload
  | Stage1AuditPayload
  | Stage2AuditPayload
  | Stage3AuditPayload;

export type StageAuditMap = Partial<Record<0 | 1 | 2 | 3, ReactNode>>;
