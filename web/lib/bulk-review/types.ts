// Phase 1 (milestone bulk-review-flow-ux) — P1-D-01, P1-D-07.
// BulkReviewRow is the consumer-side projection of the pipeline's per-row
// state across all six funnel slots (Stage 0, 1, 2, 3, 3.5 dispatcher, 4).
// Every slot is independently nullable: a row whose Stage 0 has not shipped
// (pre-Phase 64) or whose Stage 3.5 dispatcher did not fire must still
// satisfy this type. UI components are responsible for graceful rendering.
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md):
//   - Stage 1 vocabulary: swarm_noise_categories.category_key ∪ {"unknown"}.
//   - Stage 3 vocabulary: swarm_intents.intent_key.
//   These NEVER cross. The type system enforces it.
//
// =====================================================================
// DECIDE-COLUMN DATA AUDIT (Plan 03-06)
// =====================================================================
// Audits each of the five stages' slot types against the fields its
// Decide-column sketch (sketches 002-005) headline needs, so the per-stage
// Decide rewrites (Plans 03-07..03-11) land pixel-perfect with REAL data.
// Disposition legend:
//   COVERED        — field already on the slot (or sourced from a render
//                    prop the editor already loads); no change needed.
//   ADD-FROM-CORPUS— sketch needs it, corpus has it, slot lacked it → add
//                    + hydrator projects the real value.
//   NOT-IN-CORPUS  — sketch shows it but no corpus column exists today;
//                    typed `string | null`, hydrator projects null, the
//                    renderer omits the line. NEVER fabricate (anti-drift
//                    note 5 + MISSING-IN-CODEBASE.md). A future migration
//                    populates it.
//
// Stage 0 · Safety (BulkReviewStage0Slot) — sketch 002 Decide:
//   verdict (2-state radio) ............. COVERED (verdict)
//   cost_cents (inline-expand header) ... COVERED (cost_cents)
//   confidence (header) ................. COVERED (confidence)
//   → NO new field needed.
//
// Stage 1 · Noise (BulkReviewStage1Slot) — sketch 003 Decide:
//   category_key (dropdown current) ..... COVERED (category_key)
//   category_display_label (label) ...... COVERED (category_display_label,
//                                         Plan 02-03)
//   agent_run_id (feedback POST) ........ COVERED (agent_run_id, Plan 02-04)
//   noise-category list (dropdown opts) . COVERED — loaded by the widget
//                                         from the registry prop, NOT the
//                                         slot.
//   → NO new field needed (Phase 2 Plans 02-01..04 already wired these).
//
// Stage 2 · Customer (BulkReviewStage2Slot) — sketch 004 pick-card Decide:
//   customer NAME (16px headline, ln 561) ADD-FROM-CORPUS → customer_name
//                                         (sourced from email_labels.debtor_name —
//                                         the SAME row the hydrator loads.
//                                         Plan 03-12 corrected the source: the
//                                         old coordinator_runs.customer_name
//                                         column does not exist [42703]).
//   acct {id} · NXT (mono sub-line) ..... COVERED (customer_account_id /
//                                         corrected_customer_account_id)
//   source-pill ......................... COVERED (resolver_source + confidence)
//   promotion-lineage line (ln 565) ..... NOT-IN-CORPUS → sender_map_lineage.
//                                         sender_map has no promoted_at /
//                                         promoted_from_event_ids columns
//                                         today (MISSING-IN-CODEBASE.md Stage 2
//                                         row); hydrator emits null until a
//                                         future migration; renderer omits.
//   resolver chain (4-step trace) ....... COVERED (resolver_steps + winner_step,
//                                         Phase 04.1 Plan 04)
//   → ADD customer_name + sender_map_lineage (below).
//
// Stage 3 · Topic (BulkReviewStage3Slot) — sketch 005 ranked-list Decide:
//   ranked_intents[] .................... COVERED (ranked_intents)
//   intent_key (per row) ................ COVERED (RankedIntent.intent_key)
//   confidence (bar) .................... COVERED (RankedIntent.confidence)
//   display_label (row label) ........... COVERED (RankedIntent.display_label,
//                                         Plan 02-05)
//   handler_key ("→ {handler}" sub-line)  COVERED — NOT a slot field. The
//                                         ranked-intent editor resolves the
//                                         handler from the loadSwarmIntents
//                                         registry prop (swarm_intents carries
//                                         handler_event per swarm; the editor
//                                         joins intent_key → handler at render).
//                                         No speculative slot field is added
//                                         (per-stage-content.md: loadSwarmIntents
//                                         already exists). FOLLOW-UP: if a future
//                                         read of ranked-intent-editor.tsx shows
//                                         the handler key is NOT available from
//                                         any prop, revisit — do NOT add a field
//                                         speculatively here.
//   → NO new slot field needed.
//
// Stage 4 · Action (BulkReviewStage4Slot) — sketch (existing Phase 71 work):
//   handler_key ......................... COVERED (handler_key)
//   draft_quality (verdict selector) .... COVERED (draft_quality)
//   feedback_reason ..................... COVERED (feedback_reason)
//   handler_output_kind ................. COVERED (handler_output_kind)
//   draft BODY text (handler_output) .... COVERED — NOT a slot field. The
//                                         draft body is sourced from the
//                                         handler output surface (agent_runs /
//                                         the existing Phase 71 Stage 4 detail
//                                         pane), NOT BulkReviewStage4Slot. The
//                                         slot carries only the verdict-capture
//                                         dimensions. NO new slot field added
//                                         (per-stage-content.md: Stage 4 is
//                                         existing Phase 71 work — verify
//                                         against canon).
//   → NO new slot field needed.
// =====================================================================

