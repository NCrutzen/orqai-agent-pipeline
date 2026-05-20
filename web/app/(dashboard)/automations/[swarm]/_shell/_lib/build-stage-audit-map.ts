// Phase 82.3 Plan 11 — JSONB → StageAuditPayload mapper.
// HARD-SEPARATION LOCK:
//   - Stage 1 payload.rule_key sourced from pipeline_events.decision_details
//     (closed list: swarm_noise_categories keys ∪ {"unknown"}).
//   - Stage 3 payload.ranked_intents sourced from agent_runs.tool_outputs
//     for stage=3 ONLY (swarm_intents taxonomy).
//   - Mappers MUST NOT cross-populate. If a future RFC ever conflates the
//     two registries, fix the RFC first — do not bend this mapper.
//
// Pure function. Returns React nodes via React.createElement so this file
// stays `.ts` (no JSX). Inputs are intentionally tolerant: malformed JSONB
// shapes default to null / [] — never throw. The four Stage{N}EvidencePanel
// components own all rendering — this file only shapes the payloads.

import { createElement, type ReactNode } from "react";

import { Stage0EvidencePanel } from "@/components/automations/bulk-review/audit/Stage0EvidencePanel";
import { Stage1EvidencePanel } from "@/components/automations/bulk-review/audit/Stage1EvidencePanel";
import { Stage2EvidencePanel } from "@/components/automations/bulk-review/audit/Stage2EvidencePanel";
import { Stage3EvidencePanel } from "@/components/automations/bulk-review/audit/Stage3EvidencePanel";

import type {
  Stage0AuditPayload,
  Stage1AuditPayload,
  Stage2AuditPayload,
  Stage2InputsView,
  CandidateView,
  Stage3AuditPayload,
  StageAuditMap,
} from "./audit-types";

// Minimal local shape — keep this loosely typed so callers passing the richer
// page-level PipelineTimelineEvent shape (with id/created_at/override/...)
// remain assignable. We only need `stage` + `decision_details` here.
// Mapper input shapes are intentionally minimal so callers can pass the
// richer page-level PipelineTimelineEvent (with id/created_at/override/
// eval_type/triggered_by/...) without type gymnastics. Generic params let
// TypeScript accept the structural superset without dropping inferred fields.
export interface MapperTimelineEvent {
  stage: number;
  decision_details: Record<string, unknown> | null;
  // Optional — used by Stage 0 verdict derivation (the worker's
  // decision_details has no `llm_injection_verdict` key; the verdict
  // lives on `pipeline_events.decision` itself: 'safe' | 'injection_suspected').
  decision?: string | null;
  // Optional — Stage 2 confidence is emitted numerically on the
  // pipeline_events row (the label-resolver writes no agent_runs row,
  // so this is the only confidence channel available to the audit UI).
  confidence?: number | null;
}

export interface MapperAgentRun {
  stage: number;
  context: Record<string, unknown> | null;
  tool_outputs: Record<string, unknown> | null;
}

export interface MapperAutomationRun {
  result: Record<string, unknown> | null;
}

export interface BuildStageAuditMapInput<
  T extends MapperTimelineEvent = MapperTimelineEvent,
  R extends MapperAgentRun = MapperAgentRun,
  A extends MapperAutomationRun = MapperAutomationRun,
> {
  timeline: ReadonlyArray<T>;
  agentRuns?: ReadonlyArray<R>;
  automationRun?: A | null;
}

// ---- helpers -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function numericToLabel(
  v: unknown,
): "high" | "medium" | "low" | null {
  const n = asNumber(v);
  if (n === null) return null;
  if (n >= 0.75) return "high";
  if (n >= 0.5) return "medium";
  return "low";
}

function textConfidenceLabel(
  v: unknown,
): "high" | "medium" | "low" | null {
  if (v === "high" || v === "medium" || v === "low") return v;
  return null;
}

const STAGE0_VERDICTS = ["clean", "flagged", "unknown"] as const;
type Stage0Verdict = (typeof STAGE0_VERDICTS)[number];
function asStage0Verdict(v: unknown): Stage0Verdict | null {
  return STAGE0_VERDICTS.includes(v as Stage0Verdict)
    ? (v as Stage0Verdict)
    : null;
}

