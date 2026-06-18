// Phase 122 (XSCOPE-01 / D-01..D-11) — Step module: cross_scope fallback.
//
// THE CARDINAL CONSTRAINT (T-122-01): this SHARED post-pass must NEVER inject a
// confident WRONG cross-brand customer. It runs ONLY after an in-scope miss at one
// of the three SUGGEST drop sites (invoice / number back-search / self-auth DIRECT),
// re-examines the SAME already-fetched all-brand res.matches, and either:
//   - AUTO-resolves at "high" (with a cross_scope_misroute annotation) ONLY on a
//     SINGLE distinct root/party (D-08) AND a STRONG kind in auto_resolve_kinds
//     (D-03a), OR a >=min_signals corroboration over independent kinds (D-03b); or
//   - DEGRADES to "suggestie" (D-04/D-05) — a plausible-but-not-safe operator-confirm
//     tier — on >=2 distinct roots/parties, a lone weak kind, or disagreeing signals.
// "suggestie" is emitted DIRECTLY (RESEARCH Rec 3) — NOT via capBelowAuto (which only
// maps high→medium). The helper NEVER emits "high" on a degrade.
//
// RELAXATION (D-01 / Stage-2 transport rule LOCKED): the ONLY thing this helper does
// differently from the in-scope drop is OMIT the prefix-family (brand) filter — the
// candidate set is the same materialized resolve_candidates rows the in-scope
// back-search already fetched (the resolve_candidates env filter is the only boundary;
// no brand filter, no per-mailbox sibling allowlist — D-02). NO new SQL query, NO
// second lookupResolveCandidates call, NO swarm_type literal (SWARM-02).
//
// REPLAY-SAFETY (CLAUDE.md Inngest, mirrored from corroborate.ts): this module is
// PURE — no nested step.run, no Date.now / crypto.randomUUID, no DB key generation,
// no lookup. It consumes already-fetched res.matches as an argument and is
// deterministic over its inputs (Pitfall 3). Do NOT add side effects.
//
// GRANULARITY (CR-01): the number/invoice tiers dedupe on the ROOT (root_party_id ??
// party_id); self-auth dedupes on the DIRECT party_id. The caller selects via
// `granularity` so two parties under the SAME root still suggestie for self-auth.

import type { ResolveCandidateMatch } from "@/lib/automations/debtor-email/nxt-zap-client";
import { stripEnvPrefix } from "../strip-env-prefix";
import { isAutoEligibleStatus } from "./auto-gate";
import { scoreCorroboration, type CorroborationSignal } from "../corroborate";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";
import type { CrossScopeConfig, CorroborationConfig } from "../config";

/** The distinctness target — ROOT for number/invoice tiers, DIRECT party for self-auth. */
export type CrossScopeGranularity = "root" | "direct";

/**
 * The candidate kinds the ROOT-granularity drop sites (invoice + number back-search)
 * re-examine cross-scope. It spans the number back-search kinds (the strong AUTO
 * kinds) AND the sender corroboration kinds (email_domain / email_address) so the
 * helper can (a) AUTO on a unique strong kind, (b) corroborate a weak kind via a
 * 2nd independent strong kind on the same customer (D-03b), and (c) surface a lone
 * weak kind on the suggestie degrade (D-04). The brand filter is what is relaxed —
 * NOT the kind set. The strong-vs-weak distinction is made by auto_resolve_kinds.
 */
export const CROSS_SCOPE_ROOT_KINDS: readonly string[] = [
  "invoice_no",
  "po_no",
  "order_no",
  "job_no",
  "quote_no",
  "previous_customer_id",
  "email_domain",
  "email_address",
];

/** The config slice the cross-scope post-pass reads (free-form jsonb, presence-gated). */
export interface CrossScopeCallConfig {
  cross_scope?: CrossScopeConfig;
  corroboration?: CorroborationConfig;
  scope?: { environment_id?: string };
}

