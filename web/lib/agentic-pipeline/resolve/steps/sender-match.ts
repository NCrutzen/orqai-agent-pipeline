// Phase 90 (P0 resolver substrate) — Step module: sender_match.
//
// 1:1 VERBATIM port of resolve-debtor.ts Layer 2 (:159-225). D-01/D-02.
//
// sender → contact_person → top-level customer. Multiple contact_person rows
// may belong to the same paying customer; dedupe by top_level_customer_id
// before deciding single vs ambiguous. Skipped if brand_id not configured.
// On lookup error/timeout the per-layer .catch(() => ({matches:[]})) falls
// through (a layer-2 timeout must NOT fail the whole resolver).
//
// Multi-candidate (≥2) escalates to the LLM tiebreaker (passed in by the
// engine so the verbatim tiebreak logic lives in ONE place).

import {
  lookupSenderToAccount,
  lookupCandidateDetails,
  type CandidateDetail,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import type { ResolveArgs, ResolveResult, Candidate } from "../engine";

// Phase 82.9 — `toCandidate` (ported verbatim from resolve-debtor.ts:107-114).
function toCandidate(m: CandidateDetail): Candidate {
  return {
    id: m.id,
    name: m.name,
    contact_person: m.contact_person ?? null,
    recent_invoices: m.recent_invoices ?? [],
  };
}

/** The verbatim multi-candidate escalation, injected by the engine. */
export type LlmTiebreak = (
  customerIds: string[],
  args: ResolveArgs,
  ctx: { sender_email: string | null; matched_identifiers: string[] },
) => Promise<ResolveResult>;

/**
 * Layer 2 — sender_match (D-00). Returns a ResolveResult on a single-hit or a
 * tiebreaker escalation, else `null` to fall through to the next step.
 */
export async function runSenderMatch(
  args: ResolveArgs,
  llmTiebreak: LlmTiebreak,
): Promise<ResolveResult | null> {
  if (args.from_email && args.brand_id) {
    const sender = await lookupSenderToAccount(
      {
        nxt_database: args.nxt_database,
        brand_id: args.brand_id,
        sender_email: args.from_email,
      },
      "unknown",
    ).catch((err) => {
      console.warn(
        `[resolveDebtor] layer 2 (sender) failed, falling through: ${err instanceof Error ? err.message : err}`,
      );
      return { matches: [] };
    });
    const uniqueIds = Array.from(
      new Set(sender.matches.map((m) => m.top_level_customer_id)),
    );
    if (uniqueIds.length === 1 && sender.matches.length >= 1) {
      const m = sender.matches[0];
      // Phase 82.9 — single-hit fetch candidate detail for audit panel.
      // Wrapped in try/catch: on fetch failure, degrade gracefully to a
      // slim Candidate. Resolver MUST still return sender_match (T-82.9-06).
      const detail = await lookupCandidateDetails(
        {
          nxt_database: args.nxt_database,
          brand_id: args.brand_id,
          customer_ids: [m.top_level_customer_id],
        },
        "unknown",
      ).catch((err) => {
        console.warn(
          `[resolveDebtor] layer 2 single-hit candidate-details fetch failed, using slim fallback: ${err instanceof Error ? err.message : err}`,
        );
        return null;
      });
      const richCandidate: Candidate = detail?.matches[0]
        ? toCandidate(detail.matches[0])
        : {
            id: m.top_level_customer_id,
            name: m.top_level_customer_name,
            contact_person: null,
            recent_invoices: [],
          };
      return {
        method: "sender_match",
        customer_account_id: m.top_level_customer_id,
        customer_name: m.top_level_customer_name,
        confidence: "high",
        candidates_considered: 1,
        inputs: {
          kind: "sender_match",
          sender_email: args.from_email!,
          candidates: [richCandidate],
        },
      };
    }
    if (uniqueIds.length >= 2) {
      // Phase 82.9 — sender-driven tiebreak: no identifiers in play.
      return await llmTiebreak(uniqueIds, args, {
        sender_email: args.from_email,
        matched_identifiers: [],
      });
    }
  }

  return null;
}