const STAGE2_SOURCES = [
  "thread",
  "sender",
  "identifier",
  "unresolved",
] as const;
type Stage2Source = (typeof STAGE2_SOURCES)[number];
function asStage2Source(v: unknown): Stage2Source | null {
  return STAGE2_SOURCES.includes(v as Stage2Source)
    ? (v as Stage2Source)
    : null;
}

function asTopCandidates(
  v: unknown,
): Array<{ account_id: string; name: string; score: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ account_id: string; name: string; score: number }> = [];
  for (const c of v) {
    if (!isRecord(c)) continue;
    const account_id = asString(c.account_id);
    const name = asString(c.name);
    const score = asNumber(c.score);
    if (account_id !== null && name !== null && score !== null) {
      out.push({ account_id, name, score });
    }
  }
  return out;
}

// Phase 82.9 — tolerant narrowing for Stage 2 candidate evidence (D-03).
// Enforces Tier-3 of the three-tier `recent_invoices.length <= 5` bound
// (Tier 1: SQL LIMIT 5, Tier 2: Zod .max(5), Tier 3: this slice).
function asCandidates(v: unknown): CandidateView[] {
  if (!Array.isArray(v)) return [];
  const out: CandidateView[] = [];
  for (const c of v) {
    if (!isRecord(c)) continue;
    const id = asString(c.id);
    const name = asString(c.name);
    if (id === null || name === null) continue;
    out.push({
      id,
      name,
      contact_person: asString(c.contact_person),
      recent_invoices: asStringArray(c.recent_invoices).slice(0, 5),
    });
  }
  return out;
}

function asRankedIntents(
  v: unknown,
): Array<{
  intent_key: string;
  confidence: number;
  reasoning?: string | null;
  sub_type?: string | null;
  document_reference?: string | null;
}> {
  if (!Array.isArray(v)) return [];
  const out: Array<{
    intent_key: string;
    confidence: number;
    reasoning?: string | null;
    sub_type?: string | null;
    document_reference?: string | null;
  }> = [];
  for (const r of v) {
    if (!isRecord(r)) continue;
    // Accept both the canonical audit shape ({intent_key, confidence:number})
    // and the runtime coordinator shape ({intent, confidence:label}) from
    // pipeline_events.decision_details.ranked / agent_runs.tool_outputs
    // .intent_first_pass.ranked. The runtime is authoritative; the audit
    // shape is a normalised projection.
    const intent_key = asString(r.intent_key) ?? asString(r.intent);
    let confidence = asNumber(r.confidence);
    if (confidence === null) {
      const label = asString(r.confidence);
      if (label === "high") confidence = 0.9;
      else if (label === "medium") confidence = 0.7;
      else if (label === "low") confidence = 0.4;
    }
    if (intent_key !== null && confidence !== null) {
      out.push({
        intent_key,
        confidence,
        reasoning: asString(r.reasoning),
        sub_type: asString(r.sub_type),
        document_reference: asString(r.document_reference),
      });
    }
  }
  return out;
}

function asStage3Inputs(
  v: unknown,
):
  | {
      sender_email?: string | null;
      sender_domain?: string | null;
      mailbox?: string | null;
      entity?: string | null;
      subject_excerpt?: string | null;
      received_at?: string | null;
    }
  | null {
  if (!isRecord(v)) return null;
  return {
    sender_email: asString(v.sender_email),
    sender_domain: asString(v.sender_domain),
    mailbox: asString(v.mailbox),
    entity: asString(v.entity),
    subject_excerpt: asString(v.subject_excerpt),
    received_at: asString(v.received_at),
  };
}

/**
 * Pull `before` / `after` screenshot paths from automation_runs.result.
 * Accepts two shapes:
 *   - `result.screenshots = { before, after }`
 *   - keys ending in `_before.png` / `_after.png` on `result.screenshot_paths`
 *     or on the result object itself.
 */