/**
 * Shared cross-scope decide. PURE over `matches` (already-fetched all-brand rows).
 *
 * @param matches            The all-brand resolve_candidates rows (NO brand filter — D-01).
 * @param eligibleKinds      The identifier_kinds this drop site considers (e.g. invoice_no).
 * @param config             The swarm resolution config (cross_scope + corroboration + scope).
 * @param args               ResolveArgs (mailbox brand_id for the misroute annotation).
 * @param matchedIdentifiers The identifiers extracted at the drop site (audit panel).
 * @param granularity        "root" (number/invoice) | "direct" (self-auth, CR-01).
 * @returns A ResolveResult (high AUTO + misroute, or suggestie + misroute), or null
 *          when there is nothing cross-scope to decide (caller keeps its own drop).
 */
export function resolveCrossScope(
  matches: ResolveCandidateMatch[],
  eligibleKinds: Iterable<string>,
  config: CrossScopeCallConfig,
  args: ResolveArgs,
  matchedIdentifiers: string[],
  granularity: CrossScopeGranularity,
): ResolveResult | null {
  const envId = config.scope?.environment_id ?? "BX";
  const eligible = new Set(eligibleKinds);

  // (1) Filter to eligible kinds + auto-eligible status across ALL brands. The
  // ABSENCE of a brand filter IS the relaxation (D-01). is_unique_in_scope is NOT
  // consulted — it asserts in-scope (per-brand) uniqueness, not cross-brand
  // uniqueness (Pitfall 2 / T-122-02); we compute distinctness directly below.
  const inScope = matches.filter(
    (m) => eligible.has(m.identifier_kind) && isAutoEligibleStatus(m.status),
  );
  if (inScope.length === 0) return null;

  // (2) Distinctness target by granularity (CR-01).
  const targetOf =
    granularity === "direct"
      ? (m: ResolveCandidateMatch) => m.party_id
      : (m: ResolveCandidateMatch) => m.root_party_id ?? m.party_id;
  const distinctTargets = Array.from(new Set(inScope.map(targetOf)));

  // (3) AUTO branch (D-08 + D-03a): exactly ONE distinct target AND a winning match
  // on a STRONG kind in auto_resolve_kinds. auto_resolve_kinds defaults to the
  // corroboration auto_safe_alone_kinds set the in-scope tier already trusts (DRY).
  const autoKinds = new Set(
    config.cross_scope?.auto_resolve_kinds ??
      config.corroboration?.auto_safe_alone_kinds ??
      [],
  );
  if (distinctTargets.length === 1) {
    const target = distinctTargets[0];
    const group = inScope.filter((m) => targetOf(m) === target);
    // Prefer a strong-kind row as the winner so a strong+weak mix (same customer)
    // still AUTOs on the strong kind.
    const strongWinner = group.find((m) => autoKinds.has(m.identifier_kind));
    if (strongWinner) {
      return buildCrossScopeResult(
        strongWinner,
        "high",
        envId,
        args,
        matchedIdentifiers,
        group,
      );
    }
  }

  // (4) Corroboration-auto branch (D-03b): a lone WEAK kind (not in auto_resolve_kinds)
  // corroborated by >=min_signals independent kinds on the SAME customer may AUTO.
  // Reuse scoreCorroboration VERBATIM — no new scorer. Only when explicitly not
  // disabled AND a corroboration config is present.
  if (
    config.cross_scope?.allow_corroboration_auto !== false &&
    config.corroboration
  ) {
    const signals: CorroborationSignal[] = inScope.map((m, i) => ({
      customer_account_id: targetOf(m),
      identifier_kind: m.identifier_kind,
      confidence: "high",
      method: "identifier_match",
      precedence_index: i,
      status: m.status,
      customer_name: m.party_name,
    }));
    const scored = scoreCorroboration(
      signals,
      args,
      config.corroboration,
      matchedIdentifiers,
    );
    if (scored.confidence === "high" && scored.customer_account_id) {
      const winner = inScope.find(
        (m) => targetOf(m) === scored.customer_account_id,
      );
      const group = inScope.filter(
        (m) => targetOf(m) === scored.customer_account_id,
      );
      return buildCrossScopeResult(
        winner ?? inScope[0],
        "high",
        envId,
        args,
        matchedIdentifiers,
        group,
      );
    }
  }

  // (5) DEGRADE branch (D-04 / D-05 / D-08): >=2 roots/parties, lone weak kind, or
  // disagreeing signals → SUGGESTIE, never high. Surface the FULL shortlist (D-07
  // rides on the candidate set) and annotate the misroute when a cross-brand winner
  // exists. Emit suggestie DIRECTLY — never route through capBelowAuto.
  // GAP-CLOSURE (122-05): distinctness is computed on the ROOT target (D-08), but
  // each shortlist entry surfaces the matched LEAF party_id (the actually-invoiced
  // debtor) — NOT the root. Dedupe by leaf so two leaves under one root list both.
  const shortlist: Candidate[] = [];
  const shortlistSeen = new Set<string>();
  for (const t of distinctTargets) {
    const m = inScope.find((x) => targetOf(x) === t)!;
    const c = candidateOf(m, envId);
    if (shortlistSeen.has(c.id)) continue;
    shortlistSeen.add(c.id);
    shortlist.push(c);
  }
  const best = inScope.find((m) => targetOf(m) === distinctTargets[0])!;
  return {
    method: "identifier_match",
    customer_account_id: shortlist[0]?.id ?? null,
    customer_name: best.party_name,
    confidence: "suggestie",
    candidates_considered: shortlist.length,
    environment_id: envId,
    ...misrouteAnnotation(best, args),
    inputs: {
      kind: "identifier_match",
      matched_identifiers: matchedIdentifiers,
      candidates: shortlist,
    },
  };
}

