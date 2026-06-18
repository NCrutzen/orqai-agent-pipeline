// Phase 90 → Phase 123 — Step module: identifier_match.
//
// Phase 123 (RESL-UNIFY-02): the invoice path now resolves over the SINGLE generic
// nxt.resolve_candidates substrate (invoice_no kind). The legacy per-kind
// identifier_lookup + candidate_details fallback wrappers are REMOVED —
// extract-invoices seed → resolve_candidates(invoice_no) → ROOT
// paying customer (root_party_id rollup, D-04). Single distinct root → high; >=2
// distinct roots → LLM tiebreaker (preserves the P0 NON-AUTO escalation);
// prefix-mismatch / lookup-error → SUGGEST. The invoice path works REGARDLESS of
// auto_safe_kinds (option A, Plan 01 Task 3) so live debtor (auto_safe_kinds:[])
// still resolves invoices.
//
// The Phase 91 runNumberBackSearchAuto AUTO pre-pass (gated on auto_safe_kinds) is
// UNCHANGED — it already reads resolve_candidates; only the legacy NON-AUTO block
// changed.
//
// The step also returns the extracted identifiers so the engine's `unresolved`
// fallback can populate inputs.matched_identifiers (the legacy
// `invoices?.candidates ?? []` contract — unchanged).

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import { stripEnvPrefix } from "../strip-env-prefix";
import { isAutoEligibleStatus } from "./auto-gate";
import {
  resolveCrossScope,
  CROSS_SCOPE_ROOT_KINDS,
} from "./cross-scope";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";
import type { LlmTiebreak } from "./sender-match";
import type { SelfAuthConfig } from "./self-auth-match";
import type { CrossScopeConfig, CorroborationConfig } from "../config";

// Phase 91 (RESL-08) — the config slice the number back-search pre-pass reads.
// Reuses SelfAuthConfig (scope.environment_id for the D-01 strip, scope.brand_scope
// for the prefix-family tiebreaker, auto_safe_kinds for the eligible number kinds).
// Phase 122 (XSCOPE-01) — carries the OPTIONAL cross_scope + corroboration slices the
// cross-scope post-pass reads at the drop sites (presence-gated, swarm-agnostic).
// Swarm-agnostic (D-08): no debtor literals.
export type IdentifierMatchConfig = SelfAuthConfig & {
  cross_scope?: CrossScopeConfig;
  corroboration?: CorroborationConfig;
};

export interface IdentifierMatchOutcome {
  /** A resolved result (single-hit or tiebreaker), or null to fall through. */
  result: ResolveResult | null;
  /**
   * The identifiers extracted from subject+body — surfaced so the engine's
   * `unresolved` fallback mirrors the legacy `invoices?.candidates ?? []`.
   */
  matched_identifiers: string[];
}

/**
 * Layer 3 — identifier_match (D-02). Always returns the extracted identifiers;
 * `result` is non-null only on a single-hit or tiebreaker escalation.
 *
 * Phase 91 (RESL-08) — when `config` is supplied AND its auto_safe_kinds enable
 * the number kinds, a high-precision number back-search PRE-PASS runs FIRST: it
 * reads the materialized resolve_candidates substrate (lookupResolveCandidates)
 * and emits an AUTO `identifier_match` ONLY on a single distinct ROOT customer
 * (root_party_id rollup, D-04) with a matching prefix-family. Any ambiguity (>=2
 * distinct roots / cross-brand / prefix-mismatch / lookup-error) fails CLOSED and
 * falls through to the legacy invoice path below — which preserves the P0
 * >=2-escalates-to-llmTiebreak behaviour for the NON-AUTO tier.
 */
