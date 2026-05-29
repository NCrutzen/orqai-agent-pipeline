// Phase 4 Plan 01 — pure clustering over pipeline_events override rows.
//
// Dispatch on pipeline_events.eval_type per docs/agentic-pipeline/override-model.md:
//   category-correction  → Stage 1 Filter rule candidate (regex_rule)
//   entity-correction    → Stage 2 Known sender candidate (sender_mapping)
//   intent-correction    → Stage 3 AI tuning OR New topic candidate
//   handler-quality      → Stage 4 Draft style candidate (prompt_tune_stage_4)
//
// Heuristics (planner-locked, Claude's Discretion per CONTEXT.md):
//   - regex_rule: group by repeated lowercase 3-gram (≥ 12 chars) found across
//     ≥ 3 rows' subject lines. Subject sourced from override.subject if present
//     else decision_details.subject (defensive).
//   - sender_mapping: group by (sender_domain, override.new_customer_account_id).
//   - prompt_tune_stage_3 / new_intent: group by (override.intent_key, sender_domain);
//     new_intent vs prompt_tune is decided by `known_intent_keys` parameter
//     (passed in by the cron after a registry lookup at call time).
//   - prompt_tune_stage_4: group by (override.verdict_category, sender_domain).
//
// All clusters below CLUSTER_MIN_EVIDENCE (=3) are dropped.
//
// signature_key formula: sha256(stableJSON({kind, swarm_type, ...discriminators})).
// Deterministic regardless of input order — Test 5 in cluster.test.ts asserts.

import { createHash } from "node:crypto";
import type {
  PromotionKind,
  PromotionStage,
  RefinementPayload,
} from "./types";

export const CLUSTER_MIN_EVIDENCE = 3;

export interface PipelineEventOverrideRow {
  id: string;
  swarm_type: string;
  email_id: string | null;
  stage: number; // smallint 0..4 per pipeline_events schema
  eval_type:
    | "category-correction"
    | "entity-correction"
    | "intent-correction"
    | "handler-quality"
    | string;
  override: Record<string, unknown> & {
    new_customer_account_id?: string;
    new_category_key?: string;
    intent_key?: string;
    verdict_category?: string;
    verdict?: string;
    subject?: string;
    sender_email?: string;
  };
  decision: string;
  decision_details: Record<string, unknown> | null;
  cost_cents: number | null;
  created_at: string;
}

export interface ClusterDraft {
  kind: PromotionKind;
  swarm_type: string;
  stage: PromotionStage;
  signature_key: string;
  structured_payload: RefinementPayload;
  evidence_event_ids: string[];
  evidence_email_ids: string[];
  matched_event_count_30d: number;
  confirm_rate: number;
  avg_replaced_cost_cents: number;
  avg_promoted_cost_cents: number;
}

export interface ClusterOptions {
  /** Intent keys already registered in swarm_intents — used to discriminate
   *  prompt_tune_stage_3 from new_intent. Caller (cron) hydrates this once. */
  known_intent_keys?: ReadonlySet<string>;
}

export function clusterOverrideEvents(
  rows: PipelineEventOverrideRow[],
  opts: ClusterOptions = {},
): ClusterDraft[] {
  const drafts: ClusterDraft[] = [];

  const byEvalType = groupBy(rows, (r) => r.eval_type);

  for (const [evalType, group] of byEvalType.entries()) {
    switch (evalType) {
      case "category-correction":
        drafts.push(...clusterRegexRule(group));
        break;
      case "entity-correction":
        drafts.push(...clusterSenderMapping(group));
        break;
      case "intent-correction":
        drafts.push(...clusterIntentCorrection(group, opts.known_intent_keys));
        break;
      case "handler-quality":
        drafts.push(...clusterHandlerQuality(group));
        break;
      default:
        // Unknown eval_type — skip silently (forward compat).
        break;
    }
  }

  return drafts;
}

// ---- per-kind clusterers -------------------------------------------------

