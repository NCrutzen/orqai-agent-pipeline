// Phase 4 Plan 01 — central types for the promotion-recommender vertical
// slice. PromotionKind values are the internal/code-facing names; the
// operator-facing terminology lock (P4-D-04) lives in signature.ts.

export type PromotionKind =
  | "regex_rule"           // operator-facing: "Filter rule" (Stage 1)
  | "sender_mapping"       // operator-facing: "Known sender" (Stage 2)
  | "prompt_tune_stage_3"  // operator-facing: "AI tuning" (Stage 3)
  | "new_intent"           // operator-facing: "New topic" (Stage 3)
  | "prompt_tune_stage_4"; // operator-facing: "Draft style" (Stage 4)

export type PromotionStage =
  | "1-noise"
  | "2-customer"
  | "3-coordinator"
  | "4-handler";

export type PromotionStatus =
  | "open"
  | "in_review"
  | "approved"
  | "rejected"
  | "rolled_back";

/** Structured per-kind payload — drives both signature render and Refine UI. */
export type RefinementPayload =
  | {
      kind: "regex_rule";
      subject_pattern: string;
      sender_filter?: string[];
    }
  | {
      kind: "sender_mapping";
      sender_pattern: string;
      customer_account_id: string;
    }
  | {
      kind: "prompt_tune_stage_3";
      eval_type_seed: "intent-correction";
      sender_domain?: string;
      intent_key?: string;
    }
  | {
      kind: "new_intent";
      intent_key_candidate: string;
      handler_event: string;
      handler_status: "placeholder" | "registered";
    }
  | {
      kind: "prompt_tune_stage_4";
      sender_domain?: string;
      verdict_category?: string;
      tone_examples?: Array<{ before: string; after: string }>;
    };

export interface ProposedChange {
  display_signature: string;
  /** "Why this matters" 2nd-line operator descriptor rendered under the
   *  signature on cluster card + detail header (sketch 006 sig-sub lock;
   *  Phase 4 follow-up 2026-05-27). Cron-rendered alongside display_signature
   *  so historical candidates surface uniform copy. Optional for backward
   *  compat with rows persisted before the sub line was wired. */
  display_signature_sub?: string;
  before_after_payload?: {
    before_steps: string[];
    after_steps: string[];
    before_cost_cents: number;
    after_cost_cents: number;
  };
  structured_payload: RefinementPayload;
  dismissal_reason?: string;
}

/** Mirrors public.promotion_candidates columns 1:1 for read paths. */
export interface PromotionCandidateRow {
  id: string;
  kind: PromotionKind;
  swarm_type: string;
  stage: PromotionStage;
  signature_key: string;
  proposed_change: ProposedChange;
  evidence_event_ids: string[];
  evidence_email_ids: string[];
  matched_event_count_30d: number;
  confirm_rate: number | null;
  expected_savings_cents_per_month: number | null;
  savings_calculation_version: number;
  status: PromotionStatus;
  approved_by: string | null;
  approved_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}