import type { Entity } from "@/lib/automations/debtor-email/coordinator/entity.generated";
import type { Intent } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import type { OverrideAxis } from "@/lib/pipeline-events/types";

export const BULK_REVIEW_ROW_VERSION = "1.0.0" as const;

export type Stage0Verdict = "safe" | "injection_suspected" | "over_budget";

export interface BulkReviewStage0Slot {
  verdict: Stage0Verdict;
  cost_cents: number | null;
  confidence: number | null;
  pipeline_event_id: string | null;
}

export interface BulkReviewStage1Slot {
  // Noise-filter vocabulary ONLY (swarm_noise_categories.category_key ∪ {"unknown"}).
  // NEVER a swarm_intents value — hard separation per stage-1-regex.md.
  category_key: string;
  matched_rule_id: string | null;
  regex_verdict: string; // raw Pass 1 outcome (e.g. matched rule key | "unknown")
  llm_second_pass_verdict: string | null; // Pass 2 — only populated when Pass 1 = "unknown"
  pipeline_event_id: string | null;
  // Phase 2 — Plan 02-01: LLM Pass 2 evidence fields (additive). Sourced from
  // pipeline_events.decision_details written by classifier-screen-worker.ts.
  // Vocabulary: llm_category_key is in swarm_noise_categories ∪ {"unknown"};
  // it is NEVER a swarm_intents value. Hard-separation per stage-1-regex.md.
  llm_invoked: boolean; // false when regex Pass 1 was decisive (no LLM call)
  llm_category_key: string | null; // LLM's predicted noise category (validation deferred to renderer)
  llm_confidence: "high" | "medium" | "low" | null;
  llm_reasoning: string | null; // raw; renderer truncates
  llm_error: string | null; // non-null only on failure path
  predictor: "regex" | "llm_2nd_pass" | null; // denormalised gating signal (Phase 999.8 D-11)
  // Phase 04.1 — Plan 04 (P4.1-D-04). Stage 1 LLM Pass 2 model_key
  // (additive, nullable). Sourced from pipeline_events.decision_details.model_key
  // written by classifier-screen-worker.ts. Telemetry only — NOT a
  // vocabulary key (hard-separation invariant preserved: model_key
  // identifies the Orq agent, not a swarm_noise_categories or
  // swarm_intents value). Null for pure-regex rows (llm_invoked === false)
  // and historic pre-Phase-04.1 rows where the field was not emitted.
  llm_model_key: string | null;
  // Phase 2 — Plan 02-03: human-readable display labels for category_key and
  // llm_category_key, projected from swarm_noise_categories.display_label at
  // hydration time so render trees stay registry-free (P1-D-02). Both are
  // nullable: null when the corresponding key is null OR when the key is not
  // (no longer) in the registry. Hard-separation invariant preserved — these
  // labels are sourced ONLY from swarm_noise_categories, NEVER swarm_intents.
  category_display_label: string | null;
  llm_category_display_label: string | null;
  // Phase 2 — Plan 02-04: id of the Stage 1 agent_runs row tied to this
  // pipeline_events stage_1 evidence, projected from agent_runs.id at
  // hydration time. Threaded into BulkReviewStage1Slot so the Decide
  // column's rule-feedback widget can pass it to the /feedback POST
  // handler — which then routes a human_verdict='edited_minor' UPDATE
  // through the same auth boundary as the email_feedback INSERT (OQ-9).
  // Nullable: pre-Phase 74 LLM-Pass-2 rows have no agent_runs entry;
  // historic rows whose Stage 1 was purely regex-Pass-1 also have none.
  // Hard-separation invariant unchanged — this id keys an agent_runs row
  // whose `stage` column equals 1 (noise filter), NEVER 3 (intent).
  agent_run_id: string | null;
}

