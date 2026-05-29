// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-02 Task 1.
// hydrateBulkReviewRow: server-side selector that materialises a single
// BulkReviewRow from email_labels (debtor schema) + pipeline_events (public)
// + agent_runs (public), then joins the registry vocabularies
// (swarm_noise_categories, swarm_intents, swarms.entity_brand) at HYDRATION
// time so React render trees never round-trip to the registry (P1-D-02).
//
// HARD SEPARATION (RFC stage-1-regex.md + stage-3-coordinator.md):
//   Stage 1 vocabulary = swarm_noise_categories.category_key ∪ {"unknown"}.
//   Stage 3 vocabulary = swarm_intents.intent_key.
// These NEVER cross. The hydrator enforces the rule at runtime by filtering
// any stage_3 ranked_intent whose intent_key is not in SWARM_INTENTS, and by
// console.warn-ing when stage_1 category_key is not in the noise-categories
// registry. The codegen'd type system enforces the same rule at compile time
// (Plan 01-01 — Intent / Entity literal-unions).
//
// Schema reference (verified):
//   - debtor.email_labels  (migration 20260430c_email_labels_feedback_and_invoice_copy.sql)
//   - public.pipeline_events (Phase 70 migration 20260506a)
//   - public.agent_runs    (migration 20260428_public_agent_runs.sql)
//
// Out-of-band guarantee (CON-Phase-72-out-of-band / LERN-02): this file MUST
// NOT import from @/lib/inngest/* nor any Phase-72 module — the static guard
// test __tests__/out-of-band.test.ts enumerates the forbidden symbols (kept
// out of this comment so the guard's own regex doesn't false-positive on
// the doc string).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadEntityBrand as loadAllBrandRegisters,
  loadSwarmIntents,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { SWARM_INTENTS } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import type { Intent } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import { ENTITY_BRANDS } from "@/lib/automations/debtor-email/coordinator/entity.generated";
import type { Entity } from "@/lib/automations/debtor-email/coordinator/entity.generated";

import type {
  BulkReviewOverrideCapture,
  BulkReviewRow,
  BulkReviewStage0Slot,
  BulkReviewStage1Slot,
  BulkReviewStage2Slot,
  BulkReviewStage3Slot,
  BulkReviewStage3p5Slot,
  BulkReviewStage4Slot,
  RankedIntent,
  ResolverStep,
  Stage0Verdict,
  Stage2InputsEvidence,
} from "./types";
import { BULK_REVIEW_ROW_VERSION } from "./types";

export interface HydrateOptions {
  email_label_id: string;
  swarm_type: string;
}

// ----- helpers ----------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStage0Verdict(v: unknown): Stage0Verdict | null {
  if (v === "safe" || v === "injection_suspected" || v === "over_budget") {
    return v;
  }
  // Phase 70 worker writes pipeline_events.decision = 'safe'|'injection_suspected'.
  return null;
}

interface PipelineEventRow {
  id: string;
  stage: number;
  decision: string | null;
  confidence: number | null;
  decision_details: Record<string, unknown> | null;
  override: Record<string, unknown> | null;
  triggered_by: string | null;
  created_at: string;
  cost_cents: number | null;
}

interface AgentRunRow {
  id?: string | null;
  stage?: number | null;
  corrected_category: string | null;
  human_verdict: string | null;
  tool_outputs: Record<string, unknown> | null;
}

interface EmailLabelRow {
  id: string;
  // Columns that DON'T EXIST on debtor.email_labels but the projection still
  // wants to consume — kept here as null so downstream `??` fall-throughs
  // work without per-site null guards. DO NOT add these to the SELECT list:
  //   - swarm_type        (schema is implicitly debtor-email)
  //   - entity_brand      (no brand-register dimension in debtor schema)
  //   - handler_key       (handler binding lives in agent_runs / coordinator)
  //   - handler_output_kind
  // Co-bug fix 2026-05-27 alongside /review/page.tsx swarm_type filter.
  swarm_type: null;
  entity_brand: null;
  handler_key: null;
  handler_output_kind: null;
  // Real columns:
  email_id: string | null;
  corrected_customer_account_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  draft_quality: string | null;
  feedback_reason: string | null;
  customer_account_id: string | null;
  // Plan 03-12 (gap-closure r3-1). Real customer display name. Source of
  // truth for stage_2.customer_name — the SAME row the hydrator already
  // loads (no second lookup). Populated for all email_labels rows that
  // carry a customer_account_id; null otherwise. coordinator_runs has NO
  // customer_name column (the old lookup 42703-errored to silent null).
  debtor_name: string | null;
}

