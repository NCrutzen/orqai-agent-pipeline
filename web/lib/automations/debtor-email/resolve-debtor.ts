// Phase 56-00 (D-00, D-01, D-02, D-03). 4-layer debtor-resolution pipeline.
//
// Order (D-00):
//   1. thread_inheritance — most-recent prior label for the same conversation
//   2. sender_match       — NXT sender → contact_person → top-level customer
//   3. identifier_match   — extract-invoices.ts seed → invoice → paying customer
//   4. unresolved         — zero-hit, NO LLM call (D-03)
//
// Multi-candidate hits in layers 2 or 3 escalate to llm-tiebreaker with
// pre-fetched candidate details (D-12). Single-hit short-circuits (D-03).
//
// 2026-04-29: migrated to async-callback nxt-zap-client. Match shape uses
// top_level_customer_id (was: customer_account_id). External ResolveResult
// keeps the customer_account_id field name — that's the public contract.
//
// Phase 82.9 (Plan 02): widened ResolveResult with a discriminated `inputs`
// field (D-01). Layer-2 single-hit now fetches candidate details so the
// Stage-2 audit panel can render contact_person + recent_invoices. The new
// fetch stays inside resolveDebtor (which the caller invokes from inside
// step.run("resolve-debtor", ...)) for replay-safety — DO NOT add a nested
// step.run here.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  lookupSenderToAccount,
  lookupIdentifierToAccount,
  lookupCandidateDetails,
  type CandidateDetail,
} from "./nxt-zap-client";
import { callTiebreaker } from "./llm-tiebreaker";
import { extractInvoiceCandidates } from "./extract-invoices";

export type ResolveMethod =
  | "thread_inheritance"
  | "sender_match"
  | "identifier_match"
  | "llm_tiebreaker"
  | "unresolved";

export type Confidence = "high" | "medium" | "low" | "none";

export interface ResolveArgs {
  nxt_database: string;
  brand_id: string | null; // null = NXT lookups disabled for this mailbox
  conversation_id: string | null;
  from_email: string | null;
  subject: string;
  body_text: string;
}

// Phase 82.9 (D-03) — richer candidate shape for Stage 2 audit panel.
// `recent_invoices` is bounded to <=5 newest-first by the mapper / Zap.
export type Candidate = {
  id: string;
  name: string;
  contact_person: string | null;
  recent_invoices: string[];
};

// Phase 82.9 (D-01) — discriminated union; `kind` mirrors the outer `method`
// so illegal combinations are caught at compile time.
export type Stage2Inputs =
  | {
      kind: "thread_inheritance";
      prior_email_label_id: string;
      conversation_id: string;
    }
  | {
      kind: "sender_match";
      sender_email: string;
      candidates: Candidate[];
    }
  | {
      kind: "identifier_match";
      matched_identifiers: string[];
      candidates: Candidate[];
    }
  | {
      kind: "llm_tiebreaker";
      sender_email: string | null;
      matched_identifiers: string[];
      candidates: Candidate[];
      llm_reason: string;
    }
  | {
      kind: "unresolved";
      sender_email: string | null;
      matched_identifiers: string[];
    };

export interface ResolveResult {
  method: ResolveMethod;
  customer_account_id: string | null;
  customer_name: string | null;
  confidence: Confidence;
  reason?: string;
  candidates_considered?: number;
  // Phase 82.9 — discriminated via `inputs.kind === method`.
  inputs: Stage2Inputs;
}

// Phase 82.9 — `toCandidate` replaces the old `toTiebreakerCandidate` helper.
function toCandidate(m: CandidateDetail): Candidate {
  return {
    id: m.id,
    name: m.name,
    contact_person: m.contact_person ?? null,
    recent_invoices: m.recent_invoices ?? [],
  };
}

