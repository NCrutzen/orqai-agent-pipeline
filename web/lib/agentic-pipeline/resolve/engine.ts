// Phase 90 (P0 resolver substrate) — Generic config-ordered resolution engine.
//
// D-01/D-02: a 1:1 FAITHFUL MOVE of resolve-debtor.ts's 4-layer pipeline into a
// config-ordered step runner. The engine iterates `config.precedence` (an
// ordered string array) and runs the matching step module; the first step that
// produces a `customer_account_id` short-circuits (today's behaviour). Falls
// through to `unresolved` when no step resolves.
//
// The P0 debtor config sets precedence = ["thread_inheritance","sender_match",
// "identifier_match"] — TODAY's order (inheritance first/high). The §0.10 A5
// inversion is PRESERVED ON PURPOSE so Plan 06's equality dry-run is a clean
// check. P1 reorders by editing config data; P1 adds/modifies steps inside this
// shell. NO new resolution logic, NO precedence flip here.
//
// The ResolveResult / Stage2Inputs / ResolveArgs / Candidate / ResolveMethod /
// Confidence types are the LOCKED public contract (customer_account_id is the
// locked field name; inputs.kind mirrors method). They live here as the
// canonical home and are re-exported from resolve-debtor.ts so existing
// importers (resolver-trace.ts, the Stage 2 worker, the legacy route) keep
// working unchanged.
//
// Replay-safety (CLAUDE.md Inngest): the engine is invoked from inside
// step.run("resolve-debtor", …) in the worker. NEVER add a nested step.run.
// nxt-zap-client already generates requestId inside the call.

import { lookupCandidateDetails } from "@/lib/automations/debtor-email/nxt-zap-client";
import type { ResolutionConfig } from "./config";
import { runThreadInheritance } from "./steps/thread-inheritance";
import { runSenderMatch, type LlmTiebreak } from "./steps/sender-match";
import { runIdentifierMatch } from "./steps/identifier-match";

// The engine consumes only `precedence` (the ordered step list) +
// `auto_safe_kinds` (self-auth-no-op) + `llm_tiebreaker`. Require just those
// (auto_safe_kinds/llm_tiebreaker optional) so the full ResolutionConfig
// (registry/adapter) AND a minimal config are both assignable. The remaining
// ResolutionConfig fields (source, scope, blocklist_ref) are read by the
// resolve_candidates proc / blocklist loader, not by the in-process precedence
// runner in P0. Extra fields on the passed object are tolerated.
export type EngineConfig = Pick<ResolutionConfig, "precedence"> &
  Partial<Pick<ResolutionConfig, "auto_safe_kinds" | "llm_tiebreaker">>;

// ─── LOCKED public contract (ported verbatim from resolve-debtor.ts:33-104) ──

export type ResolveMethod =
  | "thread_inheritance"
  | "sender_match"
  | "identifier_match"
  | "llm_tiebreaker"
  | "unresolved";

export type Confidence = "high" | "medium" | "low" | "none";

export interface ResolveArgs {
  nxt_database: string;
  brand_id: string | null; // null = NXT lookups disabled for this mailbox
  conversation_id: string | null;
  from_email: string | null;
  subject: string;
  body_text: string;
}

// Phase 82.9 (D-03) — richer candidate shape for Stage 2 audit panel.
// `recent_invoices` is bounded to <=5 newest-first by the mapper / Zap.
export type Candidate = {
  id: string;
  name: string;
  contact_person: string | null;
  recent_invoices: string[];
};

