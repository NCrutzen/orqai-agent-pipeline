// Phase 91 (RESL-07) — Step module: self_auth (the high-precision AUTO tier).
//
// THE CARDINAL CONSTRAINT (T-91-09): this step must NEVER inject a confident
// wrong customer. It emits an AUTO resolution ONLY when a SINGLE distinct
// in-scope party resolves AND that party's brand prefix-family matches the
// mailbox brand scope. EVERY ambiguity class fails CLOSED to SUGGEST — the step
// returns `null` so the engine falls through to the lower-precedence steps:
//   - >=2 distinct in-scope parties               → null (D-11)
//   - cross-brand collision (is_unique_in_scope=false) → null
//   - prefix-family mismatch vs the mailbox brand → null
//   - lookup error / timeout (.catch fall-through) → null
// There is NO LLM tiebreaker at this tier (the SUGGEST/tiebreak path stays on the
// lower-precision identifier/sender steps, not here).
//
// Rollup (D-04): self-auth ids are stamped by US — the exact id is the DIRECT
// customer, so this step uses `party_id` directly (NOT root_party_id; that is the
// number-back-search rollup in identifier-match.ts).
//
// Id-space (D-01/D-02): the substrate returns composite party ids ("BX593290").
// customer_account_id is the env-stripped numeric ("593290"); the environment_id
// ("BX") is carried ALONGSIDE on the result so a future
// (environment_id, customer_account_id) key needs no migration.
//
// Swarm-agnostic (D-08): the step carries NO debtor literals — environment_id,
// brand_scope, and the eligible kinds (auto_safe_kinds) ALL come from config.
//
// Replay-safety: invoked inside the worker's step.run("resolve-debtor", …);
// NEVER add a nested step.run. nxt-zap-client generates requestId internally.

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { extractSelfAuthCandidates } from "@/lib/automations/debtor-email/extract-self-auth";
import { stripEnvPrefix } from "../strip-env-prefix";
import { isAutoEligibleStatus } from "./auto-gate";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";

/**
 * The config slice the self_auth step reads. Everything is swarm-agnostic
 * config (D-08): `scope.environment_id` (D-01 strip), `scope.brand_scope`
 * (prefix-family tiebreaker), and `auto_safe_kinds` (which self-auth kinds are
 * eligible for AUTO). No debtor literals.
 */
export interface SelfAuthConfig {
  scope: {
    environment_id: string;
    brand_scope?: string[] | null;
  };
  auto_safe_kinds?: string[];
}

/**
 * The mailbox-brand prefix-family check. A resolved candidate is in the mailbox
 * prefix-family iff its brand_id is null/unknown (no brand to contradict) OR it
 * is one of the in-scope brands (the mailbox brand + the per-mailbox widening).
 */
function inPrefixFamily(
  candidateBrand: string | null | undefined,
  inScopeBrands: Set<string>,
): boolean {
  if (candidateBrand == null || candidateBrand === "") return true;
  return inScopeBrands.has(candidateBrand);
}

/**
 * self_auth (RESL-07) — high-precision AUTO tier. Returns a ResolveResult ONLY on
 * a single distinct in-scope party with a matching prefix-family; returns `null`
 * (SUGGEST) on ANY ambiguity so the engine falls through. NEVER escalates to the
 * LLM tiebreaker.
 */
export async function runSelfAuthMatch(
  args: ResolveArgs,
  config: SelfAuthConfig,
): Promise<ResolveResult | null> {
  // NXT disabled for this mailbox → no AUTO possible. Fail closed.
  if (!args.brand_id) return null;

  // RESL-03 no-op preserved INSIDE the step: zero eligible kinds → never consult
  // the substrate, return null. The empty-config case must not crash.
  const eligibleKinds = config.auto_safe_kinds ?? [];
  if (eligibleKinds.length === 0) return null;

  // Extract self-auth id candidates (pure, replay-safe). The extractor surfaces
  // ALL distinct ids; the AUTO gate below fails closed on >=2 distinct parties.
  const extract = extractSelfAuthCandidates(args.subject, args.body_text);
  const identifiers = extract.candidates;
  if (identifiers.length === 0) return null;

  // Single indexed read against the materialized resolve_candidates substrate.
  // Verbatim graceful fall-through (identifier-match.ts:65-70): a lookup
  // error/timeout degrades to zero matches → null (does NOT crash, does NOT
  // force AUTO). This is what keeps thread_inheritance un-stranded (Pitfall 3).
  const res = await lookupResolveCandidates(
    {
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      environment_id: config.scope.environment_id,
      identifiers,
      brand_scope: args.brand_scope,
    },
    "unknown",
  ).catch((err) => {
    console.warn(
      `[resolve] self_auth step failed, falling through: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // AUTO gate. Only consider the kinds this swarm marks auto-safe (D-08), and
  // only candidates the proc deemed unique within the requested brand scope
  // (cross-brand collisions arrive with is_unique_in_scope=false → excluded →
  // never AUTO).
  // WR-03 (Phase 91 review) — exclude STOPPED/inactive customers from AUTO even
  // when the proc marks them unique-in-scope: a self-auth stamp resolving to a
  // closed/inactive account must fail closed to SUGGEST. Status is per-row.
  const eligibleSet = new Set(eligibleKinds);
  const inScope = res.matches.filter(
    (m) =>
      eligibleSet.has(m.identifier_kind) &&
      m.is_unique_in_scope &&
      isAutoEligibleStatus(m.status),
  );
  if (inScope.length === 0) return null;

  // Dedupe to distinct DIRECT parties (D-04: self-auth → direct party_id, NOT
  // root_party_id). >=2 distinct parties is the cardinal ambiguity → SUGGEST.
  const distinctParties = Array.from(new Set(inScope.map((m) => m.party_id)));
  if (distinctParties.length !== 1) return null;

  // Prefix-family gate: the single resolved party's brand must match the mailbox
  // brand scope. A self-auth id forwarded cross-brand resolving to another
  // brand's customer fails CLOSED (T-91-10).
  const inScopeBrands = new Set<string>([
    args.brand_id,
    ...(args.brand_scope ?? []),
  ]);
  const winner = inScope.find((m) => m.party_id === distinctParties[0])!;
  if (!inPrefixFamily(winner.brand_id, inScopeBrands)) return null;

  // AUTO. D-01: strip the env prefix to the numeric id. D-02: carry the
  // environment_id alongside (from config — D-08).
  const customer_account_id = stripEnvPrefix(
    winner.party_id,
    config.scope.environment_id,
  );

  const candidate: Candidate = {
    id: customer_account_id,
    name: winner.party_name,
    contact_person: null,
    recent_invoices: [],
  };

  return {
    method: "self_auth",
    customer_account_id,
    customer_name: winner.party_name,
    confidence: "high",
    candidates_considered: 1,
    environment_id: config.scope.environment_id,
    inputs: {
      kind: "self_auth",
      matched_identifiers: identifiers,
      candidates: [candidate],
    },
  };
}
