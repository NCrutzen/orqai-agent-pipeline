// Phase 120 (D-06 multi-signal corroboration) — PURE deterministic scorer.
//
// scoreCorroboration() takes the candidates the engine COLLECTED across every
// precedence step (no first-hit short-circuit) and decides confidence
// deterministically, NO LLM call (D-03):
//   - BOOST to high on ≥min_signals INDEPENDENT-kind agreement (D-04 / D-05).
//   - DEMOTE below AUTO on independent-kind DISAGREEMENT (D-06).
//   - CAP a lone non-strong signal below AUTO, keep lone strong signals high (D-07).
//
// Purpose: make a confident WRONG customer (the cardinal Stage-2 failure) both
// rarer and falsifiable, without an LLM tiebreaker for the agreeing-signals case.
//
// REPLAY-SAFETY (CLAUDE.md Inngest): this module is PURE — no nested step.run,
// no Date.now / crypto.randomUUID, no DB key generation. It consumes already-
// fetched, already-resolved signals as an argument. The engine invokes it from
// inside the worker's existing step.run("resolve-…"). Do NOT add side effects.

import type {
  ResolveArgs,
  ResolveResult,
  ResolveMethod,
  Confidence,
  Candidate,
} from "./engine";
import type { CorroborationConfig } from "./config";
import { isAutoEligibleStatus } from "./steps/auto-gate";

/**
 * One collected candidate, mapped from a precedence step's ResolveResult by the
 * engine. `identifier_kind` is the D-05 independence axis (the kind the step
 * matched on; the engine synthesizes a per-step kind where the result lacks one).
 * `precedence_index` is the step's position in config.precedence (D-02 — still
 * selects the winner on disagreement).
 */
export interface CorroborationSignal {
  customer_account_id: string;
  identifier_kind: string;
  confidence: Confidence;
  method: ResolveMethod;
  precedence_index: number;
  status?: string | null;
  customer_name?: string | null;
}

/**
 * capBelowAuto — `high` IS the resolver-declared AUTO tier (self-auth-match.ts:159
 * emits `high` ONLY for an AUTO-eligible single-party hit; every ambiguity returns
 * null and never reaches `high`; eval FINDINGS.md:35,53-55 confirms AUTO==hoog).
 * So mapping high→medium genuinely removes the row from AUTO. Confidence is an
 * ENUM — never mutate a numeric threshold. Identity for every non-high tier so
 * demote/cap can only LOWER confidence, never raise it (T-120-02).
 */
function capBelowAuto(c: Confidence): Confidence {
  return c === "high" ? "medium" : c;
}

/**
 * Score a collected set of corroboration signals into a single ResolveResult.
 * PURE + deterministic — same inputs always yield the same output.
 */
