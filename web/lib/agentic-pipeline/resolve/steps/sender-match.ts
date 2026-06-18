// Phase 123 (RESL-UNIFY-01/02) — Step module: sender_match.
//
// Rewired onto the single generic nxt.resolve_candidates substrate (resolver_index
// SQL). The legacy contact_person→top_level chain (the retired contact_lookup
// wrapper) is GONE: sender resolution is now an `email_domain` /
// `email_address` back-search over resolver_index — the dominant error source per
// FINDINGS.md (sender/domain = 21% accuracy), so this is the behavior change Plan
// 04's eval gate scores.
//
// THE CARDINAL CONSTRAINT: this step must NEVER inject a confident wrong customer.
// It emits a `high` (AUTO-eligible) resolution ONLY when a SINGLE distinct in-scope
// party resolves AND that party's brand prefix-family matches the mailbox brand
// scope. EVERY ambiguity class fails CLOSED:
//   - >=2 distinct parties (across email_address / email_domain rows) → escalate to
//     the LLM tiebreaker (preserves the historic sender ≥2 → tiebreak escalation),
//   - cross-brand / prefix-family mismatch on the lone party → null (SUGGEST),
//   - lookup error / timeout (.catch fall-through) → null,
//   - brand_id null OR from_email null OR config/scope absent → null (NXT disabled).
//
// Address-first precedence (D-decision): a unique email_address hit OUTRANKS a
// domain hit. Both seeds go in ONE resolve_candidates call; the returned rows are
// disambiguated by kind (email_address before email_domain).
//
// Id-space (D-01/D-02): the substrate returns composite party ids ("BX593290").
// customer_account_id is the env-stripped numeric ("593290"); the environment_id
// ("BX") is carried ALONGSIDE on the result (D-02).
//
// Swarm-agnostic (SWARM-02): no debtor/sales literals — environment_id, brand_scope
// come from config + args. NO if(swarm==='...') branch.
//
// Replay-safety: invoked inside the worker's step.run("resolve-…"); NEVER add a
// nested step.run. nxt-zap-client generates requestId internally.

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { stripEnvPrefix } from "../strip-env-prefix";
import { isAutoEligibleStatus } from "./auto-gate";
import type { SelfAuthConfig } from "./self-auth-match";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";

/** The verbatim multi-candidate escalation, injected by the engine. */
export type LlmTiebreak = (
  customerIds: string[],
  args: ResolveArgs,
  ctx: { sender_email: string | null; matched_identifiers: string[] },
) => Promise<ResolveResult>;

// The two resolver_index identifier kinds the sender back-search consults.
const SENDER_KINDS = new Set(["email_address", "email_domain"]);

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
 * Layer 2 — sender_match. Resolves a sender via an email_domain/email_address
 * back-search over resolve_candidates. Returns a ResolveResult on a single-hit or
 * a tiebreaker escalation, else `null` to fall through to the next step.
 *
 * `config` carries scope.environment_id (D-01 strip) + scope.brand_scope
 * (prefix-family tiebreaker). When absent the step no-ops (returns null) — it
 * cannot resolve without environment_id (equivalent to "NXT disabled").
 */
export async function runSenderMatch(
  args: ResolveArgs,
  llmTiebreak: LlmTiebreak,
  config?: SelfAuthConfig,
): Promise<ResolveResult | null> {
  // NXT disabled / no sender / no scope → cannot resolve. Fail closed.
  if (!args.brand_id || !args.from_email || !config) return null;

  const address = args.from_email.trim().toLowerCase();
  if (address === "") return null;
  const atIdx = address.lastIndexOf("@");
  const domain = atIdx >= 0 ? address.slice(atIdx + 1) : "";

  // Both seeds in ONE call: the full address (email_address) AND the bare domain
  // (email_domain). Address-first precedence is applied on the returned rows.
  const identifiers = domain ? [address, domain] : [address];

  // Single indexed read. Verbatim graceful fall-through: a lookup error/timeout
  // degrades to zero matches → null (does NOT crash, does NOT force a resolve).
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
      `[resolve] sender_match step failed, falling through: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // Consider only the sender kinds the proc deemed unique-in-scope AND an
  // auto-eligible status (cross-brand collisions arrive is_unique_in_scope=false →
  // excluded; stopped/closed accounts excluded).
  const inScope = res.matches.filter(
    (m) =>
      SENDER_KINDS.has(m.identifier_kind) &&
      m.is_unique_in_scope &&
      isAutoEligibleStatus(m.status),
  );
  if (inScope.length === 0) return null;

  // Address-first precedence: if any email_address row resolves, decide on those
  // rows alone; otherwise fall back to the email_domain rows.
  const addressRows = inScope.filter((m) => m.identifier_kind === "email_address");
  const decisionRows = addressRows.length > 0 ? addressRows : inScope;

  // Dedupe to distinct parties. >=2 distinct → ambiguous → escalate to the LLM
  // tiebreaker (preserve the historic sender ≥2 → tiebreak; no matched ids).
  const distinctParties = Array.from(
    new Set(decisionRows.map((m) => m.party_id)),
  );
  if (distinctParties.length >= 2) {
    return await llmTiebreak(distinctParties, args, {
      sender_email: args.from_email,
      matched_identifiers: [],
    });
  }

  // Single distinct party. Prefix-family gate against the mailbox brand scope.
  const inScopeBrands = new Set<string>([
    args.brand_id,
    ...(args.brand_scope ?? []),
  ]);
  const winner = decisionRows.find((m) => m.party_id === distinctParties[0])!;
  if (!inPrefixFamily(winner.brand_id, inScopeBrands)) return null;

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
    method: "sender_match",
    customer_account_id,
    customer_name: winner.party_name,
    confidence: "high",
    candidates_considered: 1,
    environment_id: config.scope.environment_id,
    inputs: {
      kind: "sender_match",
      sender_email: args.from_email,
      candidates: [candidate],
    },
  };
}
