// Phase 90 (P0 resolver substrate) — Step module: identifier_match.
//
// 1:1 VERBATIM port of resolve-debtor.ts Layer 3 (:227-285). D-01/D-02.
//
// extract-invoices seed → invoice → paying customer. Same graceful per-layer
// .catch(() => ({matches:[]})) fall-through as Layer 2. Multiple invoice rows
// may resolve to the same top-level customer — dedupe by top_level_customer_id
// before single-vs-ambiguous. Single-hit short-circuits; ≥2 escalates to the
// LLM tiebreaker.
//
// NO extraction-guard hardening of any kind — the P1 precision guards
// (RESL-14) are deliberately absent in P0; adding them now would dirty the
// equality dry-run.
//
// The step also returns the extracted identifiers so the engine's `unresolved`
// fallback can populate inputs.matched_identifiers byte-identically to the
// legacy `invoices?.candidates ?? []` (resolve-debtor.ts:296).

import {
  lookupIdentifierToAccount,
  lookupCandidateDetails,
  type CandidateDetail,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";
import type { LlmTiebreak } from "./sender-match";

// Phase 82.9 — `toCandidate` (ported verbatim from resolve-debtor.ts:107-114).
function toCandidate(m: CandidateDetail): Candidate {
  return {
    id: m.id,
    name: m.name,
    contact_person: m.contact_person ?? null,
    recent_invoices: m.recent_invoices ?? [],
  };
}

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
 */
export async function runIdentifierMatch(
  args: ResolveArgs,
  llmTiebreak: LlmTiebreak,
): Promise<IdentifierMatchOutcome> {
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0 && args.brand_id) {
    const ids = await lookupIdentifierToAccount(
      {
        nxt_database: args.nxt_database,
        brand_id: args.brand_id,
        invoice_numbers: invoices.candidates,
      },
      "unknown",
    ).catch((err) => {
      console.warn(
        `[resolveDebtor] layer 3 (identifier) failed, falling through: ${err instanceof Error ? err.message : err}`,
      );
      return { matches: [] };
    });
    // Multiple invoice rows may resolve to the same top-level customer; dedupe.
    const uniqueCustomerIds = Array.from(
      new Set(ids.matches.map((m) => m.top_level_customer_id)),
    );
    if (uniqueCustomerIds.length === 1) {
      // Single paying customer — fetch its name for the label.
      const detail = await lookupCandidateDetails(
        {
          nxt_database: args.nxt_database,
          brand_id: args.brand_id,
          customer_ids: uniqueCustomerIds,
        },
        "unknown",
      );
      const m = detail.matches[0];
      // Phase 82.9 — map to rich Candidate for the audit panel.
      const richCandidate: Candidate = m
        ? toCandidate(m)
        : {
            id: uniqueCustomerIds[0],
            name: "",
            contact_person: null,
            recent_invoices: [],
          };
      return {
        result: {
          method: "identifier_match",
          customer_account_id: uniqueCustomerIds[0],
          customer_name: m?.name ?? null,
          confidence: "high",
          candidates_considered: 1,
          inputs: {
            kind: "identifier_match",
            matched_identifiers: invoices.candidates,
            candidates: [richCandidate],
          },
        },
        matched_identifiers: invoices.candidates,
      };
    }
    if (uniqueCustomerIds.length >= 2) {
      // Phase 82.9 — identifier-driven tiebreak; pass matched identifiers.
      return {
        result: await llmTiebreak(uniqueCustomerIds, args, {
          sender_email: args.from_email,
          matched_identifiers: invoices.candidates,
        }),
        matched_identifiers: invoices.candidates,
      };
    }
  }

  return { result: null, matched_identifiers: invoices.candidates };
}