// Phase 82.9 (D-01) — discriminated union; `kind` mirrors the outer `method`
// so illegal combinations are caught at compile time.
export type Stage2Inputs =
  | {
      kind: "thread_inheritance";
      prior_email_label_id: string;
      conversation_id: string;
    }
  | {
      kind: "sender_match";
      sender_email: string;
      candidates: Candidate[];
    }
  | {
      kind: "identifier_match";
      matched_identifiers: string[];
      candidates: Candidate[];
    }
  | {
      kind: "llm_tiebreaker";
      sender_email: string | null;
      matched_identifiers: string[];
      candidates: Candidate[];
      llm_reason: string;
      // Phase 04.1 — P4.1-D-03: account_id picked by the LLM tiebreaker.
      // Null on tiebreaker-failure paths. Used by buildResolverTrace +
      // the resolver-chain renderer to mark picked vs alternatives.
      picked_account_id: string | null;
    }
  | {
      kind: "unresolved";
      sender_email: string | null;
      matched_identifiers: string[];
    };

export interface ResolveResult {
  method: ResolveMethod;
  customer_account_id: string | null;
  customer_name: string | null;
  confidence: Confidence;
  reason?: string;
  candidates_considered?: number;
  // Phase 82.9 — discriminated via `inputs.kind === method`.
  inputs: Stage2Inputs;
}

// ─── The config-ordered engine ───────────────────────────────────────────────

/**
 * Generic, config-ordered entity-resolution engine. Iterates
 * `config.precedence` and runs each ported step module in declared order,
 * short-circuiting on the first step that yields a customer_account_id.
 * P0 debtor config = today's order, so output is byte-identical to the legacy
 * `resolveDebtor` (guarded by the port-equivalence test, D-01/D-02).
 *
 * Self-auth-no-op (RESL-03, the ONLY generality claim P0 makes): the engine
 * reads `config.auto_safe_kinds`. In P0 there is no separate self-auth step
 * (the ported layers ARE the step set), so an empty/absent `auto_safe_kinds`
 * synthesizes no candidate and the engine simply runs the precedence steps —
 * it must NOT crash and MUST NOT emit a `self_auth` method.
 */
export async function resolveEntity(
  args: ResolveArgs,
  config: EngineConfig,
): Promise<ResolveResult> {
  // RESL-03 self-auth-no-op: empty/absent auto_safe_kinds → zero self-auth
  // candidates. P0 debtor has no self-auth step; the precedence steps below run
  // unchanged. (No crash on an empty array — it is simply not consulted.)
  void (config.auto_safe_kinds ?? []);

  // The verbatim multi-candidate escalation (resolve-debtor.ts:301-406),
  // shared by the sender + identifier steps so the tiebreak logic lives once.
  const llmTiebreak: LlmTiebreak = (customerIds, tiebreakArgs, ctx) =>
    runLlmTiebreak(customerIds, tiebreakArgs, ctx, config);

  // Track the identifiers the identifier step extracted so the unresolved
  // fallback mirrors the legacy `invoices?.candidates ?? []` exactly.
  let lastMatchedIdentifiers: string[] = [];

  for (const stepName of config.precedence) {
    if (stepName === "thread_inheritance") {
      const result = await runThreadInheritance(args);
      if (result) return result;
    } else if (stepName === "sender_match") {
      const result = await runSenderMatch(args, llmTiebreak);
      if (result) return result;
    } else if (stepName === "identifier_match") {
      const outcome = await runIdentifierMatch(args, llmTiebreak);
      lastMatchedIdentifiers = outcome.matched_identifiers;
      if (outcome.result) return outcome.result;
    }
    // Unknown precedence names are silently skipped (forward-compat for P1
    // step kinds not yet implemented in P0).
  }

  // Final fallback: zero-hit → unresolved (D-03: NO LLM call).
  // Phase 82.9 — discriminated inputs even on unresolved path.
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
    inputs: {
      kind: "unresolved",
      sender_email: args.from_email ?? null,
      matched_identifiers: lastMatchedIdentifiers,
    },
  };
}

// ─── llmTiebreak (ported verbatim from resolve-debtor.ts:301-406) ─────────────