function extractScreenshotPaths(
  result: Record<string, unknown> | null | undefined,
): { before: string | null; after: string | null } {
  if (!isRecord(result)) return { before: null, after: null };

  // Shape 1: result.screenshots.{before,after}
  const screenshots = result.screenshots;
  if (isRecord(screenshots)) {
    return {
      before: asString(screenshots.before),
      after: asString(screenshots.after),
    };
  }

  // Shape 2: result.screenshot_paths.{before,after}
  const sp = result.screenshot_paths;
  if (isRecord(sp)) {
    let before = asString(sp.before);
    let after = asString(sp.after);
    if (before === null || after === null) {
      // Shape 2b: scan keys ending in _before.png / _after.png on screenshot_paths
      for (const [k, val] of Object.entries(sp)) {
        const s = asString(val);
        if (s === null) continue;
        if (before === null && k.endsWith("_before.png")) before = s;
        if (after === null && k.endsWith("_after.png")) after = s;
      }
    }
    return { before, after };
  }

  // Shape 3: scan top-level result keys ending in _before.png / _after.png
  let before: string | null = null;
  let after: string | null = null;
  for (const [k, val] of Object.entries(result)) {
    const s = asString(val);
    if (s === null) continue;
    if (before === null && k.endsWith("_before.png")) before = s;
    if (after === null && k.endsWith("_after.png")) after = s;
  }
  return { before, after };
}

// ---- mapper --------------------------------------------------------------

export function buildStageAuditMap<
  T extends MapperTimelineEvent,
  R extends MapperAgentRun,
  A extends MapperAutomationRun,