/**
 * Build a high (AUTO) cross-scope ResolveResult with the misroute annotation.
 *
 * GAP-CLOSURE (122-05): the `target` (root, D-08) drives ONLY the distinctness/
 * uniqueness bar at the call site. The RESOLVED customer is the winning LEAF
 * `party_id` (the actually-invoiced debtor) — NOT the root parent. Returning the
 * root produced the bucket-C confident-wrong (#98/#12/#38 each resolved to the
 * root of the correct leaf). `target` is intentionally NOT passed here anymore.
 */
function buildCrossScopeResult(
  winner: ResolveCandidateMatch,
  confidence: "high",
  envId: string,
  args: ResolveArgs,
  matchedIdentifiers: string[],
  group: ResolveCandidateMatch[],
): ResolveResult {
  const candidate = candidateOf(winner, envId);
  // Surface the whole resolved group so the audit panel renders the shortlist —
  // each candidate is its own LEAF party_id, deduped.
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const m of group) {
    const c = candidateOf(m, envId);
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    candidates.push(c);
  }
  if (candidates.length === 0) candidates.push(candidate);
  return {
    method: "identifier_match",
    customer_account_id: candidate.id,
    customer_name: winner.party_name,
    confidence,
    candidates_considered: 1,
    environment_id: envId,
    ...misrouteAnnotation(winner, args),
    inputs: {
      kind: "identifier_match",
      matched_identifiers: matchedIdentifiers,
      candidates,
    },
  };
}

/**
 * Build a Candidate from a match row — the env-stripped LEAF `party_id` (the
 * invoiced debtor), NOT the root. The root is the distinctness target only.
 */
function candidateOf(m: ResolveCandidateMatch, envId: string): Candidate {
  return {
    id: stripEnvPrefix(m.party_id, envId),
    name: m.party_name,
    contact_person: null,
    recent_invoices: [],
  };
}

/**
 * The cross_scope_misroute annotation (D-09) — set when the winner's resolved brand/
 * scope differs from the mailbox brand. resolved_brand = winner brand, mailbox_brand
 * = args.brand_id. Returns an empty object (no field) otherwise so the spread leaves
 * cross_scope_misroute absent (opt-out byte-identity, Pitfall 1).
 *
 * GAP-CLOSURE (122-05): resolver_index has NO brand_id column — the brand/scope
 * identity lives in scope_key. brand_id wins when present (no behaviour change); else
 * fall back to scope_key so the annotation fires on the live (null-brand) substrate.
 */
function misrouteAnnotation(
  winner: ResolveCandidateMatch,
  args: ResolveArgs,
): Pick<ResolveResult, "cross_scope_misroute"> | Record<string, never> {
  const resolvedBrand = winner.brand_id || winner.scope_key || null;
  if (resolvedBrand != null && resolvedBrand !== args.brand_id) {
    return {
      cross_scope_misroute: {
        resolved_brand: resolvedBrand,
        mailbox_brand: args.brand_id,
      },
    };
  }
  return {};
}