export async function resolveDebtor(args: ResolveArgs): Promise<ResolveResult> {
  const admin = createAdminClient();

  // Layer 1: thread inheritance (D-00).
  if (args.conversation_id) {
    const { data: prior } = await admin
      .schema("debtor")
      .from("email_labels")
      // Phase 82.9 — include id so we can persist prior_email_label_id in inputs.
      .select("id, customer_account_id, debtor_id, debtor_name")
      .eq("conversation_id", args.conversation_id)
      .or("customer_account_id.not.is.null,debtor_id.not.is.null")
      .in("status", ["labeled", "dry_run"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priorRow = prior as
      | {
          id?: string | null;
          customer_account_id?: string | null;
          debtor_id?: string | null;
          debtor_name?: string | null;
        }
      | null;
    const accountId =
      priorRow?.customer_account_id ?? priorRow?.debtor_id ?? null;
    if (accountId) {
      // Phase 82.9 — populate discriminated inputs for thread_inheritance.
      return {
        method: "thread_inheritance",
        customer_account_id: accountId,
        customer_name: priorRow?.debtor_name ?? null,
        confidence: "high",
        inputs: {
          kind: "thread_inheritance",
          prior_email_label_id: priorRow?.id ?? "",
          conversation_id: args.conversation_id,
        },
      };
    }
  }

  // Layer 2: sender → contactperson → top-level customer.
  // Multiple contact_person rows may belong to the same paying customer
  // (e.g., one company with several contacts). Dedupe by top_level_customer_id
  // before deciding single vs ambiguous.
  // Skipped if brand_id not configured for this mailbox.
  // On lookup error/timeout — fall through to layer 3 instead of failing the
  // whole resolver. Layer-2 timeouts shouldn't block invoice matching.
  if (args.from_email && args.brand_id) {
    const sender = await lookupSenderToAccount({
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      sender_email: args.from_email,
    }, "unknown").catch((err) => {
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

  // Layer 3: identifier-parse → paying customer (D-02).
  // Skipped if brand_id not configured for this mailbox.
  // Same graceful-fallback as layer 2.
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0 && args.brand_id) {
    const ids = await lookupIdentifierToAccount({
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      invoice_numbers: invoices.candidates,
    }, "unknown").catch((err) => {
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
      const detail = await lookupCandidateDetails({
        nxt_database: args.nxt_database,
        brand_id: args.brand_id,
        customer_ids: uniqueCustomerIds,
      }, "unknown");
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
      };
    }
    if (uniqueCustomerIds.length >= 2) {
      // Phase 82.9 — identifier-driven tiebreak; pass matched identifiers.
      return await llmTiebreak(uniqueCustomerIds, args, {
        sender_email: args.from_email,
        matched_identifiers: invoices.candidates,
      });
    }
  }

  // Layer 4: zero-hit → unresolved (D-03: NO LLM call).
  // Phase 82.9 — discriminated inputs even on unresolved path.
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
    inputs: {
      kind: "unresolved",
      sender_email: args.from_email ?? null,
      matched_identifiers: invoices?.candidates ?? [],
    },
  };
}

async function llmTiebreak(
  customerIds: string[],
  args: ResolveArgs,
  // Phase 82.9 — caller threads through sender_email + matched_identifiers
  // so the discriminated inputs payload is faithful to the call path.
  ctx: { sender_email: string | null; matched_identifiers: string[] },
): Promise<ResolveResult> {
  if (!args.brand_id) {
    // Should not happen — caller already gated layers 2/3 on brand_id.
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: {
        kind: "unresolved",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
      },
    };
  }
  // Pre-fetch candidate details (D-12) — predictable cost, no agent loops.
  // Phase 82.9 — fetch failure → degrade to empty candidates + sentinel reason.
  const details = await lookupCandidateDetails(
    {
      nxt_database: args.brand_id ? args.nxt_database : args.nxt_database,
      brand_id: args.brand_id,
      customer_ids: customerIds,
    },
    "unknown",
  ).catch((err) => {
    console.warn(
      `[resolveDebtor] llmTiebreak candidate-details fetch failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  });
  if (!details) {
    return {
      method: "llm_tiebreaker",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: customerIds.length,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
        candidates: [],
        llm_reason: "candidate-details fetch failed",
      },
    };
  }
  const richCandidates = details.matches.map(toCandidate);
  let out: Awaited<ReturnType<typeof callTiebreaker>>;
  try {
    out = await callTiebreaker({
      email_subject: args.subject,
      email_body: args.body_text,
      candidates: details.matches.map((m) => ({
        customer_account_id: m.id,
        customer_name: m.name,
      })),
    });
  } catch (err) {
    // Phase 82.9 — preserve existing failure semantics (no throw) while
    // still populating a valid `inputs.kind = "llm_tiebreaker"`.
    return {
      method: "llm_tiebreaker",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: customerIds.length,
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: ctx.sender_email,
        matched_identifiers: ctx.matched_identifiers,
        candidates: richCandidates,
        llm_reason: `llm tiebreaker failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
  const picked = details.matches.find((m) => m.id === out.selected_account_id);
  return {
    method: "llm_tiebreaker",
    customer_account_id: out.selected_account_id,
    customer_name: picked?.name ?? null,
    confidence: out.confidence,
    reason: out.reason,
    candidates_considered: customerIds.length,
    // Phase 82.9 — propagate the LLM verdict text (D-02) + candidates.
    inputs: {
      kind: "llm_tiebreaker",
      sender_email: ctx.sender_email,
      matched_identifiers: ctx.matched_identifiers,
      candidates: richCandidates,
      llm_reason: out.reason,
    },
  };
}