>(input: BuildStageAuditMapInput<T, R, A>): StageAuditMap {
  const timeline = Array.isArray(input.timeline) ? input.timeline : [];
  const agentRuns = Array.isArray(input.agentRuns) ? input.agentRuns : [];
  const automationRun = input.automationRun ?? null;

  const stage0Event = timeline.find((e) => e?.stage === 0) ?? null;
  const stage1Event = timeline.find((e) => e?.stage === 1) ?? null;
  const stage2Event = timeline.find((e) => e?.stage === 2) ?? null;
  const stage3Event = timeline.find((e) => e?.stage === 3) ?? null;
  const stage1Run = agentRuns.find((r) => r?.stage === 1) ?? null;
  const stage2Run = agentRuns.find((r) => r?.stage === 2) ?? null;
  const stage3Run = agentRuns.find((r) => r?.stage === 3) ?? null;

  const map: StageAuditMap = {};

  // ----- Stage 0 ---------------------------------------------------------
  if (stage0Event) {
    const d = isRecord(stage0Event.decision_details)
      ? stage0Event.decision_details
      : {};
    // 2026-05-19 — schema bridge between stage-0-safety-worker and the audit UI.
    // Worker (computeEmitPayload, stage-0-safety-worker.ts) emits:
    //   { regex_matched: string|null, llm_reason: string|null, matched_span, ... }
    // Reader expected the older Plan 02 schema (regex_patterns_fired[], llm_reasoning,
    // llm_injection_verdict, budget_headroom_cents). Bridge both: prefer the
    // canonical keys when present, fall back to the worker's keys, and derive
    // the injection verdict from pipeline_events.decision (the worker doesn't
    // duplicate it inside decision_details).
    const regexFromArray = asStringArray(d.regex_patterns_fired);
    const regexFromScalar = asString(d.regex_matched);
    const regex_patterns_fired =
      regexFromArray.length > 0
        ? regexFromArray
        : regexFromScalar
          ? [regexFromScalar]
          : [];
    const llm_reasoning = asString(d.llm_reasoning) ?? asString(d.llm_reason);
    const explicitVerdict = asStage0Verdict(d.llm_injection_verdict);
    const derivedVerdict: Stage0Verdict | null =
      stage0Event.decision === "injection_suspected"
        ? "flagged"
        : stage0Event.decision === "safe"
          ? "clean"
          : null;
    const payload: Stage0AuditPayload = {
      stage: 0,
      regex_patterns_fired,
      llm_injection_verdict: explicitVerdict ?? derivedVerdict,
      llm_reasoning,
      budget_headroom_cents: asNumber(d.budget_headroom_cents),
      raw: d,
    };
    map[0] = createElement(Stage0EvidencePanel, { payload }) as ReactNode;
  }

  // ----- Stage 1 ---------------------------------------------------------
  // Source: pipeline_events.decision_details (Stage 1 emit) optionally
  // enriched by agent_runs.tool_outputs.reasoning when LLM Pass-2 fired.
  // HARD-SEPARATION LOCK: rule_key from swarm_noise_categories ∪ {"unknown"}
  // only — NEVER cross-populated from swarm_intents.
  if (stage1Event || stage1Run) {
    const d = isRecord(stage1Event?.decision_details)
      ? (stage1Event!.decision_details as Record<string, unknown>)
      : {};
    const tool = isRecord(stage1Run?.tool_outputs)
      ? (stage1Run!.tool_outputs as Record<string, unknown>)
      : {};
    // Phase 82.3 fidelity fix (Plan 11 follow-up): the runtime classifier
    // writes predictor + llm_reasoning + llm_confidence into pipeline_events
    // .decision_details directly. Reading from there is authoritative and
    // works without loading agent_runs per-row.
    // Runtime predictor values: "regex" (Pass-1 match) and "llm_2nd_pass"
    // (Pass-2 LLM). Normalise to the {"regex","llm"} UI vocabulary.
    const detailsPredictor = typeof d.predictor === "string" ? d.predictor : null;
    const predictor_source: "regex" | "llm" | null =
      detailsPredictor === "regex"
        ? "regex"
        : detailsPredictor === "llm" || detailsPredictor === "llm_2nd_pass" ||
          detailsPredictor === "llm_pass_2" || detailsPredictor?.startsWith("llm")
          ? "llm"
          : stage1Run
            ? "llm"
            : stage1Event
              ? "regex"
              : null;
    // Rule that fired: regex.matchedRule when Pass-1 hit, else the resulting
    // category as a fallback discriminator. Both come from decision_details.
    const regexBlock = isRecord(d.regex) ? (d.regex as Record<string, unknown>) : null;
    const matchedRule = regexBlock ? asString(regexBlock.matchedRule) : null;
    const category = asString(d.category) ?? asString(stage1Event?.decision);
    // llm_confidence is already a string label ("high"/"medium"/"low"); fall
    // back to the legacy numeric `confidence` field via numericToLabel().
    const confidence = textConfidenceLabel(d.llm_confidence) ?? numericToLabel(d.confidence);
    // Reasoning lives on decision_details.llm_reasoning (set by the screen
    // worker), not only on agent_runs.tool_outputs.reasoning.
    const reasoning = asString(d.llm_reasoning) ?? asString(tool.reasoning);
    const payload: Stage1AuditPayload = {
      stage: 1,
      rule_key: matchedRule ?? category,
      predictor_source,
      confidence,
      reasoning,
      raw: { ...d, ...tool },
    };
    map[1] = createElement(Stage1EvidencePanel, { payload }) as ReactNode;
  }

  // ----- Stage 2 ---------------------------------------------------------
  // 2026-05-19 — schema bridge between classifier-label-resolver and the
  // audit UI. The resolver writes evidence to pipeline_events.decision_details
  // (customer_account_id, customer_name, method, candidates_considered) +
  // pipeline_events.confidence (numeric). It does NOT write an agent_runs row
  // for Stage 2, so reading from stage2Run.context alone yields an all-null
  // payload and the panel falls into its empty-state branch. Bridge: prefer
  // the new agent_runs.context shape when present (forward-compatible), fall
  // back to pipeline_events.decision_details with `method` mapped to the
  // Stage2Source UI vocab. Same pattern as the Stage 0/1 bridges above.
  if (stage2Event || stage2Run) {
    const ctx = isRecord(stage2Run?.context)
      ? (stage2Run!.context as Record<string, unknown>)
      : {};
    const d = isRecord(stage2Event?.decision_details)
      ? (stage2Event!.decision_details as Record<string, unknown>)
      : {};
    const result = isRecord(automationRun?.result)
      ? (automationRun!.result as Record<string, unknown>)
      : null;

    // identifier_source: prefer ctx.identifier_source (new shape); fall back
    // to mapping decision_details.method → Stage2Source. When the event's
    // decision is "unresolved", surface the destructive chip directly.
    const ctxSource = asStage2Source(ctx.identifier_source);
    const method = asString(d.method);
    const methodMapped: Stage2Source | null =
      method === "thread_inheritance"
        ? "thread"
        : method === "sender_match"
          ? "sender"
          : method === "identifier_match" || method === "llm_tiebreaker"
            ? "identifier"
            : method === "unresolved"
              ? "unresolved"
              : null;
    const unresolvedByDecision: Stage2Source | null =
      stage2Event?.decision === "unresolved" ? "unresolved" : null;
    const identifier_source =
      ctxSource ?? methodMapped ?? unresolvedByDecision;

    // confidence: prefer ctx.confidence (new shape, either label or numeric);
    // fall back to numeric pipeline_events.confidence on the event row.
    const confidence =
      textConfidenceLabel(ctx.confidence) ??
      numericToLabel(ctx.confidence) ??
      numericToLabel(stage2Event?.confidence ?? null);

    // top_candidates: prefer ctx.top_candidates (new shape, array of triples);
    // fall back to a single-item list for the resolved customer. The
    // resolver's `candidates_considered` is a count, not an array, so we
    // can't reconstruct a full candidate list from pipeline_events alone.
    let top_candidates = asTopCandidates(ctx.top_candidates);
    if (top_candidates.length === 0) {
      const accId = asString(d.customer_account_id);
      const name = asString(d.customer_name);
      const score = asNumber(stage2Event?.confidence ?? null);
      if (accId !== null && name !== null) {
        top_candidates = [{ account_id: accId, name, score: score ?? 0 }];
      }
    }

    // Phase 82.9 — discriminated evidence (D-01). Legacy rows have no `inputs`
    // key in decision_details (D-04 — detect via `isRecord(d.inputs)` per
    // Pitfall 3, NOT via `method == null`). Unknown future methods tolerantly
    // degrade to legacy render via the `default:` arm — mapper NEVER throws.
    const inputsRaw = isRecord(d.inputs) ? d.inputs : null;
    const methodKey = asString(d.method);

    let stage2Inputs: Stage2InputsView | null = null;
    let candidates: CandidateView[] | undefined;
    let reasoning: string | null = null;

    if (inputsRaw !== null) {
      switch (methodKey) {
        case "thread_inheritance":
          stage2Inputs = {
            kind: "thread_inheritance",
            prior_email_label_id: asString(inputsRaw.prior_email_label_id) ?? "",
            conversation_id: asString(inputsRaw.conversation_id) ?? "",
          };
          break;
        case "sender_match":
          candidates = asCandidates(inputsRaw.candidates);
          stage2Inputs = {
            kind: "sender_match",
            sender_email: asString(inputsRaw.sender_email) ?? "",
            candidates,
          };
          break;
        case "identifier_match":
          candidates = asCandidates(inputsRaw.candidates);
          stage2Inputs = {
            kind: "identifier_match",
            matched_identifiers: asStringArray(inputsRaw.matched_identifiers),
            candidates,
          };
          break;
        case "llm_tiebreaker":
          candidates = asCandidates(inputsRaw.candidates);
          reasoning = asString(inputsRaw.llm_reason);
          stage2Inputs = {
            kind: "llm_tiebreaker",
            sender_email: asString(inputsRaw.sender_email),
            matched_identifiers: asStringArray(inputsRaw.matched_identifiers),
            candidates,
            llm_reason: reasoning ?? "",
          };
          break;
        case "unresolved":
          stage2Inputs = {
            kind: "unresolved",
            sender_email: asString(inputsRaw.sender_email),
            matched_identifiers: asStringArray(inputsRaw.matched_identifiers),
          };
          break;
        default:
          // Tolerant: unknown future method falls back to legacy render (D-04).
          stage2Inputs = null;
      }
    }

    const payload: Stage2AuditPayload = {
      stage: 2,
      identifier_source,
      confidence,
      top_candidates,
      screenshot_paths: extractScreenshotPaths(result),
      inputs: stage2Inputs,
      candidates,
      reasoning,
      raw: { ...d, ...ctx, ...(result ?? {}) },
    };
    map[2] = createElement(Stage2EvidencePanel, { payload }) as ReactNode;
  }

  // ----- Stage 3 ---------------------------------------------------------
  // Source: agent_runs[stage=3].tool_outputs. HARD-SEPARATION LOCK:
  // ranked_intents[].intent_key drawn from swarm_intents taxonomy ONLY.
  //
  // Skip-empty contract: when this mapper is invoked with an empty agentRuns
  // array (the live-timeline rebuild path inside detail-pane.tsx), we cannot
  // reconstruct ranked_intents / coordinator_reasoning. If the resulting
  // payload would be entirely empty, DO NOT emit a map entry — that lets the
  // page-level stageAudit (which was built with the full agentRuns fetch)
  // win the merge in detail-pane.tsx's effectiveStageAudit useMemo. Without
  // this guard, an empty live-timeline Stage 3 payload silently shadows the
  // page-level one and the operator sees "No ranked intents returned by
  // coordinator." even for rows that did produce ranked intents.
  if (stage3Event || stage3Run) {
    const tool = isRecord(stage3Run?.tool_outputs)
      ? (stage3Run!.tool_outputs as Record<string, unknown>)
      : {};
    const d = isRecord(stage3Event?.decision_details)
      ? (stage3Event!.decision_details as Record<string, unknown>)
      : {};
    // 2026-05-19 — schema bridge between debtor-email-coordinator and the
    // audit UI. The coordinator writes:
    //   - agent_runs.tool_outputs.intent_first_pass = IntentAgentOutputV2
    //     (shape: { ranked: [{intent, confidence:label, reasoning, ...}],
    //       language, urgency, intent_version })
    //   - pipeline_events.decision_details = { ranked, language, urgency }
    //   - pipeline_events.decision = top.intent (the selected intent_key)
    // The canonical Stage3AuditPayload uses {intent_key, confidence:number}
    // and reads `coordinator_reasoning` + `selected_intent_key` at the top
    // level. Bridge: try the canonical keys first, then fall back to the
    // runtime shapes (intent_first_pass.ranked / decision_details.ranked /
    // top.reasoning / pipeline_events.decision).
    const firstPass = isRecord(tool.intent_first_pass)
      ? (tool.intent_first_pass as Record<string, unknown>)
      : {};
    const rankedRaw =
      (Array.isArray(tool.ranked_intents) && tool.ranked_intents) ||
      (Array.isArray(firstPass.ranked) && firstPass.ranked) ||
      (Array.isArray(d.ranked) && d.ranked) ||
      null;
    const ranked_intents = asRankedIntents(rankedRaw);
    // Coordinator reasoning: prefer the canonical key on tool_outputs, then
    // top-1 reasoning from the ranked array. The coordinator hoists top-1
    // reasoning onto agent_runs.reasoning, but that column isn't in the
    // MapperAgentRun shape — sourcing from ranked[0].reasoning is equivalent.
    const coordinator_reasoning =
      asString(tool.coordinator_reasoning) ??
      asString(firstPass.reasoning) ??
      (isRecord(rankedRaw?.[0]) ? asString(rankedRaw[0].reasoning) : null);
    const selected_intent_key =
      asString(tool.selected_intent_key) ??
      asString(stage3Event?.decision) ??
      (isRecord(rankedRaw?.[0])
        ? asString(rankedRaw[0].intent_key) ?? asString(rankedRaw[0].intent)
        : null);
    if (
      ranked_intents.length > 0 ||
      coordinator_reasoning !== null ||
      selected_intent_key !== null
    ) {
      // 2026-05-19 — Stage 3 audit-panel evidence expansion.
      // Pull language/urgency/intent_version/inputs from decision_details
      // first (canonical writer surface), fall back to agent_runs.tool_outputs
      // .intent_first_pass for runs predating the coordinator writer change.
      const language =
        asString(d.language) ?? asString(firstPass.language);
      const urgency =
        asString(d.urgency) ?? asString(firstPass.urgency);
      const intent_version =
        asString(d.intent_version) ?? asString(firstPass.intent_version);
      const inputs =
        asStage3Inputs(d.inputs) ?? asStage3Inputs(firstPass.inputs);
      const payload: Stage3AuditPayload = {
        stage: 3,
        ranked_intents,
        coordinator_reasoning,
        selected_intent_key,
        language,
        urgency,
        intent_version,
        inputs,
        raw: { ...d, ...tool },
      };
      map[3] = createElement(Stage3EvidencePanel, { payload }) as ReactNode;
    }
  }

  return map;
}
