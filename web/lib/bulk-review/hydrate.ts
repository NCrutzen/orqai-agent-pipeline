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
import { SWARM_INTENTS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import type { Intent } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import { ENTITY_BRANDS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/entity.generated";
import type { Entity } from "@/lib/automations/debtor-email/coordinator/entity.generated";

// Phase 110-02 (D-08) — the codegen now emits per-swarm maps. The hydrator's
// runtime hard-separation guards (Stage 3 intent / Stage 2 entity validation)
// must therefore look up the literal-union members for THIS row's swarm_type,
// defaulting to an empty list for an unknown/un-seeded swarm (fail-closed:
// every value is rejected, never silently accepted — threat T-110-06).
function intentsForSwarm(swarmType: string): readonly string[] {
  return (
    (SWARM_INTENTS_BY_SWARM as Record<string, readonly string[]>)[swarmType] ??
    []
  );
}
function brandsForSwarm(swarmType: string): readonly string[] {
  return (
    (ENTITY_BRANDS_BY_SWARM as Record<string, readonly string[]>)[swarmType] ??
    []
  );
}

import type {
  BulkReviewOverrideCapture,
  BulkReviewRow,
  BulkReviewStage0Slot,
  BulkReviewStage1Slot,
  BulkReviewStage2Slot,
  BulkReviewStage3Slot,
  BulkReviewStage3p5Slot,
  BulkReviewStage4Slot,
  BulkReviewRoutingSlot,
  RoutingForwardStatus,
  RankedIntent,
  ResolverStep,
  Stage0Verdict,
  Stage2InputsEvidence,
} from "./types";
import { BULK_REVIEW_ROW_VERSION } from "./types";

export interface HydrateOptions {
  // Phase 110-02 (D-01) — the anchor is generalized off the debtor-only
  // email_labels table onto the shared corpus email_pipeline.emails.id
  // (email_id). Callers pass EITHER:
  //   - email_id (the generic, cross-swarm anchor — sales/info-routing/debtor)
  //   - email_label_id (debtor back-compat: the bucket loader still lists
  //     debtor rows by email_labels.id, which carries the email_id we anchor on)
  // At least one MUST be provided. When only email_label_id is given the
  // debtor email_labels row is loaded first and its email_id becomes the anchor.
  email_id?: string;
  email_label_id?: string;
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
  // (1) ANCHOR — Phase 110-02 (D-01). The hydrator anchors on the shared
  //     corpus identity email_pipeline.emails.id (email_id) so it serves EVERY
  //     swarm uniformly (debtor + sales + info-routing). debtor.email_labels is
  //     now read ONLY as a debtor-specific enrichment join (step 1b below) —
  //     never the cross-swarm anchor.
  //
  //     Anchor resolution:
  //       - opts.email_id present → that IS the anchor (generic path).
  //       - else opts.email_label_id present → debtor back-compat: load the
  //         email_labels row by id and lift its email_id as the anchor.
  const isDebtor = opts.swarm_type === "debtor-email";

  // (1a) Debtor-only enrichment join. For swarm_type==='debtor-email' load the
  //      email_labels row that carries the Stage-4 + override slots
  //      (corrected_customer_account_id, reviewed_by, draft_quality,
  //      feedback_reason, debtor_name). For every other swarm these slots are
  //      null — the corpus has no per-swarm label store yet (correct: there is
  //      no debtor override-capture surface for sales/info-routing).
  //
  //      2026-05-27 fix carried forward: `swarm_type` is NOT in the SELECT — the
  //      column doesn't exist on debtor.email_labels (the schema is implicitly
  //      the debtor-email swarm's label store).
  let label: EmailLabelRow | null = null;
  if (isDebtor) {
    // Match on email_label_id when the caller passed one (the bucket loader
    // lists debtor rows by email_labels.id); otherwise match on the email_id
    // anchor (join on email_id).
    let labelQuery = admin
      .schema("debtor")
      .from("email_labels")
      .select(
        "id, email_id, corrected_customer_account_id, reviewed_by, reviewed_at, draft_quality, feedback_reason, customer_account_id, debtor_name",
      );
    labelQuery =
      opts.email_label_id != null
        ? labelQuery.eq("id", opts.email_label_id)
        : labelQuery.eq("email_id", opts.email_id ?? "");
    const labelRes = await labelQuery.maybeSingle();

    if (labelRes.error) {
      console.warn(
        `[hydrate] debtor.email_labels query failed for id=${opts.email_label_id ?? opts.email_id}: ${labelRes.error.message}`,
      );
      return null;
    }
    // Synthesize the columns the projection wants but the schema doesn't have
    // so downstream `label.<x> ?? <fallback>` continues to work.
    const labelData = labelRes.data as Omit<
      EmailLabelRow,
      "swarm_type" | "entity_brand" | "handler_key" | "handler_output_kind"
    > | null;
    label = labelData
      ? {
          ...labelData,
          swarm_type: null,
          entity_brand: null,
          handler_key: null,
          handler_output_kind: null,
        }
      : null;
    // For the debtor back-compat path (anchored via email_label_id) a missing
    // label row means the row vanished between list + hydrate — early-return
    // null, preserving today's behavior byte-for-byte.
    if (opts.email_label_id != null && !label) return null;
  }

  // (1b) Resolve the canonical anchor email_id. The generic anchor is
  //      opts.email_id; the debtor back-compat path lifts it from the loaded
  //      label row.
  const anchorEmailId: string = opts.email_id ?? label?.email_id ?? "";

  // (1c) Generic corpus anchor. For non-debtor swarms (which have no
  //      email_labels enrichment row) confirm/enrich the anchor against the
  //      shared corpus email_pipeline.emails. The row is enrichment-only today
  //      (the Stage 0-3 evidence comes from pipeline_events/agent_runs below),
  //      so a miss is non-fatal — the anchor identity is opts.email_id. This
  //      keeps the debtor path (which already loaded its anchor from
  //      email_labels) free of an extra round-trip.
  if (!isDebtor) {
    const emailRes = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id")
      .eq("id", anchorEmailId)
      .maybeSingle();
    if (emailRes.error) {
      console.warn(
        `[hydrate] email_pipeline.emails query failed for id=${anchorEmailId}: ${emailRes.error.message}`,
      );
    }
  }

  // (2) pipeline_events (public) — keyed on the anchor email_id; ordered
  //     (stage, created_at) so the first row per stage is the canonical
  //     first-pass event for the slot. Already swarm-generic — NO CHANGE.
  const eventsRes = await admin
    .from("pipeline_events")
    .select(
      "id, stage, decision, confidence, decision_details, override, triggered_by, created_at, cost_cents",
    )
    .eq("email_id", anchorEmailId)
    .order("stage", { ascending: true })
    .order("created_at", { ascending: true });

  const events: PipelineEventRow[] = Array.isArray(eventsRes.data)
    ? (eventsRes.data as PipelineEventRow[])
    : [];

  // (3) agent_runs (public) — capture-column source for Axis 1 and the
  //     authoritative source for Stage 3 ranked_intents (see audit-mapper
  //     comment block: tool_outputs.intent_first_pass.ranked). Already
  //     swarm-generic — NO CHANGE.
  const runsRes = await admin
    .from("agent_runs")
    .select("id, stage, corrected_category, human_verdict, tool_outputs")
    .eq("email_id", anchorEmailId);

  const runs: AgentRunRow[] = Array.isArray(runsRes.data)
    ? (runsRes.data as AgentRunRow[])
    : [];

  // (3b) Phase 116-05 (D-08) — per-email attachment metadata, keyed on the same
  //      anchor email_id. Read via the authenticated FOR SELECT policy (Plan
  //      01). Metadata + extraction status ONLY — no document bytes / no
  //      download (T-116-17). Swarm-agnostic: a swarm without capture (or a mail
  //      with no attachments) yields []. A query error is non-fatal (mirrors the
  //      enrichment-miss handling above) → [] so the row still hydrates.
  let attachments: BulkReviewRow["attachments"] = [];
  if (anchorEmailId) {
    const attachmentsRes = await admin
      .schema("email_pipeline")
      .from("email_attachments")
      .select(
        "attachment_id, filename, content_type, size_bytes, extraction_status",
      )
      .eq("email_id", anchorEmailId);
    if (attachmentsRes.error) {
      console.warn(
        `[hydrate] email_pipeline.email_attachments query failed for id=${anchorEmailId}: ${attachmentsRes.error.message}`,
      );
    } else if (Array.isArray(attachmentsRes.data)) {
      attachments = (
        attachmentsRes.data as Array<{
          attachment_id: string;
          filename: string | null;
          content_type: string | null;
          size_bytes: number | null;
          extraction_status: string | null;
        }>
      ).map((a) => ({
        attachment_id: a.attachment_id,
        filename: a.filename ?? null,
        content_type: a.content_type ?? null,
        size_bytes: a.size_bytes ?? null,
        extraction_status: a.extraction_status ?? "pending",
      }));
    }
  }

  // (3c) Phase 132 Plan 03 (FWD-08) — the LAST forward outcome for this anchor
  //      message, keyed on email_id (public.info_routing_forwards, Plan 02). Read
  //      via the authenticated FOR SELECT policy. Used ONLY to derive the
  //      routing-slot forward_status when the verdict is routable (a held verdict
  //      with no forward yet has no row → null → 'held'; a sent row → 'forwarded').
  //      Swarm-agnostic: a non-routing swarm has no row → null → routing slot
  //      stays null anyway (it is gated on decision_details.routing below). A
  //      query error is non-fatal (mirrors the attachments handling) → null.
  let forwardState: { status: string } | null = null;
  if (anchorEmailId) {
    const forwardRes = await admin
      .from("info_routing_forwards")
      .select("status")
      .eq("email_id", anchorEmailId)
      .maybeSingle();
    if (forwardRes.error) {
      console.warn(
        `[hydrate] info_routing_forwards query failed for email_id=${anchorEmailId}: ${forwardRes.error.message}`,
      );
    } else if (isRecord(forwardRes.data)) {
      const status = asString(forwardRes.data.status);
      forwardState = status ? { status } : null;
    }
  }

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
    const rawBrand = asString(label?.entity_brand ?? null);
    if (rawBrand !== null) {
      if (brandCodes.size > 0 && !brandCodes.has(rawBrand)) {
        console.warn(
          `[hydrate] stage_2 entity_brand "${rawBrand}" not in swarms.entity_brand register for swarm="${opts.swarm_type}"; setting to null`,
        );
      } else if (!brandsForSwarm(opts.swarm_type).includes(rawBrand)) {
        console.warn(
          `[hydrate] stage_2 entity_brand "${rawBrand}" not in generated ENTITY_BRANDS_BY_SWARM[${opts.swarm_type}] literal-union; setting to null`,
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
    const customer_name: string | null = label?.debtor_name ?? null;

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
        asString(d.customer_account_id) ?? label?.customer_account_id ?? null,
      corrected_customer_account_id:
        label?.corrected_customer_account_id ?? null,
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
        // Compile-time literal-union guard (per-swarm map). Skip the guard
        // entirely for an un-seeded swarm whose SWARM_INTENTS_BY_SWARM entry is
        // empty (e.g. sales-email before its intents land in Plan 113) — there
        // is no closed list to validate against yet, so the registry guard
        // below (which also no-ops while swarm_intents is empty) is the sole
        // authority. For a seeded swarm (debtor) the list is non-empty and the
        // hard-separation filter stays fully active — byte-for-byte unchanged.
        const swarmIntentUnion = intentsForSwarm(opts.swarm_type);
        if (swarmIntentUnion.length > 0 && !swarmIntentUnion.includes(intent_key)) {
          // hard separation: a swarm_noise_categories value (e.g. "auto_reply")
          // would land here. Drop + warn so the operator surfaces it.
          console.warn(
            `[hydrate] stage_3 ranked_intent "${intent_key}" not in SWARM_INTENTS_BY_SWARM[${opts.swarm_type}] — filtered (hard separation: Stage 3 vocabulary is swarm_intents.intent_key only, NEVER a swarm_noise_categories key)`,
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
      intentsForSwarm(opts.swarm_type).includes(eventDecision)
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
  if (stage4Event || label?.draft_quality || label?.handler_key) {
    stage_4 = {
      handler_key: label?.handler_key ?? null,
      draft_quality: label?.draft_quality ?? null,
      feedback_reason: label?.feedback_reason ?? null,
      handler_output_kind: label?.handler_output_kind ?? null,
      pipeline_event_id: stage4Event?.id ?? null,
    };
  }

  // ----- Routing (Phase 132 Plan 03, FWD-08) -----------------------------
  // The persisted 6-field RoutingVerdict (Phase 131) lives at the stage-3
  // event's decision_details.routing. This slot is DATA-GATED: it is populated
  // ONLY when that key exists — debtor/sales rows (whose stage-3 decision_details
  // carry ranked/ranked_intents, never a `routing` object) leave it null. NO
  // swarm_type literal gates it (SWARM-02-safe). forward_status is DERIVED from
  // verdict fields + the info_routing_forwards mirror (read at step 3c).
  let routing: BulkReviewRoutingSlot | null = null;
  const routingRaw =
    stage3Event && isRecord(stage3Event.decision_details) &&
    isRecord(stage3Event.decision_details.routing)
      ? (stage3Event.decision_details.routing as Record<string, unknown>)
      : null;
  if (routingRaw) {
    // The coordinator_runs PK keying the persisted verdict — needed by the
    // operator routing actions (re-route / forward-now). Looked up by email_id
    // (the same anchor) ONLY when a routing verdict is present, so non-routing
    // swarms add no round-trip. Null when not resolvable (legacy rows).
    let routing_run_id: string | null = null;
    if (anchorEmailId) {
      const runRes = await admin
        .from("coordinator_runs")
        .select("run_id")
        .eq("email_id", anchorEmailId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!runRes.error && isRecord(runRes.data)) {
        routing_run_id = asString(runRes.data.run_id);
      }
    }

    const bucket = asString(routingRaw.bucket) ?? "unrouted";
    const brand = asString(routingRaw.brand);
    const target_mailbox = asString(routingRaw.target_mailbox);
    const rawConf = asString(routingRaw.confidence);
    const confidence: "low" | "medium" | "high" =
      rawConf === "high" || rawConf === "medium" || rawConf === "low"
        ? rawConf
        : "low";
    const dedup = isRecord(routingRaw.dedup) ? routingRaw.dedup : {};
    const dedup_status: "routable" | "already_addressed" =
      asString(dedup.status) === "already_addressed"
        ? "already_addressed"
        : "routable";
    const dedup_layer = asString(dedup.matched_layer);
    const unrouted = routingRaw.unrouted === true;

    // forward_status derivation (verdict-first; falls back to the live mirror).
    let forward_status: RoutingForwardStatus;
    if (unrouted) {
      forward_status = "unrouted";
    } else if (target_mailbox === null) {
      forward_status = "stays"; // matched no-forward bucket (e.g. algemeen)
    } else if (dedup_status === "already_addressed") {
      forward_status = "dedup-skipped";
    } else {
      forward_status = forwardState?.status === "sent" ? "forwarded" : "held";
    }

    routing = {
      bucket,
      brand,
      target_mailbox,
      confidence,
      dedup_status,
      dedup_layer,
      unrouted,
      forward_status,
      run_id: routing_run_id,
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
    axis_2_corrected_customer_account_id:
      label?.corrected_customer_account_id ?? null,
    axis_2_reviewed_by: label?.reviewed_by ?? null,
    axis_2_reviewed_at: label?.reviewed_at ?? null,
    axis_4_draft_quality: label?.draft_quality ?? null,
    axis_4_feedback_reason: label?.feedback_reason ?? null,
    axis_3_event_ids,
  };

  return {
    // For non-debtor swarms there is no email_labels row, so email_label_id
    // falls back to the email_label_id the caller passed (debtor) or the
    // email_id anchor (generic). The BulkReviewRow.email_label_id field is the
    // row's stable React key; the anchor email_id is the cross-swarm identity.
    email_label_id: label?.id ?? opts.email_label_id ?? anchorEmailId,
    swarm_type: label?.swarm_type ?? opts.swarm_type,
    email_id: label?.email_id ?? (anchorEmailId || null),
    context_version: BULK_REVIEW_ROW_VERSION,
    stage_0,
    stage_1,
    stage_2,
    stage_3,
    stage_3p5,
    stage_4,
    routing,
    overrides,
    // Phase 116-05 (D-08) — Stage-2 attachment metadata loaded at step (3b).
    attachments,
  };
}
