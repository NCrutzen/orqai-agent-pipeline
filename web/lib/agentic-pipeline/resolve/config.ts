// Phase 90 (P0 resolver substrate) — D-03/D-04/D-05.
//
// TS mirror of the public.swarms.resolution_config jsonb column
// (supabase/migrations/20260601a_resolution_config_column.sql). This is the
// per-swarm resolver config the generic engine reads (Plan 05) and the dispatch
// flip toggles (Plan 06).
//
// FREE-FORM, NO CODEGEN (Assumption A5 / RESEARCH §Registry Schema): this is
// per-swarm jsonb, not a closed enum, so it is NOT generated from a registry
// like swarms.entity_brand. Edit this interface by hand when the jsonb shape
// evolves. The debtor-email P0 row preserves today's behaviour exactly (D-02).

/**
 * D-04 source seam — the forward-compat descriptor for the resolution backend.
 * Lives inside resolution_config (NOT a dedicated resolution_sources table) until
 * the first phase that onboards a genuinely non-NXT customer-resolution backend
 * (V10.0 SugarCRM adapter). `kind` stays "nxt" through P0–P4.
 */
export interface ResolutionSource {
  /** Resolution backend kind. P0 = "nxt"; the V10.0 SugarCRM adapter adds others. */
  kind: string;
  /** zapier_tools.tool_id for the per-email candidate read (P0: "nxt.resolve_candidates"). */
  resolver_tool_id: string;
  /**
   * Long-tail fallback when the materialized resolve_candidates index misses
   * (e.g. rows newer than the last refresh, non-materialized kinds). P0:
   * "live_nxt_views" — the legacy live-`nxt` cross-DB views.
   */
  fallback?: string;
}

/**
 * Scoping rule (RESL-06 / DESIGN-GUIDE §0.4). `environment_id` is a MANDATORY
 * hard filter on every lookup; brand is a TIE-BREAKER, never a hard pre-filter
 * (cross-brand forwarding is common — §0.10 A11).
 */
export interface ResolutionScope {
  /** HARD filter on every lookup. P0 debtor = "BX" (Benelux). */
  environment_id: string;
  /**
   * "tiebreaker" — brand only disambiguates (e.g. the BE 3-way invoice
   * collision); NEVER "hard_filter" (that would wrongly reject valid
   * cross-brand-forwarded resolutions — §0.4 / §0.10 A11).
   */
  brand_mode: "tiebreaker" | "hard_filter";
  /**
   * Swarm-wide brand scope, or null for no swarm-wide brand pre-filter. P0
   * debtor leaves this null (per-mailbox brand comes from labeling_settings).
   */
  brand_scope?: string[] | null;
  /**
   * D-05 / RESL-06 per-mailbox brand_scope override map, keyed by
   * source_mailbox. The Berki BB+IN widening lives here (debtor-email is a
   * single swarm row for all 4 active mailboxes, so brand_scope cannot be set
   * uniformly on the row). The engine resolves the per-mailbox brand from
   * debtor.labeling_settings.brand_id, then widens it via this map before
   * passing @brand_scope to the resolve_candidates proc.
   * P0 debtor: { "debiteuren@berki.nl": ["BB", "IN"] }.
   */
  brand_scope_by_mailbox?: Record<string, string[]>;
}

/**
 * D-03 / blocklist_ref — which resolution_blocklists rows the engine applies
 * (the own-entity / freemail / platform / own-domain-as-customer strip lists).
 */
export interface ResolutionBlocklistRef {
  /** The swarm whose specific blocklist rows to load (e.g. "debtor-email"). */
  swarm_type: string;
  /** When true, also load the shared rows (swarm_type='*'). */
  include_shared: boolean;
}

/**
 * The public.swarms.resolution_config jsonb shape. The debtor-email P0 row
 * preserves today's behaviour exactly (D-02): precedence = today's order
 * (thread_inheritance first), auto_safe_kinds = [] (no separate self-auth tier
 * yet — P1 adds aanmaning/klantnummer/werkbon).
 */
export interface ResolutionConfig {
  /** Config schema version (e.g. "2026-06-01.v1"). */
  version: string;
  /** D-04 source seam — the resolution backend descriptor. */
  source: ResolutionSource;
  /** RESL-06 scoping rule (env hard / brand tiebreaker). */
  scope: ResolutionScope;
  /**
   * D-02: the precedence stack AS DATA so P1 can flip it without a code change.
   * P0 = today's order ["thread_inheritance","sender_match","identifier_match"]
   * — do NOT flip (the self-auth/invoice-outrank inversion is P1 / RESL-14).
   */
  precedence: string[];
  /**
   * Self-auth tier kinds eligible for AUTO (debtor-specific). EMPTY in P0 — the
   * engine must produce zero self-auth candidates and NOT crash when this is []
   * (the only generality assertion P0 makes — RESL-03 self-auth-no-op test).
   * P1 adds aanmaning/klantnummer/werkbon.
   */
  auto_safe_kinds: string[];
  /** D-03 — which resolution_blocklists rows to apply. */
  blocklist_ref: ResolutionBlocklistRef;
  /** Whether the LLM tiebreaker (llm-tiebreaker.ts) runs over ambiguous candidate sets. */
  llm_tiebreaker: boolean;
}
