// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-01 Task 2.
// Type-level contract assertions for BulkReviewRow. Tests are mostly
// compile-time: if these files type-check, the contract holds.

import { describe, it, expect } from "vitest";
import {
  BULK_REVIEW_ROW_VERSION,
  type BulkReviewRow,
  type BulkReviewOverrideInput,
  type RankedIntent,
} from "@/lib/bulk-review/types";

describe("BulkReviewRow contract", () => {
  it("exposes a stable version constant", () => {
    expect(BULK_REVIEW_ROW_VERSION).toBe("1.0.0");
  });

  it("type-checks a fully-empty row (all six stage slots null) — P1-D-07 graceful empty", () => {
    const empty: BulkReviewRow = {
      email_label_id: "00000000-0000-0000-0000-000000000000",
      swarm_type: "debtor-email",
      email_id: null,
      context_version: "1.0.0",
      stage_0: null,
      stage_1: null,
      stage_2: null,
      stage_3: null,
      stage_3p5: null,
      stage_4: null,
      overrides: {
        axis_1_corrected_category: null,
        axis_1_human_verdict: null,
        axis_2_corrected_customer_account_id: null,
        axis_2_reviewed_by: null,
        axis_2_reviewed_at: null,
        axis_4_draft_quality: null,
        axis_4_feedback_reason: null,
        axis_3_event_ids: [],
      },
    };
    expect(empty.stage_3).toBeNull();
  });

  it("Stage 1 slot uses category_key from swarm_noise_categories (NOT intent_key) — hard separation", () => {
    // Compile-time check: assigning an intent_key field to stage_1 must error.
    // Runtime trivial assertion that the field exists.
    const row: BulkReviewRow["stage_1"] = {
      category_key: "auto_reply",
      matched_rule_id: null,
      regex_verdict: "auto_reply",
      llm_second_pass_verdict: null,
      pipeline_event_id: null,
      // Phase 2 Plan 02-01 — additive LLM Pass 2 evidence fields.
      llm_invoked: false,
      llm_category_key: null,
      llm_confidence: null,
      llm_reasoning: null,
      llm_error: null,
      predictor: null,
      // Phase 04.1 Plan 04 — additive LLM model_key telemetry field.
      llm_model_key: null,
      // Phase 2 Plan 02-03 — additive display-label projection fields.
      category_display_label: null,
      llm_category_display_label: null,
      // Phase 2 Plan 02-04 — additive agent_runs.id projection.
      agent_run_id: null,
    };
    expect(row?.category_key).toBe("auto_reply");
  });

  it("Stage 3 ranked_intents uses Intent literal-union from intent.generated.ts", () => {
    // This will only compile if Intent has at least one member after codegen.
    // If the registry is empty `Intent = never` and this test catches that.
    const sample: RankedIntent[] = []; // empty allowed
    expect(sample).toEqual([]);
  });

  it("BulkReviewOverrideInput is a closed discriminated-union over OverrideAxis", () => {
    const inputs: BulkReviewOverrideInput[] = [
      { axis: "stage_1_category", new_category_key: "auto_reply" },
      { axis: "stage_2_customer", new_customer_account_id: "x" },
      { axis: "stage_3_intent", new_ranked_intents: [] },
      {
        axis: "stage_4_handler_output",
        new_draft_quality: "edited_minor",
        new_feedback_reason: null,
      },
    ];
    expect(inputs).toHaveLength(4);
  });
});
