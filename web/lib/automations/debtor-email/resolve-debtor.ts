// Phase 56-00 (D-00, D-01, D-02, D-03). 4-layer debtor-resolution pipeline.
//
// Order (D-00):
//   1. thread_inheritance — most-recent prior label for the same conversation
//   2. sender_match       — NXT-Zap sender → contactperson → account
//   3. identifier_match   — extract-invoices.ts seed → NXT-Zap invoice → account
//   4. unresolved         — zero-hit, NO LLM call (D-03)
//
// Multi-candidate hits in layers 2 or 3 escalate to llm-tiebreaker with
// pre-fetched candidate details (D-12). Single-hit short-circuits (D-03).

import { createAdminClient } from "@/lib/supabase/admin";
import { callNxtZap, type NxtMatch } from "./nxt-zap-client";
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
  reason?: string; // present when method='llm_tiebreaker'
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

  // Layer 2: sender → contactperson → account (NEW PRIMARY per D-00).
  if (args.from_email) {
    const sender = await callNxtZap({
      nxt_database: args.nxt_database,
      lookup_kind: "sender_to_account",
      payload: { from_email: args.from_email },
    });
    if (sender.matches.length === 1) {
      const m = sender.matches[0];
      return {
        method: "sender_match",
        customer_account_id: m.customer_account_id,
        customer_name: m.customer_name,
        confidence: "high",
      };
    }
    if (sender.matches.length >= 2) {
      return await llmTiebreak(sender.matches, args);
    }
  }

  // Layer 3: identifier-parse (existing extract-invoices.ts seed; D-02).
  const invoices = extractInvoiceCandidates(args.subject, args.body_text);
  if (invoices.candidates.length > 0) {
    const ids = await callNxtZap({
      nxt_database: args.nxt_database,
      lookup_kind: "identifier_to_account",
      payload: { invoice_numbers: invoices.candidates },
    });
    if (ids.matches.length === 1) {
      const m = ids.matches[0];
      return {
        method: "identifier_match",
        customer_account_id: m.customer_account_id,
        customer_name: m.customer_name,
        confidence: "high",
      };
    }
    if (ids.matches.length >= 2) {
      return await llmTiebreak(ids.matches, args);
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
  matches: NxtMatch[],
  args: ResolveArgs,
): Promise<ResolveResult> {
  // Pre-fetch candidate details (D-12) — predictable cost, no agent loops.
  const details = await callNxtZap({
    nxt_database: args.nxt_database,
    lookup_kind: "candidate_details",
    payload: {
      customer_account_ids: matches.map((m) => m.customer_account_id),
    },
  });
  const out = await callTiebreaker({
    email_subject: args.subject,
    email_body: args.body_text,
    candidates: details.matches.map((m) => ({
      customer_account_id: m.customer_account_id,
      customer_name: m.customer_name,
      contactperson_name: m.contactperson_name,
      recent_invoices: m.recent_invoices,
      last_interaction: m.last_interaction,
    })),
  });
  const picked = details.matches.find(
    (m) => m.customer_account_id === out.selected_account_id,
  );
  return {
    method: "llm_tiebreaker",
    customer_account_id: out.selected_account_id,
    customer_name: picked?.customer_name ?? null,
    confidence: out.confidence,
    reason: out.reason,
    candidates_considered: matches.length,
  };
}
