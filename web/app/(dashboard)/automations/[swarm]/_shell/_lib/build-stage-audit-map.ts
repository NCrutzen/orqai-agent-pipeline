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

function asRankedIntents(
  v: unknown,
): Array<{ intent_key: string; confidence: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ intent_key: string; confidence: number }> = [];
  for (const r of v) {
    if (!isRecord(r)) continue;
    const intent_key = asString(r.intent_key);
    const confidence = asNumber(r.confidence);
    if (intent_key !== null && confidence !== null) {
      out.push({ intent_key, confidence });
    }
  }
  return out;
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
    const payload: Stage0AuditPayload = {
      stage: 0,
      regex_patterns_fired: asStringArray(d.regex_patterns_fired),
      llm_injection_verdict: asStage0Verdict(d.llm_injection_verdict),
      llm_reasoning: asString(d.llm_reasoning),
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
  if (stage2Event || stage2Run) {
    const ctx = isRecord(stage2Run?.context)
      ? (stage2Run!.context as Record<string, unknown>)
      : {};
    const result = isRecord(automationRun?.result)
      ? (automationRun!.result as Record<string, unknown>)
      : null;
    const payload: Stage2AuditPayload = {
      stage: 2,
      identifier_source: asStage2Source(ctx.identifier_source),
      confidence:
        textConfidenceLabel(ctx.confidence) ?? numericToLabel(ctx.confidence),
      top_candidates: asTopCandidates(ctx.top_candidates),
      screenshot_paths: extractScreenshotPaths(result),
      raw: { ...ctx, ...(result ?? {}) },
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
    const ranked_intents = asRankedIntents(tool.ranked_intents);
    const coordinator_reasoning = asString(tool.coordinator_reasoning);
    const selected_intent_key = asString(tool.selected_intent_key);
    if (
      ranked_intents.length > 0 ||
      coordinator_reasoning !== null ||
      selected_intent_key !== null
    ) {
      const payload: Stage3AuditPayload = {
        stage: 3,
        ranked_intents,
        coordinator_reasoning,
        selected_intent_key,
        raw: tool,
      };
      map[3] = createElement(Stage3EvidencePanel, { payload }) as ReactNode;
    }
  }

  return map;
}