// Phase 04.1 — Plan 04 (P4.1-D-01). Canonical shape for the resolver-step
// trace surfaced in BulkReviewStage2Slot.resolver_steps[]. Must stay in
// lockstep with web/lib/automations/debtor-email/resolver-trace.ts.
export interface ResolverStep {
  step: "thread" | "sender_map" | "identifier" | "llm_tiebreaker";
  idx: 1 | 2 | 3 | 4;
  status: "miss" | "matched" | "conflict" | "picked" | "not_run";
  confidence: number | null;
  detail: Record<string, unknown> | null;
}

// Phase 04.1 — Plan 08. Stage 2 candidate-evidence shape. Mirrors
// web/lib/automations/debtor-email/resolve-debtor.ts {Candidate, Stage2Inputs}
// by STRUCTURAL EQUALITY (re-declared, not imported — bulk-review must not
// import from automations/inngest per the out-of-band guard). Both shapes
// must stay identical. Also mirrors resolver-chain.tsx ResolverChainCandidate.
export interface Stage2Candidate {
  id: string;
  name: string;
  contact_person: string | null;
  recent_invoices: string[];
}
export type Stage2InputsEvidence =
  | {
      kind: "thread_inheritance";
      prior_email_label_id: string;
      conversation_id: string;
    }
  | { kind: "sender_match"; sender_email: string; candidates: Stage2Candidate[] }
  | {
      kind: "identifier_match";
      matched_identifiers: string[];
      candidates: Stage2Candidate[];
    }
  | {
      kind: "llm_tiebreaker";
      sender_email: string | null;
      matched_identifiers: string[];
      candidates: Stage2Candidate[];
      llm_reason: string;
      picked_account_id: string | null;
    }
  | {
      kind: "unresolved";
      sender_email: string | null;
      matched_identifiers: string[];
    };