export async function runIdentifierMatch(
  args: ResolveArgs,
  llmTiebreak: LlmTiebreak,
  config?: IdentifierMatchConfig,
): Promise<IdentifierMatchOutcome> {
  // ── Phase 91 (RESL-08) high-precision number back-search AUTO pre-pass ──────
  if (config && args.brand_id && (config.auto_safe_kinds ?? []).length > 0) {
    const auto = await runNumberBackSearchAuto(args, config);
    if (auto.result) return auto;
    // No AUTO → fall through to the legacy invoice path (non-AUTO tier).
  }

  // Phase 123 (RESL-UNIFY-02, option A) — the invoice path now resolves over the
  // SAME generic resolve_candidates substrate (invoice_no kind), INDEPENDENT of
  // auto_safe_kinds (so live debtor with auto_safe_kinds:[] still resolves
  // invoices). The legacy per-kind identifier_lookup + candidate_details fallback
  // path is GONE — resolve_candidates carries party_name directly, so the single-hit
  // detail fetch is unnecessary. The P0 risk posture is preserved: single distinct
  // ROOT → high, >=2 distinct → llmTiebreak escalation, prefix-mismatch/error →
  // SUGGEST. Swarm-agnostic (SWARM-02): no debtor literal.
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0 && args.brand_id) {
    // Debtor always supplies scope; default envId to "BX" for the minimal-config
    // case (a config without scope cannot strip the env prefix otherwise).
    const envId = config?.scope.environment_id ?? "BX";
    const res = await lookupResolveCandidates(
      {
        nxt_database: args.nxt_database,
        brand_id: args.brand_id,
        environment_id: envId,
        identifiers: invoices.candidates,
        brand_scope: args.brand_scope,
      },
      "unknown",
    ).catch((err) => {
      console.warn(
        `[resolve] identifier_match (invoice_no) failed, falling through: ${err instanceof Error ? err.message : err}`,
      );
      return { matches: [] as ResolveCandidateMatch[] };
    });

    // Only invoice_no rows with an auto-eligible status. Roll up to the ROOT
    // (top-level billing) customer — root_party_id null = the party is already a
    // root (D-04).
    const inScope = res.matches.filter(
      (m) => m.identifier_kind === "invoice_no" && isAutoEligibleStatus(m.status),
    );
    const rootOf = (m: ResolveCandidateMatch) => m.root_party_id ?? m.party_id;
    const distinctRoots = Array.from(new Set(inScope.map(rootOf)));
    const inScopeBrands = new Set<string>([
      args.brand_id,
      ...(args.brand_scope ?? []),
    ]);

    // Phase 122 (XSCOPE-01 / D-11) — cross-scope post-pass. Fires ONLY after an
    // in-scope MISS: the invoice path produces no in-scope-brand single-root AUTO
    // (every invoice_no row is cross-brand, OR there is no invoice_no row at all).
    // Gated strictly on config.cross_scope?.enabled (SWARM-02 — no swarm literal);
    // when absent/false the original logic below runs BYTE-IDENTICAL (opt-out,
    // Pitfall 1). PURE over the already-fetched res.matches — no second lookup.
    const hasInScopeInvoiceRoot =
      distinctRoots.length === 1 &&
      (() => {
        const w = inScope.find((m) => rootOf(m) === distinctRoots[0])!;
        return w.brand_id == null || w.brand_id === "" || inScopeBrands.has(w.brand_id);
      })();
    if (config?.cross_scope?.enabled && !hasInScopeInvoiceRoot) {
      const crossScope = resolveCrossScope(
        res.matches,
        CROSS_SCOPE_ROOT_KINDS,
        config,
        args,
        invoices.candidates,
        "root",
      );
      if (crossScope) {
        return { result: crossScope, matched_identifiers: invoices.candidates };
      }
      // No cross-scope decision → fall through to the original in-scope logic
      // (which then drops to SUGGEST). Opt-out byte-identity is unaffected because
      // this whole branch is gated on cross_scope.enabled.
    }

    if (distinctRoots.length === 1) {
      // Prefix-family gate against the mailbox brand scope.
      const winner = inScope.find((m) => rootOf(m) === distinctRoots[0])!;
      if (
        winner.brand_id != null &&
        winner.brand_id !== "" &&
        !inScopeBrands.has(winner.brand_id)
      ) {
        // Cross-brand / prefix mismatch → SUGGEST.
        return { result: null, matched_identifiers: invoices.candidates };
      }
      const customer_account_id = stripEnvPrefix(distinctRoots[0], envId);
      const candidate: Candidate = {
        id: customer_account_id,
        name: winner.party_name,
        contact_person: null,
        recent_invoices: [],
      };
      return {
        result: {
          method: "identifier_match",
          customer_account_id,
          customer_name: winner.party_name,
          confidence: "high",
          candidates_considered: 1,
          environment_id: envId,
          inputs: {
            kind: "identifier_match",
            matched_identifiers: invoices.candidates,
            candidates: [candidate],
          },
        },
        matched_identifiers: invoices.candidates,
      };
    }

    if (distinctRoots.length >= 2) {
      // >=2 distinct paying customers — identifier-driven tiebreak (preserves the
      // P0 NON-AUTO >=2 → llmTiebreak behaviour; mirrors the legacy uniqueCustomerIds).
      return {
        result: await llmTiebreak(distinctRoots, args, {
          sender_email: args.from_email,
          matched_identifiers: invoices.candidates,
        }),
        matched_identifiers: invoices.candidates,
      };
    }
  }

  return { result: null, matched_identifiers: invoices.candidates };
}

// ── Phase 91 (RESL-08) — number back-search AUTO pre-pass ─────────────────────

/**
 * The number-search kinds eligible for the ROOT rollup (D-04). Self-auth stamp
 * kinds (customer_no / site_no) are handled by the separate self_auth step with
 * the DIRECT rollup, so they are excluded here even when both share
 * auto_safe_kinds. Swarm-agnostic: a swarm enables a kind purely by listing it in
 * config.auto_safe_kinds; this set is the closed roster of NUMBER kinds the
 * substrate seed materializes a root_party_id for.
 */
const NUMBER_BACK_SEARCH_KINDS = new Set([
  "invoice_no",
  "po_no",
  "order_no",
  "job_no",
  "quote_no",
  "previous_customer_id",
]);