function clusterRegexRule(
  rows: PipelineEventOverrideRow[],
): ClusterDraft[] {
  // Repeated lowercase 3-gram of ≥ 12 chars across subjects.
  const subjects = rows.map((r) => ({
    row: r,
    subject: extractSubject(r).toLowerCase().trim(),
  }));

  // Candidate substrings: every length-12+ window from each subject.
  const subToRows = new Map<string, PipelineEventOverrideRow[]>();
  for (const { row, subject } of subjects) {
    const seenInThisRow = new Set<string>();
    for (let len = 12; len <= Math.min(40, subject.length); len++) {
      for (let i = 0; i + len <= subject.length; i++) {
        const sub = subject.slice(i, i + len);
        if (seenInThisRow.has(sub)) continue;
        seenInThisRow.add(sub);
        let bucket = subToRows.get(sub);
        if (!bucket) {
          bucket = [];
          subToRows.set(sub, bucket);
        }
        bucket.push(row);
      }
    }
  }

  // Pick the longest substrings that hit ≥ CLUSTER_MIN_EVIDENCE rows. Greedily
  // claim rows so we don't emit overlapping shorter sub-clusters.
  const ranked = [...subToRows.entries()]
    .filter(([, bucket]) => uniqueRowCount(bucket) >= CLUSTER_MIN_EVIDENCE)
    .sort((a, b) => b[0].length - a[0].length);

  const claimed = new Set<string>();
  const drafts: ClusterDraft[] = [];

  for (const [pattern, bucket] of ranked) {
    const unclaimed = dedupeRows(bucket).filter((r) => !claimed.has(r.id));
    if (unclaimed.length < CLUSTER_MIN_EVIDENCE) continue;
    for (const r of unclaimed) claimed.add(r.id);

    const swarm_type = unclaimed[0].swarm_type;
    const senderDomains = uniqueSenderDomains(unclaimed);
    const senderFilter =
      senderDomains.length > 0 && senderDomains.length <= 3
        ? senderDomains
        : undefined;

    const structured: RefinementPayload = {
      kind: "regex_rule",
      subject_pattern: pattern,
      sender_filter: senderFilter,
    };

    drafts.push(buildDraft({
      kind: "regex_rule",
      stage: "1-noise",
      swarm_type,
      rows: unclaimed,
      structured,
      discriminators: { pattern, sender_filter: senderFilter ?? [] },
    }));
  }

  return drafts;
}

function clusterSenderMapping(
  rows: PipelineEventOverrideRow[],
): ClusterDraft[] {
  const byKey = groupBy(rows, (r) => {
    const domain = senderDomain(r) ?? "";
    const cust = r.override.new_customer_account_id ?? "";
    return `${domain}::${cust}`;
  });

  const drafts: ClusterDraft[] = [];
  for (const [key, group] of byKey.entries()) {
    if (group.length < CLUSTER_MIN_EVIDENCE) continue;
    const [domain, cust] = key.split("::");
    if (!domain || !cust) continue;
    const swarm_type = group[0].swarm_type;
    const structured: RefinementPayload = {
      kind: "sender_mapping",
      sender_pattern: domain,
      customer_account_id: cust,
    };
    drafts.push(buildDraft({
      kind: "sender_mapping",
      stage: "2-customer",
      swarm_type,
      rows: group,
      structured,
      discriminators: { sender_pattern: domain, customer_account_id: cust },
    }));
  }
  return drafts;
}

function clusterIntentCorrection(
  rows: PipelineEventOverrideRow[],
  knownIntentKeys: ReadonlySet<string> | undefined,
): ClusterDraft[] {
  const byKey = groupBy(rows, (r) => {
    const intent = (r.override.intent_key as string | undefined) ?? "";
    const domain = senderDomain(r) ?? "";
    return `${intent}::${domain}`;
  });

  const drafts: ClusterDraft[] = [];
  for (const [key, group] of byKey.entries()) {
    if (group.length < CLUSTER_MIN_EVIDENCE) continue;
    const [intent, domain] = key.split("::");
    if (!intent) continue;
    const swarm_type = group[0].swarm_type;
    const known = knownIntentKeys?.has(intent) ?? true;
    if (known) {
      const structured: RefinementPayload = {
        kind: "prompt_tune_stage_3",
        eval_type_seed: "intent-correction",
        sender_domain: domain || undefined,
        intent_key: intent,
      };
      drafts.push(buildDraft({
        kind: "prompt_tune_stage_3",
        stage: "3-coordinator",
        swarm_type,
        rows: group,
        structured,
        discriminators: { intent_key: intent, sender_domain: domain },
      }));
    } else {
      const structured: RefinementPayload = {
        kind: "new_intent",
        intent_key_candidate: intent,
        handler_event: `${swarm_type}/${intent}.requested`,
        handler_status: "placeholder",
      };
      drafts.push(buildDraft({
        kind: "new_intent",
        stage: "3-coordinator",
        swarm_type,
        rows: group,
        structured,
        discriminators: { intent_key_candidate: intent, sender_domain: domain },
      }));
    }
  }
  return drafts;
}