export interface BulkReviewStage2Slot {
  entity_brand: Entity | null;
  resolver_source: "sender_map" | "identifier_match" | "llm_tiebreaker" | null;
  customer_account_id: string | null;
  corrected_customer_account_id: string | null;
  confidence: number | null;
  pipeline_event_id: string | null;
  // Phase 04.1 — Plan 04 (P4.1-D-01 + D-02). Stage 2 resolver-step trace
  // (additive, forward-only emit). Sourced from
  // pipeline_events.decision_details.steps[] + .winner written by
  // classifier-label-resolver.ts. Audit-trail data only — NOT a vocabulary
  // key (Stage 2 vocabulary remains customer_account_id + entity_brand;
  // hard-separation invariant preserved). Both fields null when the trace
  // was not emitted (historic rows per P4.1-D-02 forward-only-emit + SC #6).
  // The renderer surfaces "Resolver path not recorded for this row."
  resolver_steps: ResolverStep[] | null;
  winner_step: 1 | 2 | 3 | 4 | null;
  // Plan 03-12 (gap-closure r3-1, sketch 004 line 561). Resolved customer
  // display name for the pick-card 16px NAME headline — so the card renders
  // the customer's name, not just `acct {id}`. Sourced at hydration time from
  // debtor.email_labels.debtor_name — the SAME row the hydrator already loads
  // (no second lookup). The earlier Plan 03-06 source (coordinator_runs.
  // customer_name) was a column that does not exist → PostgREST 42703 →
  // silent null, so the name never rendered. Nullable: null when the label
  // has no debtor_name (renderer shows the account-only fallback). NEVER
  // fabricate (anti-drift note 5). NOT a vocabulary key — Stage 2 vocabulary
  // remains customer_account_id + entity_brand; hard-separation preserved.
  customer_name: string | null;
  // Plan 03-06 (gap-closure, sketch 004 line 565). Promotion-lineage line
  // ("promoted from LLM-aided to deterministic in W18 …"). NOT-IN-CORPUS
  // today: the sender_map table has no promoted_at / promoted_from_event_ids
  // columns (MISSING-IN-CODEBASE.md Stage 2 row). Typed `string | null` and
  // the hydrator ALWAYS projects null until a future migration adds the
  // source columns; the renderer omits the line when null. NEVER fabricate a
  // lineage string (anti-drift note 5).
  sender_map_lineage: string | null;
  // Phase 04.1 — Plan 08. Discriminated Stage-2 resolver evidence projected
  // from pipeline_events.decision_details.inputs (emitted by
  // classifier-label-resolver.ts matched branch since Phase 82.9). For the
  // llm_tiebreaker kind this carries the competing candidate customers +
  // picked_account_id the operator asked to see. Audit evidence only — NOT a
  // vocabulary key (Stage 2 vocab stays customer_account_id + entity_brand;
  // hard separation preserved). Null when: resolver-error branch (no inputs
  // emitted), or historic pre-82.9 rows. Renderer (stage-2-read.tsx) narrows
  // on inputs.kind === 'llm_tiebreaker'.
  inputs: Stage2InputsEvidence | null;
}

export interface RankedIntent {
  intent_key: Intent;
  confidence: number | null;
  // Phase 2 — Plan 02-05: human-readable display label projected from
  // swarm_intents.display_label at hydration time so render trees stay
  // registry-free (P1-D-02). Nullable: null when the intent_key has been
  // retired from the registry (defensive — hydrator filters unknown keys,
  // this is the historic-row case). Hard-separation invariant preserved —
  // sourced ONLY from swarm_intents, NEVER swarm_noise_categories.
  display_label: string | null;
  // Plan 03-12 (gap-closure r3-2): per-intent classifier evidence projected
  // from coordinator_runs.ranked_intents[] — each item carries
  // { intent, sub_type, reasoning, confidence, document_reference }. These
  // were previously dropped by the hydrator's ranked loop. reasoning is
  // sourced from ranked_intents[].reasoning ONLY — NEVER coordinator_runs.
  // decision_details (null for all debtor rows) and NEVER fabricated
  // (anti-drift note 5). confidence_label is the raw confidence string enum
  // (the numeric `confidence` above stays for the bar; this preserves the
  // operator-facing label). All nullable for historic rows that lacked the
  // field. NO model_key — it is not in the corpus.
  //
  // Optional (`?`) so the many existing RankedIntent constructors that
  // predate this plan (override-actions reorder, ranked-intent-editor add-row,
  // legacy fixtures) stay assignable without churn — those paths carry no
  // classifier evidence (an operator-reordered list has no per-intent
  // reasoning). The hydrator (the ONE read path that has the data) always
  // projects all four. Renderers treat absent === null.
  reasoning?: string | null;
  sub_type?: string | null;
  document_reference?: string | null;
  confidence_label?: "high" | "medium" | "low" | null;
}

