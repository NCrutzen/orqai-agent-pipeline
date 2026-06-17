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
   * P0 = today's order ["thread_inheritance","sender_match","identifier_match"].
   *
   * Phase 91 (D-10 — RESL-14) INVERSION, applied as LIVE-ROW DATA (no code
   * change — the engine already iterates this array). The debtor-email live row
   * becomes:
   *   ["self_auth","identifier_match","sender_match","thread_inheritance"]
   * so the high-precision AUTO tier OUTRANKS thread inheritance. The interface
   * does not change for ordering; only the swarms.resolution_config.precedence
   * jsonb value flips (Plan 91-05 / the dispatch flip owns the live edit).
   * thread_inheritance is NOT stranded: self_auth/identifier fail CLOSED to null
   * on any ambiguity, so a no-signal email still reaches thread_inheritance.
   */
  precedence: string[];
  /**
   * Self-auth tier kinds eligible for AUTO. EMPTY in P0 (the RESL-03
   * self-auth-no-op: the engine must produce zero self-auth candidates and NOT
   * crash when this is []).
   *
   * Phase 91 (RESL-07) — the debtor-email live row populates this with the
   * self-auth substrate kinds the runSelfAuthMatch step gates on (the aanmaning
   * klantnummer + werkbon site stamps), e.g. ["customer_no","site_no"]. The step
   * extracts self-auth ids, then keeps only matches whose identifier_kind is in
   * this set before the single-distinct-party AUTO gate. A future SugarCRM-shaped
   * swarm with no self-auth stamps leaves this [] and the step no-ops (D-08:
   * swarm-agnostic — no debtor literals in the engine/step).
   */
  auto_safe_kinds: string[];
  /** D-03 — which resolution_blocklists rows to apply. */
  blocklist_ref: ResolutionBlocklistRef;
  /** Whether the LLM tiebreaker (llm-tiebreaker.ts) runs over ambiguous candidate sets. */
  llm_tiebreaker: boolean;
  /**
   * Phase 120 (D-06 multi-signal corroboration). OPTIONAL — when ABSENT the
   * engine runs today's first-hit short-circuit loop byte-identically (CORR-04,
   * protects no-engine-diff for non-opted-in swarms). When PRESENT the engine
   * collects every precedence step's candidate and scores deterministically via
   * scoreCorroboration() — NO LLM call (D-03).
   *
   * This is FREE-FORM jsonb (NOT codegen'd) like the rest of resolution_config —
   * the seed (Plan 03) is the only writer (operator-controlled, RLS-gated table).
   */
  corroboration?: CorroborationConfig;
}

/**
 * Phase 120 (D-06) — the corroboration scoring policy. Read by scoreCorroboration()
 * to decide boost / demote / lone-signal capping over the collected candidate set.
 */
export interface CorroborationConfig {
  /**
   * D-04 — the minimum number of DISTINCT identifier_kind signals (the D-05
   * independence axis) agreeing on one customer required to BOOST to high.
   * Default 2. NOTE: scoreCorroboration applies a `Math.max(2, min_signals)`
   * FLOOR (T-120-03) so a malformed seed (min_signals=0) cannot make a lone
   * signal "agree" with itself and auto-boost.
   */
  min_signals: number;
  /**
   * The confidence tier a corroborated (≥min_signals agreeing) candidate is
   * boosted to. Default "high". Never raises a candidate ABOVE its agreement —
   * the boost only applies when the agreement gate passes.
   */
  boost: "high" | "medium";
  /**
   * D-07 — identifier_kinds that are STRONG enough to keep their native high
   * confidence when they are the LONE signal (e.g. "invoice_no", "customer_no").
   * Any lone kind NOT in this set is capped below AUTO (high→medium). A lone
   * sender/domain signal is deliberately omitted so it caps to medium.
   */
  auto_safe_alone_kinds?: string[];
}