function clusterHandlerQuality(
  rows: PipelineEventOverrideRow[],
): ClusterDraft[] {
  const byKey = groupBy(rows, (r) => {
    const verdict =
      (r.override.verdict_category as string | undefined) ??
      (r.override.verdict as string | undefined) ??
      "";
    const domain = senderDomain(r) ?? "";
    return `${verdict}::${domain}`;
  });

  const drafts: ClusterDraft[] = [];
  for (const [key, group] of byKey.entries()) {
    if (group.length < CLUSTER_MIN_EVIDENCE) continue;
    const [verdict, domain] = key.split("::");
    const swarm_type = group[0].swarm_type;
    const structured: RefinementPayload = {
      kind: "prompt_tune_stage_4",
      sender_domain: domain || undefined,
      verdict_category: verdict || undefined,
    };
    drafts.push(buildDraft({
      kind: "prompt_tune_stage_4",
      stage: "4-handler",
      swarm_type,
      rows: group,
      structured,
      discriminators: { verdict_category: verdict, sender_domain: domain },
    }));
  }
  return drafts;
}

// ---- shared draft builder ------------------------------------------------

interface BuildDraftArgs {
  kind: PromotionKind;
  stage: PromotionStage;
  swarm_type: string;
  rows: PipelineEventOverrideRow[];
  structured: RefinementPayload;
  discriminators: Record<string, unknown>;
}

function buildDraft(args: BuildDraftArgs): ClusterDraft {
  const evidenceEventIds = args.rows.map((r) => r.id).sort();
  const evidenceEmailIds = [
    ...new Set(args.rows.map((r) => r.email_id).filter((v): v is string => !!v)),
  ].sort();
  const matched = args.rows.length;

  const costs = args.rows
    .map((r) => (r.cost_cents == null ? 0 : Number(r.cost_cents)))
    .filter((v) => Number.isFinite(v));
  const avgReplaced =
    costs.length > 0 ? costs.reduce((s, x) => s + x, 0) / costs.length : 0;

  // Deterministic kinds → promoted-path cost 0 per P4-D-05.
  // Non-deterministic v1 also 0 (savings formula returns NULL regardless).
  const avgPromoted = 0;

  // confirm_rate (v1) — operator confirmed via override; absence of contradicting
  // event means 1.0. v2 will compute from telemetry.
  const confirmRate = 1.0;

  const signature_key = signatureKey({
    kind: args.kind,
    swarm_type: args.swarm_type,
    discriminators: args.discriminators,
  });

  return {
    kind: args.kind,
    swarm_type: args.swarm_type,
    stage: args.stage,
    signature_key,
    structured_payload: args.structured,
    evidence_event_ids: evidenceEventIds,
    evidence_email_ids: evidenceEmailIds,
    matched_event_count_30d: matched,
    confirm_rate: confirmRate,
    avg_replaced_cost_cents: avgReplaced,
    avg_promoted_cost_cents: avgPromoted,
  };
}

function signatureKey(input: {
  kind: PromotionKind;
  swarm_type: string;
  discriminators: Record<string, unknown>;
}): string {
  const canonical = stableStringify({
    kind: input.kind,
    swarm_type: input.swarm_type,
    ...input.discriminators,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// Deterministic stringify — sorts keys recursively + sorts arrays of primitives.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((v) =>
      typeof v === "string" || typeof v === "number" ? v : stableStringify(v),
    );
    const allPrim = items.every(
      (v) => typeof v === "string" || typeof v === "number",
    );
    const sorted = allPrim ? [...items].sort() : items;
    return `[${sorted.map((v) => (typeof v === "string" || typeof v === "number" ? JSON.stringify(v) : v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

// ---- helpers -------------------------------------------------------------

function groupBy<T, K>(items: T[], fn: (item: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = fn(it);
    let bucket = m.get(k);
    if (!bucket) {
      bucket = [];
      m.set(k, bucket);
    }
    bucket.push(it);
  }
  return m;
}

function extractSubject(r: PipelineEventOverrideRow): string {
  if (typeof r.override.subject === "string") return r.override.subject;
  const dd = r.decision_details;
  if (dd && typeof dd === "object" && "subject" in dd) {
    const s = (dd as Record<string, unknown>).subject;
    if (typeof s === "string") return s;
  }
  return "";
}

function senderDomain(r: PipelineEventOverrideRow): string | null {
  const email =
    (r.override.sender_email as string | undefined) ??
    extractFromDecisionDetails(r, "sender_email");
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function extractFromDecisionDetails(
  r: PipelineEventOverrideRow,
  key: string,
): string | null {
  const dd = r.decision_details;
  if (!dd || typeof dd !== "object") return null;
  const v = (dd as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function uniqueRowCount(rows: PipelineEventOverrideRow[]): number {
  return new Set(rows.map((r) => r.id)).size;
}

function dedupeRows(rows: PipelineEventOverrideRow[]): PipelineEventOverrideRow[] {
  const seen = new Set<string>();
  const out: PipelineEventOverrideRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function uniqueSenderDomains(rows: PipelineEventOverrideRow[]): string[] {
  return [
    ...new Set(rows.map((r) => senderDomain(r)).filter((v): v is string => !!v)),
  ].sort();
}