/**
 * High-precision number back-search. Reads the materialized resolve_candidates
 * substrate and returns an AUTO `identifier_match` ONLY on a single distinct ROOT
 * customer (root_party_id, D-04) with a matching prefix-family. Fails CLOSED to
 * `{ result: null }` on every ambiguity — NEVER escalates to the LLM tiebreaker
 * at the AUTO tier.
 */
async function runNumberBackSearchAuto(
  args: ResolveArgs,
  config: IdentifierMatchConfig,
): Promise<IdentifierMatchOutcome> {
  const { extractNumberCandidates } = await import(
    "@/lib/automations/debtor-email/extract-numbers"
  );
  const extract = extractNumberCandidates(args.subject, args.body_text);
  const identifiers = extract.candidates;
  if (identifiers.length === 0) return { result: null, matched_identifiers: [] };

  const res = await lookupResolveCandidates(
    {
      nxt_database: args.nxt_database,
      brand_id: args.brand_id!,
      environment_id: config.scope.environment_id,
      identifiers,
      brand_scope: args.brand_scope,
    },
    "unknown",
  ).catch((err) => {
    console.warn(
      `[resolve] number back-search step failed, falling through: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // Only the number kinds this swarm marks auto-safe.
  const eligible = new Set(
    (config.auto_safe_kinds ?? []).filter((k) => NUMBER_BACK_SEARCH_KINDS.has(k)),
  );
  if (eligible.size === 0) return { result: null, matched_identifiers: identifiers };

  // CR-01 (Phase 91 review) — granularity-match fix. The proc computes
  // `is_unique_in_scope` per DIRECT `party_id`, but this number tier decides AUTO
  // on `root_party_id` (D-04 rollup). Those granularities disagree: a value that
  // maps to two distinct DIRECT parties under the SAME root would arrive with
  // is_unique_in_scope=0 on both rows (per-kind party count = 2) and get wrongly
  // excluded — a recall loss — while the root is in fact unambiguous. Conversely
  // the flag never asserts root-level uniqueness, which is the decision this tier
  // actually makes. So for the number tier we DROP the per-party is_unique_in_scope
  // pre-filter and rely SOLELY on `distinctRoots.length === 1` over the rollup
  // target. This is strictly fail-closed: any value spanning >=2 distinct roots
  // (cross-brand or otherwise) still falls to SUGGEST, and an out-of-scope brand
  // root counts as a distinct root → SUGGEST. The self_auth DIRECT tier KEEPS the
  // is_unique_in_scope filter (self-auth-match.ts) where granularities already
  // agree (party_id == decision granularity) — locked-pair semantics preserved.
  // WR-03 (Phase 91 review) — exclude STOPPED/inactive customers from AUTO. A
  // stale previous_customer_id (or any kind) pointing at a closed/re-keyed account
  // must not AUTO-resolve. Status is carried per-row from resolver_index.status.
  const inScope = res.matches.filter(
    (m) => eligible.has(m.identifier_kind) && isAutoEligibleStatus(m.status),
  );
  if (inScope.length === 0) return { result: null, matched_identifiers: identifiers };

  // D-04 ROLLUP: resolve to the ROOT (top-level billing) customer. root_party_id
  // null = the party is already a root → fall back to the direct party_id. The
  // single-distinct-root check IS the AUTO/SUGGEST gate at root granularity.
  const rootOf = (m: ResolveCandidateMatch) => m.root_party_id ?? m.party_id;
  const distinctRoots = Array.from(new Set(inScope.map(rootOf)));
  if (distinctRoots.length !== 1) {
    // >=2 distinct roots → SUGGEST at the AUTO tier (no llmTiebreak here).
    return { result: null, matched_identifiers: identifiers };
  }

  // Prefix-family gate against the mailbox brand scope.
  const inScopeBrands = new Set<string>([
    args.brand_id!,
    ...(args.brand_scope ?? []),
  ]);
  const winner = inScope.find((m) => rootOf(m) === distinctRoots[0])!;
  if (
    winner.brand_id != null &&
    winner.brand_id !== "" &&
    !inScopeBrands.has(winner.brand_id)
  ) {
    return { result: null, matched_identifiers: identifiers };
  }

  // AUTO. D-01 strip + D-02 environment_id carried.
  const customer_account_id = stripEnvPrefix(
    distinctRoots[0],
    config.scope.environment_id,
  );
  const candidate: Candidate = {
    id: customer_account_id,
    name: winner.party_name,
    contact_person: null,
    recent_invoices: [],
  };

  return {
    result: {
      method: "identifier_match",
      customer_account_id,
      customer_name: winner.party_name,
      confidence: "high",
      candidates_considered: 1,
      environment_id: config.scope.environment_id,
      inputs: {
        kind: "identifier_match",
        matched_identifiers: identifiers,
        candidates: [candidate],
      },
    },
    matched_identifiers: identifiers,
  };
}
