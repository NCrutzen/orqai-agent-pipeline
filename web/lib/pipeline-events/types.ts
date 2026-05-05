// Phase 70 — TELE-01. Typed payload + Stage enum for the canonical
// `public.pipeline_events` telemetry surface.
//
// IMPORTANT: The `Stage` enum is closed/static — it mirrors Stage 0..4 from
// `docs/agentic-pipeline/README.md` and does NOT come from a registry table.
// Do NOT codegen this file. Adding a new stage requires a deliberate review
// of every emit site and the Bulk Review read query (per CLAUDE.md
// §"Build-time codegen for registry-driven literal-union TS types" — that
// pattern explicitly applies to *registry-derived* enums; the Stage axis is
// architectural and changes through human review, not through a row insert).

/**
 * Closed enum: every stage of the canonical agentic pipeline.
 * 0 = Stage 0 safety, 1 = Stage 1 regex, 2 = Stage 2 entity resolution,
 * 3 = Stage 3 coordinator, 4 = Stage 4 handler.
 */
export const Stage = {
  Stage0_Safety: 0,
  Stage1_Regex: 1,
  Stage2_Entity: 2,
  Stage3_Coordinator: 3,
  Stage4_Handler: 4,
} as const;

export type StageValue = (typeof Stage)[keyof typeof Stage];

/**
 * Typed payload for `emitPipelineEvent`.
 *
 * Field-level notes:
 *  - `swarm_type` accepts any string (no CHECK in DB per CONTEXT D-12); use
 *    'debtor-email' | 'sales-email' | 'cross-cutting' in current call sites.
 *  - `email_id` MUST be the canonical `email_pipeline.emails.id` (uuid).
 *    If the call site only has the Outlook string id, set `email_id: null`
 *    and stash the string in `decision_details.outlook_message_id`
 *    (RESEARCH §Pitfall 3).
 *  - `confidence` is `numeric(4,3)` in DB. For legacy text confidence,
 *    map via `numericConfidence()` below.
 *  - `override` and `eval_type` stay NULL in Phase 70 — Phase 71 will
 *    populate them on operator-override emits (CONTEXT D-10/D-11/D-12).
 *  - `case_id` is forward-compat for `docs/agentic-pipeline/case-layer.md`
 *    and stays NULL until that ships.
 */
export interface PipelineEventInput {
  swarm_type: string;
  stage: StageValue;
  email_id?: string | null;
  case_id?: string | null;
  decision: string;
  confidence?: number | null;
  override?: OverrideJson | null;
  eval_type?: "capability" | "regression" | null;
  decision_details?: Record<string, unknown> | null;
  cost_cents?: number | null;
  duration_ms?: number | null;
  agent_run_id?: string | null;
  automation_run_id?: string | null;
  triggered_by?: "pipeline" | "operator-override" | "replay" | "backfill" | null;
}

/**
 * Phase 71 D-01 / D-03 — 4-axis override vocabulary.
 *
 * Closed literal-union; no DB CHECK constraint (matches Phase 70 stance).
 * Compile-time enforcement via TypeScript is sufficient.
 *
 * NOTE: this type is also produced by Plan 71-01. When 71-01 lands first the
 * orchestrator merges; when 71-02 lands first this declaration carries the
 * contract. Either way the literal-union is stable and identical.
 */
export type OverrideAxis =
  | "stage_1_category"
  | "stage_2_customer"
  | "stage_3_intent"
  | "stage_4_handler_output";

/**
 * Shape stored in pipeline_events.override jsonb (D-01).
 * `eval_type` lives on its own pipeline_events column — NOT inside this jsonb
 * (D-01 rationale: simpler indexing, no jsonb path queries on hot read path).
 */
export interface OverrideJson {
  axis: OverrideAxis;
  original_decision: string;     // verbatim copy of decision being overridden
  original_event_id: string;     // uuid — the pipeline_events.id of first-pass row
  operator_id: string;           // uuid (auth.uid()) — server-stamped per D-13
  reason: string | null;         // free text, max 1000 chars (D-14), null when omitted
  submitted_at: string;          // ISO timestamptz; MUST be generated inside step.run (Pitfall 2)
}

/**
 * Map legacy text-confidence vocabulary used by `email_labels`,
 * `agent_runs`, and Stage-2/3 outputs to the numeric(4,3) shape required
 * by `pipeline_events.confidence`.
 *
 * Mapping (RESEARCH §Pitfall 1, Assumption A2):
 *   high   -> 0.9
 *   medium -> 0.7
 *   low    -> 0.4
 *   none   -> null
 *   null   -> null
 *   undef  -> null
 *
 * Numeric values from upstream (e.g. Stage 1 regex `r.confidence`) should
 * be passed through directly without using this helper.
 */
export function numericConfidence(
  v: "high" | "medium" | "low" | "none" | null | undefined,
): number | null {
  if (v === "high") return 0.9;
  if (v === "medium") return 0.7;
  if (v === "low") return 0.4;
  // 'none', null, undefined all collapse to null per the schema convention
  // (numeric(4,3) NULL is the "deterministic / unknown" sentinel).
  return null;
}