// ----- hydrator ---------------------------------------------------------

export async function hydrateBulkReviewRow(
  admin: SupabaseClient,
  opts: HydrateOptions,
): Promise<BulkReviewRow | null> {
  // (1) email_labels (debtor schema) — load the anchor row.
  //
  // 2026-05-27 fix: `swarm_type` removed from the SELECT list. The column
  // doesn't exist on debtor.email_labels (the schema is implicitly the
  // debtor-email swarm's labels store). Including it caused PostgREST to
  // return a single { error: column "swarm_type" does not exist } per row,
  // .maybeSingle() collapsed that to {data: null}, and the page rendered
  // empty. Co-bug with /review/page.tsx swarm_type filter (already fixed).
  const labelRes = await admin
    .schema("debtor")
    .from("email_labels")
    .select(
      "id, email_id, corrected_customer_account_id, reviewed_by, reviewed_at, draft_quality, feedback_reason, customer_account_id, debtor_name",
    )
    .eq("id", opts.email_label_id)
    .maybeSingle();

  if (labelRes.error) {
    console.warn(
      `[hydrate] debtor.email_labels query failed for id=${opts.email_label_id}: ${labelRes.error.message}`,
    );
    return null;
  }
  // Synthesize the columns the projection wants but the schema doesn't have
  // so downstream `label.<x> ?? <fallback>` continues to work.
  const labelData = labelRes.data as Omit<
    EmailLabelRow,
    "swarm_type" | "entity_brand" | "handler_key" | "handler_output_kind"
  > | null;
  const label: EmailLabelRow | null = labelData
    ? {
        ...labelData,
        swarm_type: null,
        entity_brand: null,
        handler_key: null,
        handler_output_kind: null,
      }
    : null;
  if (!label) return null;

  // (2) pipeline_events (public) — ordered (stage, created_at) so the first
  //     row per stage is the canonical first-pass event for the slot.
  const eventsRes = await admin
    .from("pipeline_events")
    .select(
      "id, stage, decision, confidence, decision_details, override, triggered_by, created_at, cost_cents",
    )
    .eq("email_id", label.email_id ?? "")
    .order("stage", { ascending: true })
    .order("created_at", { ascending: true });

  const events: PipelineEventRow[] = Array.isArray(eventsRes.data)
    ? (eventsRes.data as PipelineEventRow[])
    : [];

  // (3) agent_runs (public) — capture-column source for Axis 1 and the
  //     authoritative source for Stage 3 ranked_intents (see audit-mapper
  //     comment block: tool_outputs.intent_first_pass.ranked).
  const runsRes = await admin
    .from("agent_runs")
    .select("id, stage, corrected_category, human_verdict, tool_outputs")
    .eq("email_id", label.email_id ?? "");

  const runs: AgentRunRow[] = Array.isArray(runsRes.data)
    ? (runsRes.data as AgentRunRow[])
    : [];

  // (4) Registry hydration. 60s TTL inside each loader (D-06) — calling
  //     these inside hydrate is the supported pattern (P1-D-02).
  const [noiseCats, intents, brands] = await Promise.all([
    loadSwarmNoiseCategories(admin, opts.swarm_type),
    loadSwarmIntents(admin, opts.swarm_type),
    loadAllBrandRegisters(admin, opts.swarm_type).catch(() => []),
  ]);
  const noiseKeys = new Set(noiseCats.map((c) => c.category_key));
  const intentKeys = new Set(intents.map((i) => i.intent_key));
  const brandCodes = new Set(brands.map((b) => b.code));

  // ----- per-stage slot extraction ---------------------------------------

  const firstByStage = (stage: number): PipelineEventRow | null =>
    events.find((e) => e.stage === stage) ?? null;
  const stage0Event = firstByStage(0);
  const stage1Event = firstByStage(1);
  const stage2Event = firstByStage(2);
  const stage3Event = firstByStage(3);
  const stage4Event = firstByStage(4);
  const stage1Run = runs.find((r) => r.stage === 1) ?? null;
  const stage3Run = runs.find((r) => r.stage === 3) ?? null;

  // ----- Stage 0 ---------------------------------------------------------
  let stage_0: BulkReviewStage0Slot | null = null;
  if (stage0Event) {
    const d = isRecord(stage0Event.decision_details)
      ? stage0Event.decision_details
      : {};
    const verdict: Stage0Verdict =
      asStage0Verdict(stage0Event.decision) ??
      asStage0Verdict(d.verdict) ??
      "safe";
    stage_0 = {
      verdict,
      cost_cents: stage0Event.cost_cents ?? asNumber(d.cost_cents),
      confidence: stage0Event.confidence,
      pipeline_event_id: stage0Event.id,
    };
  }

  // ----- Stage 1 ---------------------------------------------------------
  // Vocabulary: swarm_noise_categories.category_key ∪ {"unknown"}. NEVER
  // a swarm_intents value (hard separation per stage-1-regex.md).
  let stage_1: BulkReviewStage1Slot | null = null;
  if (stage1Event) {
    const d = isRecord(stage1Event.decision_details)
      ? stage1Event.decision_details
      : {};
    const regexBlock = isRecord(d.regex) ? d.regex : null;
    const category_key =
      asString(d.category) ?? asString(stage1Event.decision) ?? "unknown";

    if (category_key !== "unknown" && !noiseKeys.has(category_key)) {
      // Historic row whose key was retired from the registry — render but warn.
      console.warn(
        `[hydrate] stage_1 category_key "${category_key}" not in swarm_noise_categories for swarm="${opts.swarm_type}" (hard separation: this MUST stay in the noise-filter vocabulary, never an intent_key)`,
      );
    }

    const matched_rule_id = regexBlock ? asString(regexBlock.matchedRule) : null;
    const llm_second_pass_verdict =
      asString(d.llm_reasoning) ?? asString(d.llm_2nd_pass_verdict);
    const tool = isRecord(stage1Run?.tool_outputs)
      ? (stage1Run!.tool_outputs as Record<string, unknown>)
      : {};
    const llmFromAgent = asString(tool.reasoning);

    // Phase 2 Plan 02-01 — LLM Pass 2 evidence projection.
    // Source: pipeline_events.decision_details written by
    // classifier-screen-worker.ts on the Stage 1 LLM Pass 2 path.
    // Hard-separation: llm_category_key is in swarm_noise_categories ∪
    // {"unknown"}; runtime validation against the registry is deferred to the
    // renderer (the hydrator's job is projection, not validation — the
    // existing noiseKeys block already warn-validates final category_key).
    const llm_invoked = d.llm_invoked === true;
    const llm_category_key = asString(d.llm_category_key);
    const rawLlmConf = d.llm_confidence;
    const llm_confidence: "high" | "medium" | "low" | null =
      rawLlmConf === "high" || rawLlmConf === "medium" || rawLlmConf === "low"
        ? rawLlmConf
        : null;
    const llm_reasoning = asString(d.llm_reasoning);
    const llm_error = asString(d.llm_error);
    // Phase 04.1 — Plan 04 (P4.1-D-04). Stage 1 LLM Pass-2 model_key
    // projection. Telemetry-only (hard-separation invariant preserved;
    // not a vocab key). asString() returns null for missing or non-string.
    const llm_model_key = asString(d.model_key);
    const rawPredictor = d.predictor;
    const predictor: "regex" | "llm_2nd_pass" | null =
      rawPredictor === "regex" || rawPredictor === "llm_2nd_pass"
        ? rawPredictor
        : null;

    // Plan 02-03 — project display_label from the already-loaded noiseCats
    // registry. No second DB round-trip. Hard-separation: ONLY swarm_noise_categories
    // is consulted — swarm_intents is never read here.
    const category_display_label =
      category_key && category_key !== "unknown"
        ? (noiseCats.find((c) => c.category_key === category_key)
            ?.display_label ?? null)
        : null;
    const llm_category_display_label =
      llm_category_key && llm_category_key !== "unknown"
        ? (noiseCats.find((c) => c.category_key === llm_category_key)
            ?.display_label ?? null)
        : null;

    // Plan 02-04 — project agent_runs.id (stage=1 row) so the Decide
    // column's rule-feedback widget can thread it to the /feedback POST
    // handler (OQ-9). Sourced ONLY from agent_runs whose stage column = 1;
    // hard-separation rule (Stage 1 noise vs Stage 3 intent) is preserved
    // because the run lookup keys on stage===1.
    const agent_run_id = asString(stage1Run?.id);

    stage_1 = {
      category_key,
      matched_rule_id,
      regex_verdict: matched_rule_id ?? category_key,
      llm_second_pass_verdict: llm_second_pass_verdict ?? llmFromAgent,
      pipeline_event_id: stage1Event.id,
      llm_invoked,
      llm_category_key,
      llm_confidence,
      llm_reasoning,
      llm_error,
      predictor,
      llm_model_key,
      category_display_label,
      llm_category_display_label,
      agent_run_id,
    };
  }

  // ----- Stage 2 ---------------------------------------------------------
  let stage_2: BulkReviewStage2Slot | null = null;
  if (stage2Event) {
    const d = isRecord(stage2Event.decision_details)
      ? stage2Event.decision_details
      : {};
    const method = asString(d.method);
    const resolver_source: BulkReviewStage2Slot["resolver_source"] =
      method === "sender_match"
        ? "sender_map"
        : method === "identifier_match"
          ? "identifier_match"
          : method === "llm_tiebreaker"
            ? "llm_tiebreaker"
            : null;

    let entity_brand: Entity | null = null;
    const rawBrand = asString(label.entity_brand);
    if (rawBrand !== null) {
      if (brandCodes.size > 0 && !brandCodes.has(rawBrand)) {
        console.warn(
          `[hydrate] stage_2 entity_brand "${rawBrand}" not in swarms.entity_brand register for swarm="${opts.swarm_type}"; setting to null`,
        );
      } else if (!(ENTITY_BRANDS as readonly string[]).includes(rawBrand)) {
        console.warn(
          `[hydrate] stage_2 entity_brand "${rawBrand}" not in generated ENTITY_BRANDS literal-union; setting to null`,
        );
      } else {
        entity_brand = rawBrand as Entity;
      }
    }

    // Phase 04.1 — Plan 04 (P4.1-D-01 + D-02). Forward-only emit projection.
    // Pre-Phase-04.1 rows have no `steps` key → null sentinel.
    // Hydrator does projection only, not validation (Phase 2 P1-D-02);
    // emit side controls shape. Renderer handles null (Plan 06).
    const resolver_steps: ResolverStep[] | null = Array.isArray(d.steps)
      ? (d.steps as ResolverStep[])
      : null;
    const winner_step: 1 | 2 | 3 | 4 | null =
      typeof d.winner === "number" && d.winner >= 1 && d.winner <= 4
        ? (d.winner as 1 | 2 | 3 | 4)
        : null;

    // Plan 03-12 (gap-closure r3-1) — resolve the customer display NAME for
    // the pick-card headline (sketch 004 line 561) from the SAME row the
    // hydrator already loaded: debtor.email_labels.debtor_name. The previous
    // Plan 03-06 lookup queried coordinator_runs.customer_name — a column
    // that does NOT exist (PostgREST 42703 → silent null), so the name never
    // rendered. debtor_name is the real source (populated for all rows that
    // carry a customer_account_id). No second DB round-trip; null when the
    // label has no debtor_name (renderer shows the account-only fallback).
    // NEVER fabricate a name (anti-drift note 5). NOT a vocabulary read —
    // hard-separation invariant preserved.
    const customer_name: string | null = label.debtor_name;

    // Plan 03-06 — sender_map promotion lineage (sketch 004 line 565).
    // NOT-IN-CORPUS: the sender_map table has no promoted_at /
    // promoted_from_event_ids columns today (MISSING-IN-CODEBASE.md Stage 2
    // row). Projected null until a future migration adds the source; the
    // renderer omits the line when null. NEVER fabricate a lineage string.
    const sender_map_lineage: string | null = null;

    // Phase 04.1 — Plan 08. Project decision_details.inputs (the resolver
    // evidence: candidate set + picked_account_id for the llm_tiebreaker kind,
    // emitted by classifier-label-resolver.ts since Phase 82.9). Projection
    // only — no per-candidate validation (matches resolver_steps; emit side
    // owns the shape, P1-D-02). Null on the resolver-error branch (no inputs
    // written) and on historic pre-82.9 rows. The `kind` string-guard keeps a
    // malformed/legacy non-discriminated object from leaking through.
    const inputs: Stage2InputsEvidence | null =
      isRecord(d.inputs) && typeof d.inputs.kind === "string"
        ? (d.inputs as Stage2InputsEvidence)
        : null;

    stage_2 = {
      entity_brand,
      resolver_source,
      customer_account_id:
        asString(d.customer_account_id) ?? label.customer_account_id,
      corrected_customer_account_id: label.corrected_customer_account_id,
      confidence: stage2Event.confidence ?? asNumber(d.confidence),
      pipeline_event_id: stage2Event.id,
      resolver_steps,
      winner_step,
      customer_name,
      sender_map_lineage,
      inputs,
    };
  }

  // ----- Stage 3 ---------------------------------------------------------
  // Vocabulary: swarm_intents.intent_key only. Poisoned values (e.g. a
  // swarm_noise_categories key leaked into ranked_intents) are filtered out
  // with a console.warn — the hard-separation runtime guarantee.
  let stage_3: BulkReviewStage3Slot | null = null;
  if (stage3Event || stage3Run) {
    const d = isRecord(stage3Event?.decision_details)
      ? (stage3Event!.decision_details as Record<string, unknown>)
      : {};
    const tool = isRecord(stage3Run?.tool_outputs)
      ? (stage3Run!.tool_outputs as Record<string, unknown>)
      : {};
    const firstPass = isRecord(tool.intent_first_pass)
      ? (tool.intent_first_pass as Record<string, unknown>)
      : {};
    const rankedRaw: unknown =
      (Array.isArray(d.ranked_intents) && d.ranked_intents) ||
      (Array.isArray(d.ranked) && d.ranked) ||
      (Array.isArray(firstPass.ranked) && firstPass.ranked) ||
      [];

    const ranked_intents: RankedIntent[] = [];
    if (Array.isArray(rankedRaw)) {
      for (const r of rankedRaw) {
        if (!isRecord(r)) continue;
        const intent_key = asString(r.intent_key) ?? asString(r.intent);
        if (!intent_key) continue;
        if (!(SWARM_INTENTS as readonly string[]).includes(intent_key)) {
          // hard separation: a swarm_noise_categories value (e.g. "auto_reply")
          // would land here. Drop + warn so the operator surfaces it.
          console.warn(
            `[hydrate] stage_3 ranked_intent "${intent_key}" not in SWARM_INTENTS — filtered (hard separation: Stage 3 vocabulary is swarm_intents.intent_key only, NEVER a swarm_noise_categories key)`,
          );
          continue;
        }
        if (intentKeys.size > 0 && !intentKeys.has(intent_key)) {
          console.warn(
            `[hydrate] stage_3 ranked_intent "${intent_key}" not registered in swarm_intents for swarm="${opts.swarm_type}" — filtered`,
          );
          continue;
        }
        // Plan 03-12 (gap-closure r3-2): capture the raw confidence string
        // enum BEFORE numeric coercion so the Read renderer can show the
        // operator-facing label. Only high/medium/low survive; anything else
        // → null.
        const rawConf = asString(r.confidence);
        const confidence_label: "high" | "medium" | "low" | null =
          rawConf === "high" || rawConf === "medium" || rawConf === "low"
            ? rawConf
            : null;
        let confidence = asNumber(r.confidence);
        if (confidence === null) {
          const label = asString(r.confidence);
          if (label === "high") confidence = 0.9;
          else if (label === "medium") confidence = 0.7;
          else if (label === "low") confidence = 0.4;
        }
        // Plan 02-05 — project display_label from the already-loaded
        // intentsForSwarm registry. No second DB round-trip. Hard-separation:
        // ONLY swarm_intents is consulted — swarm_noise_categories is never
        // read here.
        //
        // Today the swarm_intents table has no display_label column (see
        // migration 20260504b_swarms_registry_generalisation.sql) — the
        // SwarmIntentRow type reflects that. We cast through `unknown` so
        // that if a future migration adds display_label, this lookup auto-
        // wires without a code change. Until then, this consistently
        // returns null and the Stage 3 renderer falls back to intent_key
        // (operator-language.md tolerates raw keys when no label exists).
        const intentRow = intents.find((i) => i.intent_key === intent_key) as
          | (typeof intents)[number] & { display_label?: string | null }
          | undefined;
        const display_label = intentRow?.display_label ?? null;
        ranked_intents.push({
          intent_key: intent_key as Intent,
          confidence,
          display_label,
          // Plan 03-12 (gap-closure r3-2): per-intent classifier evidence.
          // reasoning is sourced from ranked_intents[].reasoning ONLY (never
          // decision_details, never fabricated). null for historic rows.
          reasoning: asString(r.reasoning),
          sub_type: asString(r.sub_type),
          document_reference: asString(r.document_reference),
          confidence_label,
        });
      }
    }

    let top_intent: Intent | null = ranked_intents[0]?.intent_key ?? null;
    const eventDecision = asString(stage3Event?.decision);
    if (
      top_intent === null &&
      eventDecision &&
      (SWARM_INTENTS as readonly string[]).includes(eventDecision)
    ) {
      top_intent = eventDecision as Intent;
    }

    if (top_intent !== null) {
      stage_3 = {
        top_intent,
        ranked_intents,
        pipeline_event_id: stage3Event?.id ?? null,
      };
    }
  }

  // ----- Stage 3.5 (dispatcher) -----------------------------------------
  // P1-D-07: pipeline_events.stage is smallint 0..4 — there is NO physical
  // stage=3.5. The dispatcher slot is reconstructed from stage=3 events whose
  // decision_details carries a `dispatcher_decision`. When no such event
  // exists the slot stays null and the UI renders "not applicable".
  // TODO: revisit if a future migration introduces a dedicated stage value.
  let stage_3p5: BulkReviewStage3p5Slot | null = null;
  const dispatcherEvent = events.find(
    (e) =>
      e.stage === 3 &&
      isRecord(e.decision_details) &&
      typeof e.decision_details.dispatcher_decision === "string",
  );
  if (dispatcherEvent && isRecord(dispatcherEvent.decision_details)) {
    const d = dispatcherEvent.decision_details;
    stage_3p5 = {
      dispatcher_decision: String(d.dispatcher_decision),
      handler_event: asString(d.handler_event),
      pipeline_event_id: dispatcherEvent.id,
    };
  }

  // ----- Stage 4 ---------------------------------------------------------
  let stage_4: BulkReviewStage4Slot | null = null;
  if (stage4Event || label.draft_quality || label.handler_key) {
    stage_4 = {
      handler_key: label.handler_key,
      draft_quality: label.draft_quality,
      feedback_reason: label.feedback_reason,
      handler_output_kind: label.handler_output_kind,
      pipeline_event_id: stage4Event?.id ?? null,
    };
  }

  // ----- Axis 3 event ids -----------------------------------------------
  const axis_3_event_ids = events
    .filter(
      (e) =>
        e.stage === 3 &&
        isRecord(e.override) &&
        (e.override as Record<string, unknown>).axis === "stage_3_intent",
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e) => e.id);

  // ----- Overrides capture ----------------------------------------------
  const axis1Run = runs.find((r) => r.corrected_category !== null) ?? null;
  const overrides: BulkReviewOverrideCapture = {
    axis_1_corrected_category: axis1Run?.corrected_category ?? null,
    axis_1_human_verdict: axis1Run?.human_verdict ?? null,
    axis_2_corrected_customer_account_id: label.corrected_customer_account_id,
    axis_2_reviewed_by: label.reviewed_by,
    axis_2_reviewed_at: label.reviewed_at,
    axis_4_draft_quality: label.draft_quality,
    axis_4_feedback_reason: label.feedback_reason,
    axis_3_event_ids,
  };

  return {
    email_label_id: label.id,
    swarm_type: label.swarm_type ?? opts.swarm_type,
    email_id: label.email_id,
    context_version: BULK_REVIEW_ROW_VERSION,
    stage_0,
    stage_1,
    stage_2,
    stage_3,
    stage_3p5,
    stage_4,
    overrides,
  };
}
