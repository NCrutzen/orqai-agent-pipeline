// Phase 56-00 → Phase 90 (P0 resolver substrate, D-01/D-02/D-07).
//
// This file USED to contain the inline 4-layer debtor-resolution pipeline.
// Phase 90 moved that logic VERBATIM into the generic, config-ordered engine
// (web/lib/agentic-pipeline/resolve/engine.ts) + its step modules. This module
// is now config + a THIN ADAPTER:
//
//   - `debtorP0Config` — the P0 resolution_config = TODAY's behaviour exactly
//     (precedence: thread_inheritance → sender_match → identifier_match;
//     auto_safe_kinds: [] — no self-auth tier yet, that's P1). The §0.10 A5
//     inversion (inheritance first/high) is PRESERVED on purpose so Plan 06's
//     equality dry-run is a clean check.
//   - `resolveDebtor(args)` — delegates to `resolveEntity(args, debtorP0Config)`.
//     Kept as the D-07 kill-switch REVERT target: swarms.stage2_entity_resolver
//     points here today; the cutover (Plan 06) flips it to the engine path, and
//     reverting = pointing it back here. Behaviour is identical either way (the
//     port-equivalence test guards this).
//   - `resolveEntity` is re-exported so loadStage2Resolver can dispatch to THIS
//     module path and get the same engine entrypoint as the engine path.
//
// The LOCKED public contract (ResolveResult / Stage2Inputs / ResolveArgs /
// Candidate / ResolveMethod / Confidence) lives in engine.ts as the canonical
// home and is re-exported here so existing importers (resolver-trace.ts, the
// Stage 2 worker, the legacy label-email route) keep working unchanged.
// `customer_account_id` is the LOCKED field name.
//
// Replay-safety (CLAUDE.md Inngest): the engine is invoked from inside the
// worker's step.run("resolve-debtor", …). DO NOT add a nested step.run here.

import {
  resolveEntity,
  type ResolveArgs,
  type ResolveResult,
} from "@/lib/agentic-pipeline/resolve/engine";
import type { ResolutionConfig } from "@/lib/agentic-pipeline/resolve/config";

// Re-export the LOCKED public contract from its canonical home (engine.ts) so
// importers that historically read these from "./resolve-debtor" keep working.
export type {
  ResolveArgs,
  ResolveResult,
  ResolveMethod,
  Confidence,
  Candidate,
  Stage2Inputs,
} from "@/lib/agentic-pipeline/resolve/engine";

// Re-export the engine entrypoint so loadStage2Resolver dispatching to THIS
// module path resolves a { resolveEntity } module.
export { resolveEntity };

/**
 * Debtor-email P0 resolution_config (D-02 behaviour-neutral). Mirrors the
 * swarms.resolution_config jsonb row seeded in
 * supabase/migrations/20260601a_resolution_config_column.sql for the
 * debtor-email swarm. P0 precedence = TODAY's order (do NOT flip — that's P1).
 *
 * NOTE: the live engine reads swarm.resolution_config from the registry at
 * dispatch time; this constant is the in-code fallback used by the resolveDebtor
 * adapter (the D-07 kill-switch revert target) so today's behaviour is exactly
 * preserved even when invoked directly.
 */
export const debtorP0Config: ResolutionConfig = {
  version: "2026-06-01.v1",
  source: {
    kind: "nxt",
    resolver_tool_id: "nxt.resolve_candidates",
    fallback: "live_nxt_views",
  },
  scope: {
    environment_id: "BX",
    brand_mode: "tiebreaker",
    brand_scope: null,
    brand_scope_by_mailbox: { "debiteuren@berki.nl": ["BB", "IN"] },
  },
  precedence: ["thread_inheritance", "sender_match", "identifier_match"],
  auto_safe_kinds: [],
  blocklist_ref: { swarm_type: "debtor-email", include_shared: true },
  llm_tiebreaker: true,
  // Phase 120-03 (W2, LOCKED): ONLY the `corroboration` sub-object is kept in
  // lockstep with the live debtor seed (20260616a_debtor_corroboration_optin.sql).
  // The `precedence` + `auto_safe_kinds` above stay the P0 order ON PURPOSE — this
  // constant is the D-07 kill-switch revert target (see the header comment), NOT a
  // full mirror of the live registry row. The lockstep test asserts ONLY
  // `.corroboration`, never full deep-equality.
  corroboration: {
    min_signals: 2,
    boost: "high",
    auto_safe_alone_kinds: ["customer_no", "site_no", "invoice_no"],
  },
  // Phase 122-04 (W3, LOCKED): ONLY the `cross_scope` sub-object is kept in
  // lockstep with the live debtor seed (20260618a_debtor_cross_scope_optin.sql).
  // The `precedence` + `auto_safe_kinds` above stay the P0 order ON PURPOSE — this
  // constant is the D-07 kill-switch revert target (see the header comment), NOT a
  // full mirror of the live registry row. The lockstep test asserts ONLY
  // `.cross_scope`, never full deep-equality. auto_resolve_kinds names the STRONG
  // identifier kinds that may AUTO cross-brand alone on a single distinct root
  // (D-03a); allow_corroboration_auto lets a corroborated cross-brand candidate
  // AUTO even on a lone weak kind (D-03b).
  cross_scope: {
    enabled: true,
    auto_resolve_kinds: ["invoice_no", "customer_no", "site_no"],
    allow_corroboration_auto: true,
  },
};

/**
 * Thin adapter — runs the generic engine with the debtor P0 config. Preserves
 * the historic `resolveDebtor(args)` entrypoint (D-07 kill-switch revert
 * target). Output is byte-identical to the engine path (guarded by the
 * port-equivalence test, D-01/D-02).
 */
export async function resolveDebtor(args: ResolveArgs): Promise<ResolveResult> {
  return resolveEntity(args, debtorP0Config);
}