export function scoreCorroboration(
  signals: CorroborationSignal[],
  args: ResolveArgs,
  config: CorroborationConfig,
  matchedIdentifiers: string[],
): ResolveResult {
  // (1) EMPTY → canonical unresolved (mirrors engine.ts zero-hit fallback).
  if (signals.length === 0) {
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: {
        kind: "unresolved",
        sender_email: args.from_email ?? null,
        matched_identifiers: matchedIdentifiers,
      },
    };
  }

  // (2) Group by customer; distinctKinds = the D-05 independence axis.
  const byCustomer = new Map<string, CorroborationSignal[]>();
  for (const s of signals) {
    const g = byCustomer.get(s.customer_account_id);
    if (g) g.push(s);
    else byCustomer.set(s.customer_account_id, [s]);
  }
  const distinctKinds = (group: CorroborationSignal[]) =>
    new Set(group.map((s) => s.identifier_kind));

  // T-120-03 — FLOOR guard: a malformed seed (min_signals=0 or 1) must never let
  // a lone signal "agree" with itself and auto-boost. Agreement requires ≥2.
  const agreeThreshold = Math.max(2, config.min_signals);

  // The lowest-precedence-index row of a group is its "winning" representative
  // (D-02 — precedence still picks the canonical customer/name/status).
  const winnerOf = (group: CorroborationSignal[]) =>
    group.reduce((a, b) => (b.precedence_index < a.precedence_index ? b : a));

  // (3) AGREEMENT (D-04) — evaluated BEFORE disagreement BY DESIGN (LOCKED
  // 2026-06-16, W3). An agreeing customer with ≥agreeThreshold distinct kinds
  // boosts even when a separate customer carries an independent signal. The named
  // eval targets (the 4 confident-wrong rows) are pure 2-signal disagreements
  // with NO agreeing majority, so acceptance is unaffected. A future
  // "disagreement-overrides-agreement" rule is DEFERRED — do NOT reorder.
  const agreeingCustomers = [...byCustomer.entries()].filter(
    ([, group]) => distinctKinds(group).size >= agreeThreshold,
  );
  if (agreeingCustomers.length === 1) {
    const [accountId, group] = agreeingCustomers[0];
    const winner = winnerOf(group);
    if (isAutoEligibleStatus(winner.status)) {
      // T-120-05 retained: only an auto-eligible status reaches the boost tier.
      return buildResult(
        accountId,
        winner,
        config.boost,
        `corroborated: ${distinctKinds(group).size} kinds`,
        matchedIdentifiers,
      );
    }
    // Non-auto-eligible winner → fall through to the capped path below.
    return buildResult(
      accountId,
      winner,
      capBelowAuto(winner.confidence),
      "lone-signal capped (status)",
      matchedIdentifiers,
    );
  }

  // (4) DISAGREEMENT (D-06) — ≥2 customers AND ≥2 distinct kinds overall. The
  // lowest-precedence-index signal selects the winner (precedence still decides,
  // D-02); confidence is capped below AUTO. capBelowAuto only lowers (T-120-02).
  if (byCustomer.size >= 2 && distinctKinds(signals).size >= 2) {
    const winner = signals.reduce((a, b) =>
      b.precedence_index < a.precedence_index ? b : a,
    );
    return buildResult(
      winner.customer_account_id,
      winner,
      capBelowAuto(winner.confidence),
      "demote: disagreement",
      matchedIdentifiers,
    );
  }

  // (5) LONE SIGNAL (D-07) — exactly one customer with < agreeThreshold distinct
  // kinds. A lone kind in auto_safe_alone_kinds keeps its native confidence;
  // otherwise it is capped below AUTO.
  const [accountId, group] = [...byCustomer.entries()][0];
  const winner = winnerOf(group);
  const autoSafeAlone = new Set(config.auto_safe_alone_kinds ?? []);
  const keepsHigh =
    autoSafeAlone.has(winner.identifier_kind) &&
    isAutoEligibleStatus(winner.status);
  return buildResult(
    accountId,
    winner,
    keepsHigh ? winner.confidence : capBelowAuto(winner.confidence),
    keepsHigh ? "lone strong signal" : "lone-signal capped",
    matchedIdentifiers,
  );
}

/**
 * Build a ResolveResult for a resolved customer. method/inputs.kind are the
 * LOCKED discriminated-union "identifier_match" shape carrying the matched
 * identifiers + a single Candidate. reason is a short deterministic audit string.
 */
function buildResult(
  customerAccountId: string,
  winner: CorroborationSignal,
  confidence: Confidence,
  reason: string,
  matchedIdentifiers: string[],
): ResolveResult {
  const candidate: Candidate = {
    id: customerAccountId,
    name: winner.customer_name ?? "",
    contact_person: null,
    recent_invoices: [],
  };
  return {
    method: "identifier_match",
    customer_account_id: customerAccountId,
    customer_name: winner.customer_name ?? null,
    confidence,
    reason,
    candidates_considered: 1,
    inputs: {
      kind: "identifier_match",
      matched_identifiers: matchedIdentifiers,
      candidates: [candidate],
    },
  };
}
