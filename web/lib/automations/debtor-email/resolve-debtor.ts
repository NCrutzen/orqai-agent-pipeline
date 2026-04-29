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

export interface ResolveResult {
  method: ResolveMethod;
  customer_account_id: string | null;
  customer_name: string | null;
  confidence: Confidence;
  reason?: string;
  candidates_considered?: number;
}

export async function resolveDebtor(args: ResolveArgs): Promise<ResolveResult> {
  const admin = createAdminClient();

  // Layer 1: thread inheritance (D-00).
  if (args.conversation_id) {
    const { data: prior } = await admin
      .schema("debtor")
      .from("email_labels")
      .select("customer_account_id, debtor_id, debtor_name")
      .eq("conversation_id", args.conversation_id)
      .or("customer_account_id.not.is.null,debtor_id.not.is.null")
      .in("status", ["labeled", "dry_run"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const accountId =
      (prior as { customer_account_id?: string | null; debtor_id?: string | null } | null)
        ?.customer_account_id ?? (prior as { debtor_id?: string | null } | null)?.debtor_id ?? null;
    if (accountId) {
      return {
        method: "thread_inheritance",
        customer_account_id: accountId,
        customer_name:
          (prior as { debtor_name?: string | null } | null)?.debtor_name ?? null,
        confidence: "high",
      };
    }
  }

  // Layer 2: sender → contactperson → top-level customer.
  // Multiple contact_person rows may belong to the same paying customer
  // (e.g., one company with several contacts). Dedupe by top_level_customer_id
  // before deciding single vs ambiguous.
  // Skipped if brand_id not configured for this mailbox.
  if (args.from_email && args.brand_id) {
    const sender = await lookupSenderToAccount({
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      sender_email: args.from_email,
    });
    const uniqueIds = Array.from(
      new Set(sender.matches.map((m) => m.top_level_customer_id)),
    );
    if (uniqueIds.length === 1 && sender.matches.length >= 1) {
      const m = sender.matches[0];
      return {
        method: "sender_match",
        customer_account_id: m.top_level_customer_id,
        customer_name: m.top_level_customer_name,
        confidence: "high",
      };
    }
    if (uniqueIds.length >= 2) {
      return await llmTiebreak(uniqueIds, args);
    }
  }

  // Layer 3: identifier-parse → paying customer (D-02).
  // Skipped if brand_id not configured for this mailbox.
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0 && args.brand_id) {
    const ids = await lookupIdentifierToAccount({
      nxt_database: args.nxt_database,
      brand_id: args.brand_id,
      invoice_numbers: invoices.candidates,
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
      });
      const m = detail.matches[0];
      return {
        method: "identifier_match",
        customer_account_id: uniqueCustomerIds[0],
        customer_name: m?.name ?? null,
        confidence: "high",
      };
    }
    if (uniqueCustomerIds.length >= 2) {
      return await llmTiebreak(uniqueCustomerIds, args);
    }
  }

  // Layer 4: zero-hit → unresolved (D-03: NO LLM call).
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
  };
}

async function llmTiebreak(
  customerIds: string[],
  args: ResolveArgs,
): Promise<ResolveResult> {
  if (!args.brand_id) {
    // Should not happen — caller already gated layers 2/3 on brand_id.
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
    };
  }
  // Pre-fetch candidate details (D-12) — predictable cost, no agent loops.
  const details = await lookupCandidateDetails({
    nxt_database: args.nxt_database,
    brand_id: args.brand_id,
    customer_ids: customerIds,
  });
  const out = await callTiebreaker({
    email_subject: args.subject,
    email_body: args.body_text,
    candidates: details.matches.map(toTiebreakerCandidate),
  });
  const picked = details.matches.find((m) => m.id === out.selected_account_id);
  return {
    method: "llm_tiebreaker",
    customer_account_id: out.selected_account_id,
    customer_name: picked?.name ?? null,
    confidence: out.confidence,
    reason: out.reason,
    candidates_considered: customerIds.length,
  };
}

function toTiebreakerCandidate(m: CandidateDetail) {
  return {
    customer_account_id: m.id,
    customer_name: m.name,
    // contact_person/recent_invoices/last_interaction not in CandidateDetail
    // shape today — left undefined, the LLM tiebreaker handles missing fields.
  };
}
