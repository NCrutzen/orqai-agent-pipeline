import type { OverrideAxis } from "../../types";

export interface OverrideEventPayload {
  axis: OverrideAxis;
  email_id: string;
  original_event_id: string;
  original_decision: string;
  decision: string;
  decision_details?: Record<string, unknown>;
  eval_type: "capability" | "regression";
  reason?: string;
  re_run_downstream?: boolean;
}

const EMAIL_ID = "00000000-0000-4000-8000-000000000071";
const ORIG_EVT = "00000000-0000-4000-8000-000000000007";

export const FIXTURE_AXIS_1_REGRESSION: OverrideEventPayload = {
  axis: "stage_1_category",
  email_id: EMAIL_ID,
  original_event_id: ORIG_EVT,
  original_decision: "unknown",
  decision: "noise",
  decision_details: { category_key: "noise" },
  eval_type: "regression",
  reason: "marketing autoresponder; previously caught by regex",
};

export const FIXTURE_AXIS_1_CAPABILITY: OverrideEventPayload = {
  ...FIXTURE_AXIS_1_REGRESSION,
  decision: "payment_admittance",
  decision_details: { category_key: "payment_admittance" },
  eval_type: "capability",
  reason: "new pattern: customer accepts payment plan in single line",
};

export const FIXTURE_AXIS_2_REGRESSION: OverrideEventPayload = {
  axis: "stage_2_customer",
  email_id: EMAIL_ID,
  original_event_id: ORIG_EVT,
  original_decision: "999.0001",
  decision: "123.4567",
  decision_details: { customer_account_id: "123.4567", customer_name: "Foo BV" },
  eval_type: "regression",
  re_run_downstream: false,
};

export const FIXTURE_AXIS_2_CAPABILITY_RERUN: OverrideEventPayload = {
  ...FIXTURE_AXIS_2_REGRESSION,
  eval_type: "capability",
  re_run_downstream: true,
};

export const FIXTURE_AXIS_3_REGRESSION: OverrideEventPayload = {
  axis: "stage_3_intent",
  email_id: EMAIL_ID,
  original_event_id: ORIG_EVT,
  original_decision: "invoice_copy",
  decision: "payment_dispute",
  decision_details: { intent_key: "payment_dispute" },
  eval_type: "regression",
};

export const FIXTURE_AXIS_3_CAPABILITY: OverrideEventPayload = {
  ...FIXTURE_AXIS_3_REGRESSION,
  decision: "address_change",
  decision_details: { intent_key: "address_change" },
  eval_type: "capability",
};

export const FIXTURE_AXIS_4_REGRESSION: OverrideEventPayload = {
  axis: "stage_4_handler_output",
  email_id: EMAIL_ID,
  original_event_id: ORIG_EVT,
  original_decision: "draft_created",
  decision: "draft_quality_rated",
  decision_details: { draft_quality: 2, reason: "wrong invoice attached" },
  eval_type: "regression",
  reason: "wrong invoice attached",
};

export const FIXTURE_AXIS_4_CAPABILITY: OverrideEventPayload = {
  ...FIXTURE_AXIS_4_REGRESSION,
  decision_details: { draft_quality: 5, reason: "perfect — handler resolved a brand-new pattern" },
  eval_type: "capability",
  reason: "perfect — handler resolved a brand-new pattern",
};

export const ALL_OVERRIDE_FIXTURES = [
  FIXTURE_AXIS_1_REGRESSION,
  FIXTURE_AXIS_1_CAPABILITY,
  FIXTURE_AXIS_2_REGRESSION,
  FIXTURE_AXIS_2_CAPABILITY_RERUN,
  FIXTURE_AXIS_3_REGRESSION,
  FIXTURE_AXIS_3_CAPABILITY,
  FIXTURE_AXIS_4_REGRESSION,
  FIXTURE_AXIS_4_CAPABILITY,
] as const;