async function runLlmTiebreak(
  customerIds: string[],
  args: ResolveArgs,
  // Phase 82.9 — caller threads through sender_email + matched_identifiers
  // so the discriminated inputs payload is faithful to the call path.
  ctx: { sender_email: string | null; matched_identifiers: string[] },
  config: EngineConfig,
): Promise<ResolveResult> {
  if (!args.brand_id) {
    // Should not happen — caller already gated layers 2/3 on brand_id.
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: {
        kind: "unresolved",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
      },
    };
  }
  // Pre-fetch candidate details (D-12) — predictable cost, no agent loops.
  // Phase 82.9 — fetch failure → degrade to empty candidates + sentinel reason.
  const details = await lookupCandidateDetails(
    {
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      customer_ids: customerIds,
    },
    "unknown",
  ).catch((err) => {
    console.warn(
      `[resolveDebtor] llmTiebreak candidate-details fetch failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  });
  if (!details) {
    return {
      method: "llm_tiebreaker",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: customerIds.length,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
        candidates: [],
        llm_reason: "candidate-details fetch failed",
        // Phase 04.1 — P4.1-D-03: no pick on candidate-details failure path.
        picked_account_id: null,
      },
    };
  }
  const richCandidates = details.matches.map((m) => ({
    id: m.id,
    name: m.name,
    contact_person: m.contact_person ?? null,
    recent_invoices: m.recent_invoices ?? [],
  }));
  // P0 honours config.llm_tiebreaker: only an EXPLICIT false disables the LLM
  // (undefined/true → run it, the legacy behaviour). Debtor P0 = true, so this
  // is behaviour-neutral.
  if (config.llm_tiebreaker === false) {
    return {
      method: "llm_tiebreaker",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: customerIds.length,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
        candidates: richCandidates,
        llm_reason: "llm tiebreaker disabled by config",
        picked_account_id: null,
      },
    };
  }
  // Lazy import: keep the Orq.ai LLM client chain out of the module-load
  // graph so callers that never reach a multi-candidate tiebreak (and tests
  // that only mock @/lib/supabase/admin + nxt-zap-client) don't pull it in.
  // Mirrors the dynamic-import pattern in lib/inngest/functions/pipeline.ts:427.
  const { callTiebreaker } = await import(
    "@/lib/automations/debtor-email/llm-tiebreaker"
  );
  let out: Awaited<ReturnType<typeof callTiebreaker>>;
  try {
    out = await callTiebreaker({
      email_subject: args.subject,
      email_body: args.body_text,
      candidates: details.matches.map((m) => ({
        customer_account_id: m.id,
        customer_name: m.name,
      })),
    });
  } catch (err) {
    // Phase 82.9 — preserve existing failure semantics (no throw) while
    // still populating a valid `inputs.kind = "llm_tiebreaker"`.
    return {
      method: "llm_tiebreaker",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: customerIds.length,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
        candidates: richCandidates,
        llm_reason: `llm tiebreaker failed: ${err instanceof Error ? err.message : String(err)}`,
        // Phase 04.1 — P4.1-D-03: no pick on LLM-failure path.
        picked_account_id: null,
      },
    };
  }
  const picked = details.matches.find((m) => m.id === out.selected_account_id);
  return {
    method: "llm_tiebreaker",
    customer_account_id: out.selected_account_id,
    customer_name: picked?.name ?? null,
    confidence: out.confidence,
    reason: out.reason,
    candidates_considered: customerIds.length,
    // Phase 82.9 — propagate the LLM verdict text (D-02) + candidates.
    inputs: {
      kind: "llm_tiebreaker",
      sender_email: ctx.sender_email,
      matched_identifiers: ctx.matched_identifiers,
      candidates: richCandidates,
      llm_reason: out.reason,
      // Phase 04.1 — P4.1-D-03: pick id flows through so the renderer can
      // mark picked vs alternatives (alternatives = candidates.filter id !=).
      picked_account_id: out.selected_account_id,
    },
  };
}