export interface BulkReviewStage3Slot {
  // Intent vocabulary ONLY (swarm_intents.intent_key). NEVER a
  // swarm_noise_categories value — hard separation per stage-3-coordinator.md.
  top_intent: Intent;
  ranked_intents: RankedIntent[];
  pipeline_event_id: string | null;
}

export interface BulkReviewStage3p5Slot {
  // Dispatcher slot. May be null when the pipeline did not emit a
  // 3.5-dispatcher event for this row (P1-D-07: render gracefully).
  dispatcher_decision: string;
  handler_event: string | null;
  pipeline_event_id: string | null;
}

export interface BulkReviewStage4Slot {
  handler_key: string | null;
  draft_quality: string | null; // email_labels.draft_quality
  feedback_reason: string | null; // email_labels.feedback_reason
  handler_output_kind: string | null; // 'draft_body' | 'action_confirmation' | 'data_payload'
  pipeline_event_id: string | null;
}

// Per-axis override capture columns (P1-D-03). Axis 3 has no dedicated
// column today — it lives ONLY in pipeline_events rows.
export interface BulkReviewOverrideCapture {
  axis_1_corrected_category: string | null; // agent_runs.corrected_category
  axis_1_human_verdict: string | null; // agent_runs.human_verdict
  axis_2_corrected_customer_account_id: string | null;
  axis_2_reviewed_by: string | null;
  axis_2_reviewed_at: string | null;
  axis_4_draft_quality: string | null;
  axis_4_feedback_reason: string | null;
  // Axis 3 has NO dedicated column. Multi-intent reorder = N pipeline_events
  // rows with stage=3, eval_type='intent-correction'. The audit timeline is
  // the only Axis 3 ledger today (CON-pipeline-events-write-shape).
  axis_3_event_ids: string[]; // pipeline_events.id list, oldest-first
}

export interface BulkReviewRow {
  // Stable join key — Bulk Review ↔ Kanban use the SAME id (P1-D-05).
  email_label_id: string;
  swarm_type: string;
  email_id: string | null; // email_pipeline.emails.id
  context_version: string; // PipelineStageContext.context_version
  stage_0: BulkReviewStage0Slot | null; // null pre-Phase 64
  stage_1: BulkReviewStage1Slot | null; // null if not yet classified
  stage_2: BulkReviewStage2Slot | null;
  stage_3: BulkReviewStage3Slot | null; // null when Stage 1 routed to noise
  stage_3p5: BulkReviewStage3p5Slot | null; // null when dispatcher did not fire
  stage_4: BulkReviewStage4Slot | null; // null when no handler ran
  overrides: BulkReviewOverrideCapture;
}

// Discriminated-union for the write-helper (Plan 02). Lifted here so
// both the type file and the helper consume one source of truth.
export type BulkReviewOverrideInput =
  | {
      axis: "stage_1_category";
      new_category_key: string;
      reason?: string | null;
    }
  | {
      axis: "stage_2_customer";
      new_customer_account_id: string;
      reason?: string | null;
    }
  | {
      axis: "stage_3_intent";
      new_ranked_intents: RankedIntent[];
      reason?: string | null;
    }
  | {
      axis: "stage_4_handler_output";
      new_draft_quality: string;
      new_feedback_reason: string | null;
      reason?: string | null;
    };

// Re-export OverrideAxis so consumers have one import path.
export type { OverrideAxis };
